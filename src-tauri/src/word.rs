use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::{Cursor, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use uuid::Uuid;
use zip::ZipArchive;

const MAX_FILE: u64 = 30 * 1024 * 1024;
const MAX_EXPANDED: u64 = 120 * 1024 * 1024;
static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub fn local_fonts() -> Vec<Value> {
    let root = PathBuf::from(std::env::var_os("WINDIR").unwrap_or_default()).join("Fonts");
    [
        ("Times New Roman", 400, "normal", "times.ttf"),
        ("Times New Roman", 700, "normal", "timesbd.ttf"),
        ("Times New Roman", 400, "italic", "timesi.ttf"),
        ("Times New Roman", 700, "italic", "timesbi.ttf"),
        ("Arial", 400, "normal", "arial.ttf"),
        ("Arial", 700, "normal", "arialbd.ttf"),
        ("Arial", 400, "italic", "ariali.ttf"),
        ("Arial", 700, "italic", "arialbi.ttf"),
        ("Calibri", 400, "normal", "calibri.ttf"),
        ("Calibri", 700, "normal", "calibrib.ttf"),
        ("Calibri", 400, "italic", "calibrii.ttf"),
        ("Calibri", 700, "italic", "calibriz.ttf"),
        ("Cambria", 400, "normal", "cambria.ttc"),
        ("Cambria", 700, "normal", "cambriab.ttf"),
        ("Cambria", 400, "italic", "cambriai.ttf"),
        ("Cambria", 700, "italic", "cambriaz.ttf"),
    ]
    .into_iter()
    .filter_map(|(family, weight, style, file)| {
        let path = root.join(file);
        let bytes = fs::read(path).ok()?;
        if bytes.len() > 8 * 1024 * 1024 { return None; }
        Some(json!({"family":family,"weight":weight,"style":style,"bytesBase64":STANDARD.encode(bytes)}))
    })
    .collect()
}

#[derive(Default)]
pub struct State {
    external: Mutex<HashSet<PathBuf>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: u64,
    pub topic: String,
    pub kind: String,
    pub error: Option<String>,
}

fn library_path() -> Result<PathBuf, String> {
    Ok(crate::storage::user_dir()?.join("word-library.json"))
}
fn library() -> Result<Value, String> {
    let file = library_path()?;
    if !file.exists() {
        return Ok(json!({"templates":{},"recent":[]}));
    }
    serde_json::from_slice(&fs::read(file).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
fn save_library(value: &Value) -> Result<(), String> {
    let file = library_path()?;
    fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
    if file.exists() {
        let backup = file.with_extension("json.b6h-word-backup");
        if !backup.exists() {
            fs::copy(&file, backup).map_err(|e| e.to_string())?;
        }
    }
    let temp = file.with_extension(format!("{}.tmp", Uuid::new_v4()));
    fs::write(
        &temp,
        serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(temp, file).map_err(|e| e.to_string())
}
fn path_setting(key: &str) -> Result<PathBuf, String> {
    let value = crate::storage::word_settings()?[key]
        .as_str()
        .ok_or("Word folder is not configured.")?
        .to_owned();
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err("Choose an absolute Word folder.".into());
    }
    Ok(path)
}
fn safe_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty()
        || name.chars().count() > 150
        || name.ends_with(['.', ' '])
        || name
            .chars()
            .any(|c| c.is_control() || "\\/:*?\"<>|".contains(c))
    {
        return Err("Choose a valid document name.".into());
    }
    let base = if name.to_ascii_lowercase().ends_with(".docx") {
        &name[..name.len() - 5]
    } else {
        name
    };
    if base.is_empty() || base.ends_with('.') {
        return Err("Choose a valid document name.".into());
    }
    let device = base.split('.').next().unwrap_or("").to_ascii_uppercase();
    if ["CON", "PRN", "AUX", "NUL"].contains(&device.as_str())
        || (device.len() == 4
            && (device.starts_with("COM") || device.starts_with("LPT"))
            && matches!(device.as_bytes()[3], b'1'..=b'9'))
    {
        return Err("Choose a valid document name.".into());
    }
    Ok(base.to_string())
}
fn docx_bytes(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() as u64 > MAX_FILE || bytes.len() < 4 {
        return Err("DOCX exceeds the supported size or is empty.".into());
    }
    let mut zip =
        ZipArchive::new(Cursor::new(bytes)).map_err(|_| "Invalid DOCX archive.".to_string())?;
    if zip.len() > 2000 {
        return Err("DOCX has too many parts.".into());
    }
    let mut expanded = 0u64;
    let mut content = false;
    let mut body = false;
    for i in 0..zip.len() {
        let part = zip
            .by_index(i)
            .map_err(|_| "Invalid DOCX archive.".to_string())?;
        expanded = expanded.saturating_add(part.size());
        if expanded > MAX_EXPANDED {
            return Err("DOCX expands beyond the supported size.".into());
        }
        let name = part.name();
        if name.eq_ignore_ascii_case("[Content_Types].xml") {
            content = true;
        }
        if name.eq_ignore_ascii_case("word/document.xml") {
            body = true;
        }
        if name.to_ascii_lowercase().ends_with("vbaproject.bin") {
            return Err("Macro-enabled files are unsupported.".into());
        }
    }
    if !content || !body {
        return Err("This file is not a supported DOCX document.".into());
    }
    Ok(())
}
fn read_docx(file: &Path) -> Result<Vec<u8>, String> {
    if !file
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("docx"))
    {
        return Err("Only DOCX files are supported.".into());
    }
    if fs::metadata(file).map_err(|e| e.to_string())?.len() > MAX_FILE {
        return Err("DOCX exceeds the supported size.".into());
    }
    let bytes = fs::read(file).map_err(|e| e.to_string())?;
    docx_bytes(&bytes)?;
    Ok(bytes)
}
fn hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}
fn meta(file: &Path) -> Result<(u64, u64), String> {
    let info = fs::metadata(file).map_err(|e| e.to_string())?;
    let modified = info
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    Ok((info.len(), modified))
}
pub fn templates() -> Result<Vec<TemplateEntry>, String> {
    let root = path_setting("templatesDirectory")?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let book = library()?;
    let metadata = &book["templates"];
    let mut entries = Vec::new();
    for item in fs::read_dir(root).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        let file_type = item.file_type().map_err(|e| e.to_string())?;
        if !file_type.is_file() || file_type.is_symlink() {
            continue;
        }
        let path = item.path();
        if !path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("docx"))
        {
            continue;
        }
        let name = path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        let key = path.to_string_lossy().into_owned();
        let m = &metadata[&key];
        let (size, modified) = meta(&path)?;
        entries.push(TemplateEntry {
            id: m["id"].as_str().unwrap_or(&key).into(),
            name,
            path: key,
            size,
            modified,
            topic: m["topic"].as_str().unwrap_or("General").into(),
            kind: m["kind"].as_str().unwrap_or("Document").into(),
            error: read_docx(&path).err(),
        });
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}
pub fn read_template(file: &str) -> Result<Value, String> {
    let root = fs::canonicalize(path_setting("templatesDirectory")?).map_err(|e| e.to_string())?;
    let path = fs::canonicalize(file).map_err(|e| e.to_string())?;
    if path.parent() != Some(root.as_path()) {
        return Err("Template is outside the configured folder.".into());
    }
    let bytes = read_docx(&path)?;
    Ok(
        json!({"file":path,"name":path.file_stem().unwrap_or_default().to_string_lossy(),"bytesBase64":STANDARD.encode(bytes),"source":"template"}),
    )
}
fn write_new(file: &Path, bytes: &[u8]) -> Result<(), String> {
    fs::create_dir_all(file.parent().ok_or("Invalid destination.")?).map_err(|e| e.to_string())?;
    let mut target = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(file)
        .map_err(|e| e.to_string())?;
    if let Err(error) = target.write_all(bytes).and_then(|_| target.sync_all()) {
        drop(target);
        let _ = fs::remove_file(file);
        return Err(error.to_string());
    }
    Ok(())
}
fn replace(file: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = file.with_extension(format!("{}.tmp", Uuid::new_v4()));
    fs::write(&temp, bytes).map_err(|e| e.to_string())?;
    fs::OpenOptions::new()
        .write(true)
        .open(&temp)
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())?;
    fs::rename(&temp, file).map_err(|e| e.to_string())
}
pub fn import_template(
    source: &str,
    name: &str,
    topic: &str,
    kind: &str,
    replace_existing: bool,
) -> Result<TemplateEntry, String> {
    let _write = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    let source = Path::new(source);
    if !source.is_absolute() {
        return Err("Choose a valid DOCX file.".into());
    }
    let bytes = read_docx(source)?;
    let base = safe_name(name)?;
    let root = path_setting("templatesDirectory")?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let target = root.join(format!("{base}.docx"));
    if fs::canonicalize(source).ok() == fs::canonicalize(&target).ok() {
        return Err("Template source and destination are the same file.".into());
    }
    if target.exists() {
        if !replace_existing {
            return Err("A template with this name already exists.".into());
        }
        let backup = target.with_extension(format!("docx.{}.b6h-word-backup", Uuid::new_v4()));
        fs::copy(&target, backup).map_err(|e| e.to_string())?;
        replace(&target, &bytes)?;
    } else {
        write_new(&target, &bytes)?;
    }
    let mut book = library()?;
    if !book["templates"].is_object() {
        book["templates"] = json!({});
    }
    let key = target.to_string_lossy().into_owned();
    let id = book["templates"][&key]["id"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    book["templates"][&key] = json!({"id":id,"topic":topic.trim().chars().take(80).collect::<String>(),"kind":kind.trim().chars().take(80).collect::<String>()});
    save_library(&book)?;
    let (size, modified) = meta(&target)?;
    Ok(TemplateEntry {
        id,
        name: base,
        path: key,
        size,
        modified,
        topic: topic.into(),
        kind: kind.into(),
        error: None,
    })
}
pub fn create_template(
    encoded: &str,
    name: &str,
    topic: &str,
    kind: &str,
) -> Result<TemplateEntry, String> {
    let _write = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    if encoded.len() > ((MAX_FILE * 4 / 3 + 8) as usize) {
        return Err("DOCX exceeds the supported size.".into());
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "Invalid DOCX content.".to_string())?;
    docx_bytes(&bytes)?;
    let base = safe_name(name)?;
    let root = path_setting("templatesDirectory")?;
    let target = root.join(format!("{base}.docx"));
    write_new(&target, &bytes)?;
    let mut book = library()?;
    if !book["templates"].is_object() {
        book["templates"] = json!({});
    }
    let key = target.to_string_lossy().into_owned();
    let id = Uuid::new_v4().to_string();
    book["templates"][&key] = json!({"id":id,"topic":topic.trim().chars().take(80).collect::<String>(),"kind":kind.trim().chars().take(80).collect::<String>()});
    save_library(&book)?;
    let (size, modified) = meta(&target)?;
    Ok(TemplateEntry {
        id,
        name: base,
        path: key,
        size,
        modified,
        topic: topic.into(),
        kind: kind.into(),
        error: None,
    })
}
pub fn open_external(state: &State, file: &Path) -> Result<Value, String> {
    let file = fs::canonicalize(file).map_err(|e| e.to_string())?;
    let bytes = read_docx(&file)?;
    state
        .external
        .lock()
        .map_err(|e| e.to_string())?
        .insert(file.clone());
    Ok(
        json!({"file":file,"name":file.file_stem().unwrap_or_default().to_string_lossy(),"hash":hash(&bytes),"bytesBase64":STANDARD.encode(bytes),"source":"external"}),
    )
}
pub fn recent() -> Result<Value, String> {
    Ok(library()?["recent"].clone())
}
pub fn open_recent(state: &State, file: &str) -> Result<Value, String> {
    let path = fs::canonicalize(file).map_err(|e| e.to_string())?;
    let book = library()?;
    let entry = book["recent"]
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .find(|item| item["path"].as_str().is_some_and(|p| Path::new(p) == path))
        })
        .ok_or("Document is not in Recent files.")?;
    let bytes = read_docx(&path)?;
    let current = hash(&bytes);
    let managed =
        entry["managed"].as_bool() == Some(true) && entry["hash"].as_str() == Some(&current);
    if !managed {
        state
            .external
            .lock()
            .map_err(|e| e.to_string())?
            .insert(path.clone());
    }
    Ok(
        json!({"file":path,"name":path.file_stem().unwrap_or_default().to_string_lossy(),"bytesBase64":STANDARD.encode(bytes),"hash":current,"source":if managed{"managed"}else{"external"},"templateName":entry["templateName"],"day":entry["day"],"month":entry["month"]}),
    )
}
pub fn save_document(state: &State, input: Value) -> Result<Value, String> {
    let _write = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    let encoded = input["bytesBase64"]
        .as_str()
        .ok_or("Missing DOCX content.")?;
    if encoded.len() > ((MAX_FILE * 4 / 3 + 8) as usize) {
        return Err("DOCX exceeds the supported size.".into());
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "Invalid DOCX content.".to_string())?;
    docx_bytes(&bytes)?;
    let name = safe_name(input["name"].as_str().ok_or("Choose a document name.")?)?;
    let mut book = library()?;
    if !book["recent"].is_array() {
        book["recent"] = json!([]);
    }
    let current = input["currentPath"].as_str().filter(|s| !s.is_empty());
    let mut path = None;
    if let Some(current) = current {
        let canonical = fs::canonicalize(current).map_err(|e| e.to_string())?;
        let entry = book["recent"].as_array().unwrap().iter().find(|item| {
            item["path"]
                .as_str()
                .is_some_and(|p| Path::new(p) == canonical)
        });
        if let Some(entry) = entry {
            let existing = fs::read(&canonical).map_err(|e| e.to_string())?;
            if entry["managed"].as_bool() == Some(true)
                && entry["hash"].as_str() == Some(&hash(&existing))
                && input["expectedHash"].as_str() == Some(&hash(&existing))
                && !state
                    .external
                    .lock()
                    .map_err(|e| e.to_string())?
                    .contains(&canonical)
            {
                path = Some(canonical);
            }
        }
        if path.is_none() {
            return Err("This DOCX changed outside B6H. Save a new copy.".into());
        }
    }
    let target = if let Some(path) = path {
        path
    } else {
        let template = safe_name(
            input["templateName"]
                .as_str()
                .unwrap_or("Imported documents"),
        )?;
        let day = input["day"].as_str().unwrap_or("");
        let month = input["month"].as_str().unwrap_or("");
        if day.len() != 2
            || month.len() != 2
            || !day.bytes().all(|b| b.is_ascii_digit())
            || !month.bytes().all(|b| b.is_ascii_digit())
            || day.parse::<u8>().unwrap_or(0) > 31
            || month.parse::<u8>().unwrap_or(0) > 12
            || day == "00"
            || month == "00"
        {
            return Err("Invalid document creation date.".into());
        }
        path_setting("documentsDirectory")?
            .join(template)
            .join(day)
            .join(month)
            .join(format!("{name}.docx"))
    };
    if let Some(current) = current {
        if target != Path::new(current) {
            return Err("Invalid save path.".into());
        }
    }
    if target.exists() {
        if current.is_none() {
            return Err(
                "A document with this name already exists. Choose a different name.".into(),
            );
        }
        replace(&target, &bytes)?;
    } else {
        write_new(&target, &bytes)?;
    }
    let canonical = fs::canonicalize(&target).map_err(|e| e.to_string())?;
    let digest = hash(&bytes);
    let (size, modified) = meta(&canonical)?;
    let rows = book["recent"].as_array_mut().unwrap();
    rows.retain(|entry| entry["path"].as_str() != Some(&canonical.to_string_lossy()));
    rows.insert(0,json!({"path":canonical,"name":name,"size":size,"modified":modified,"managed":true,"hash":digest,"templateName":input["templateName"],"day":input["day"],"month":input["month"]}));
    rows.truncate(50);
    save_library(&book)?;
    Ok(json!({"path":canonical,"hash":digest,"size":size,"modified":modified}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names_reject_paths() {
        assert!(safe_name("../bad").is_err());
        assert!(safe_name("CON").is_err());
        assert!(safe_name("COM9.docx").is_err());
        assert!(safe_name(".docx").is_err());
        assert_eq!(safe_name("Test.DOCX").unwrap(), "Test");
    }
    #[test]
    fn bad_docx_is_rejected() {
        assert!(docx_bytes(b"not a zip").is_err());
        assert!(docx_bytes(&vec![0; (MAX_FILE + 1) as usize]).is_err());
    }
    #[test]
    fn valid_docx_and_exclusive_copy_preserve_source() {
        let dir = std::env::temp_dir().join(format!("b6h-word-{}", Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut cursor);
            writer
                .start_file(
                    "[Content_Types].xml",
                    zip::write::SimpleFileOptions::default(),
                )
                .unwrap();
            writer.write_all(b"<Types/>").unwrap();
            writer
                .start_file(
                    "word/document.xml",
                    zip::write::SimpleFileOptions::default(),
                )
                .unwrap();
            writer.write_all(b"<document/>").unwrap();
            writer.finish().unwrap();
        }
        let bytes = cursor.into_inner();
        assert!(docx_bytes(&bytes).is_ok());
        let source = dir.join("source.docx");
        let target = dir.join("copy.docx");
        fs::write(&source, &bytes).unwrap();
        let before = hash(&fs::read(&source).unwrap());
        write_new(&target, &bytes).unwrap();
        assert!(write_new(&target, b"other").is_err());
        assert_eq!(hash(&fs::read(&source).unwrap()), before);
        assert_eq!(fs::read(&target).unwrap(), bytes);
        replace(&target, b"updated").unwrap();
        assert_eq!(fs::read(target).unwrap(), b"updated");
        fs::remove_dir_all(dir).unwrap();
    }
}
