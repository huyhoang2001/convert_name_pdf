use serde_json::{Map, Value, json};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub fn user_dir() -> Result<PathBuf, String> {
    Ok(
        PathBuf::from(std::env::var_os("APPDATA").ok_or("APPDATA is unavailable")?)
            .join("SAFE PDF RENAME"),
    )
}
fn file(name: &str) -> Result<PathBuf, String> {
    Ok(user_dir()?.join(name))
}
fn read(name: &str) -> Result<Value, String> {
    let path = file(name)?;
    if !path.exists() {
        return Ok(json!({}));
    }
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&data).map_err(|e| format!("{}: {e}", path.display()))
}
fn write(name: &str, value: &Value) -> Result<(), String> {
    let path = file(name)?;
    write_at(&path, value)
}
fn write_at(path: &Path, value: &Value) -> Result<(), String> {
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    if path.exists() {
        let backup = path.with_extension("json.b6h-electron-backup");
        if !backup.exists() {
            fs::copy(&path, &backup).map_err(|e| e.to_string())?;
        }
    }
    let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    fs::write(
        &temp,
        serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(&temp, &path).map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_json_is_backed_up_before_first_write() {
        let dir = std::env::temp_dir().join(format!("b6h-settings-{}", Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("settings.json");
        fs::write(&path, br#"{"language":"VI","legacy":true}"#).unwrap();
        write_at(&path, &json!({"language":"EN","legacy":true})).unwrap();
        let backup = path.with_extension("json.b6h-electron-backup");
        assert_eq!(
            fs::read_to_string(&backup).unwrap(),
            r#"{"language":"VI","legacy":true}"#
        );
        assert_eq!(
            serde_json::from_slice::<Value>(&fs::read(&path).unwrap()).unwrap()["legacy"],
            true
        );
        write_at(&path, &json!({"language":"VI","legacy":true})).unwrap();
        assert_eq!(
            fs::read_to_string(backup).unwrap(),
            r#"{"language":"VI","legacy":true}"#
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
fn settings() -> Result<Map<String, Value>, String> {
    Ok(read("settings.json")?
        .as_object()
        .cloned()
        .unwrap_or_default())
}
pub fn destinations() -> Result<Value, String> {
    let documents = std::env::var_os("USERPROFILE").ok_or("USERPROFILE is unavailable")?;
    let base = PathBuf::from(documents).join("Documents").join("B6H");
    let mut value = json!({"backup":base.join("Backup").to_string_lossy(),"output":base.join("Output").to_string_lossy()});
    if let Some(saved) = settings()?.get("destinations").and_then(Value::as_object) {
        for kind in ["backup", "output"] {
            if let Some(path) = saved.get(kind).and_then(Value::as_str) {
                value[kind] = Value::String(path.into());
            }
        }
    }
    Ok(value)
}
pub fn save_destination(kind: &str, value: &str) -> Result<Value, String> {
    if !["backup", "output"].contains(&kind) || !Path::new(value).is_absolute() {
        return Err("Choose an absolute destination folder.".into());
    }
    let mut data = settings()?;
    let mut paths = destinations()?;
    paths[kind] = Value::String(value.into());
    data.insert("destinations".into(), paths.clone());
    write("settings.json", &Value::Object(data))?;
    Ok(paths)
}
pub fn language() -> Result<String, String> {
    Ok(
        if settings()?.get("language").and_then(Value::as_str) == Some("VI") {
            "VI"
        } else {
            "EN"
        }
        .into(),
    )
}
pub fn save_language(value: &str) -> Result<String, String> {
    if !["VI", "EN"].contains(&value) {
        return Err("Unsupported language.".into());
    }
    let mut data = settings()?;
    data.insert("language".into(), json!(value));
    write("settings.json", &Value::Object(data))?;
    Ok(value.into())
}
pub fn theme() -> Result<String, String> {
    Ok(
        if settings()?.get("theme").and_then(Value::as_str) == Some("dark") {
            "dark"
        } else {
            "light"
        }
        .into(),
    )
}
pub fn save_theme(value: &str) -> Result<String, String> {
    if !["dark", "light"].contains(&value) {
        return Err("Unsupported theme.".into());
    }
    let mut data = settings()?;
    data.insert("theme".into(), json!(value));
    write("settings.json", &Value::Object(data))?;
    Ok(value.into())
}
pub fn word_settings() -> Result<Value, String> {
    let home = PathBuf::from(std::env::var_os("USERPROFILE").ok_or("USERPROFILE is unavailable")?)
        .join("Documents")
        .join("B6H");
    let saved = settings()?
        .get("word")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let templates = saved
        .get("templatesDirectory")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .unwrap_or_else(|| home.join("Templates").to_string_lossy().into_owned());
    let documents = saved
        .get("documentsDirectory")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .unwrap_or_else(|| home.join("Word").to_string_lossy().into_owned());
    Ok(json!({
        "templatesDirectory": templates,
        "documentsDirectory": documents,
        "scanOnLaunch": saved.get("scanOnLaunch").and_then(Value::as_bool).unwrap_or(true)
    }))
}
pub fn save_word_settings(value: Value) -> Result<Value, String> {
    let templates = value
        .get("templatesDirectory")
        .and_then(Value::as_str)
        .ok_or("Choose a Templates folder.")?;
    let documents = value
        .get("documentsDirectory")
        .and_then(Value::as_str)
        .ok_or("Choose a Documents folder.")?;
    if !Path::new(templates).is_absolute() || !Path::new(documents).is_absolute() {
        return Err("Choose absolute Word folders.".into());
    }
    fs::create_dir_all(templates).map_err(|e| e.to_string())?;
    fs::create_dir_all(documents).map_err(|e| e.to_string())?;
    let source = file("settings.json")?;
    if source.exists() {
        let backup = source.with_extension("json.b6h-word-backup");
        if !backup.exists() {
            fs::copy(&source, backup).map_err(|e| e.to_string())?;
        }
    }
    let mut data = settings()?;
    let mut word = data
        .get("word")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    word.insert("templatesDirectory".into(), json!(templates));
    word.insert("documentsDirectory".into(), json!(documents));
    word.insert(
        "scanOnLaunch".into(),
        json!(
            value
                .get("scanOnLaunch")
                .and_then(Value::as_bool)
                .unwrap_or(true)
        ),
    );
    data.insert("word".into(), Value::Object(word));
    write("settings.json", &Value::Object(data))?;
    word_settings()
}
fn validate_labels(value: &Value, selector: Option<&str>) -> Result<(), String> {
    let obj = value.as_object().ok_or("Invalid settings")?;
    if obj.len() > 200 {
        return Err("Invalid settings".into());
    }
    let mut ids = HashSet::new();
    let base = match selector {
        Some("translation") => "number date person document languages certifier copies fee notes",
        Some("copies") => "listDate number refNo customer description quantity unitPrice total",
        None => {
            "signatureHeaderNumber signatureHeaderDate signatureHeaderPerson signatureHeaderDocument signatureHeaderSigner signatureHeaderCount signatureHeaderFee signatureHeaderNotes number date person document certifier copies fee notes"
        }
        _ => return Err("Invalid selector".into()),
    };
    for (key, label) in obj {
        if label.as_str().is_none_or(|s| s.chars().count() > 1000) {
            return Err("Selector labels must be 1,000 characters or fewer.".into());
        }
        if let Some(rest) = key.strip_prefix("custom:") {
            let Some((id, part)) = rest.rsplit_once(':') else {
                return Err("Invalid selector settings.".into());
            };
            if Uuid::parse_str(id).is_err() || !["label", "header"].contains(&part) {
                return Err("Invalid selector settings.".into());
            }
            ids.insert(id.to_string());
        } else {
            let Some((kind, field)) = key.split_once(':') else {
                return Err("Invalid selector settings.".into());
            };
            if !["field", "header"].contains(&kind) || !base.split_whitespace().any(|s| s == field)
            {
                return Err("Invalid selector settings.".into());
            }
        }
    }
    for id in ids {
        if obj
            .get(&format!("custom:{id}:label"))
            .and_then(Value::as_str)
            .is_none_or(|s| s.trim().is_empty())
            || obj
                .get(&format!("custom:{id}:header"))
                .and_then(Value::as_str)
                .is_none_or(|s| s.trim().is_empty())
        {
            return Err("Custom field labels and headers cannot be empty.".into());
        }
    }
    Ok(())
}
pub fn signature_settings() -> Result<Value, String> {
    read("signature-settings.json")
}
pub fn save_signature_settings(value: Value) -> Result<Value, String> {
    validate_labels(&value, None)?;
    write("signature-settings.json", &value)?;
    Ok(value)
}
pub fn selector_settings(selector: &str) -> Result<Value, String> {
    if !["translation", "copies"].contains(&selector) {
        return Err("Invalid selector".into());
    }
    let value = read(&format!("{selector}-settings.json"))?;
    validate_labels(&value, Some(selector))?;
    Ok(value)
}
pub fn save_selector_settings(selector: &str, value: Value) -> Result<Value, String> {
    validate_labels(&value, Some(selector))?;
    write(&format!("{selector}-settings.json"), &value)?;
    Ok(value)
}
pub fn translations() -> Result<Value, String> {
    let path = file("translations.json")?;
    if !path.exists() {
        return Ok(json!([]));
    }
    let data: Value = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let Some(items) = data.as_array() else {
        return Err("Invalid translation sheets.".into());
    };
    if items.first().is_some_and(|item| item.get("rows").is_none()) {
        validate_translation_rows(items)?;
        return Ok(json!([{"id":"default","name":"Dịch thuật","rows":items}]));
    }
    validate_translation_sheets(items)?;
    Ok(data)
}
pub fn save_translations(value: Value) -> Result<usize, String> {
    let arr = value.as_array().ok_or("Invalid translation sheets")?;
    validate_translation_sheets(arr)?;
    write("translations.json", &value)?;
    Ok(arr.len())
}
fn validate_translation_sheets(arr: &[Value]) -> Result<(), String> {
    if arr.is_empty() || arr.len() > 100 {
        return Err("Invalid translation sheets".into());
    }
    let mut names = HashSet::new();
    let mut ids = HashSet::new();
    for sheet in arr {
        let name = sheet
            .get("name")
            .and_then(Value::as_str)
            .ok_or("Invalid translation sheet name")?;
        let id = sheet
            .get("id")
            .and_then(Value::as_str)
            .ok_or("Invalid translation sheet name")?;
        if name.trim().is_empty()
            || name.len() > 31
            || name.chars().any(|c| "\\/?*:[ ]".contains(c) && c != ' ')
            || !names.insert(name.to_lowercase())
            || !ids.insert(id)
        {
            return Err("Invalid translation sheet name".into());
        }
        validate_translation_rows(
            sheet
                .get("rows")
                .and_then(Value::as_array)
                .ok_or("Invalid translation register data.")?,
        )?;
    }
    Ok(())
}
fn validate_translation_rows(rows: &[Value]) -> Result<(), String> {
    if rows.len() > 100_000 {
        return Err("Invalid translation register data.".into());
    }
    let mut ids = HashSet::new();
    for row in rows {
        let id = row
            .get("id")
            .and_then(Value::as_str)
            .ok_or("Invalid translation register data.")?;
        if id.is_empty() || !ids.insert(id) {
            return Err("Invalid translation register data.".into());
        }
        for field in [
            "number",
            "date",
            "person",
            "document",
            "languages",
            "certifier",
            "copies",
            "fee",
            "notes",
        ] {
            if row
                .get(field)
                .and_then(Value::as_str)
                .is_none_or(|text| text.len() > 20_000)
            {
                return Err("Invalid translation register data.".into());
            }
        }
        let object = row
            .as_object()
            .ok_or("Invalid translation register data.")?;
        for (key, value) in object {
            if key.starts_with("custom:")
                && (uuid::Uuid::parse_str(&key[7..]).is_err()
                    || value.as_str().is_none_or(|text| text.len() > 20_000))
            {
                return Err("Invalid translation register data.".into());
            }
        }
    }
    Ok(())
}
pub fn clear_translations() -> Result<bool, String> {
    let path = file("translations.json")?;
    if path.exists() {
        let backup = path.with_extension("json.b6h-electron-backup");
        if !backup.exists() {
            fs::copy(&path, &backup).map_err(|e| e.to_string())?;
        }
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(true)
}
