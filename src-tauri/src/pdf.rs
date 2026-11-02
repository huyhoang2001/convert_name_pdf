use chrono::{Datelike, Local};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread,
    time::UNIX_EPOCH,
};
use uuid::Uuid;

const MAX: u64 = i64::MAX as u64;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub file_name: String,
    pub number: String,
    pub source_path: String,
    pub size: u64,
    pub mtime: f64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub prefix: String,
    pub min: String,
    pub max: String,
    pub pdf_count: usize,
    pub files: Vec<FileEntry>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scan {
    pub root_path: String,
    pub ignored_pdf_count: usize,
    pub groups: Vec<Group>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mapping {
    pub source_file: String,
    pub source_path: String,
    pub source_number: String,
    pub target_number: String,
    pub target_file: String,
    pub size: u64,
    pub mtime: f64,
    pub group: String,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Destinations {
    pub backup: String,
    pub output: String,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInput {
    pub root_path: String,
    pub mode: String,
    pub selected_prefixes: Vec<String>,
    pub selected_file_names: Option<Vec<String>>,
    pub new_name: String,
    pub language: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub token: String,
    pub root_path: String,
    pub groups: Vec<Group>,
    pub mode: String,
    pub mapping: Vec<Mapping>,
    pub missing: Vec<String>,
    pub errors: Vec<String>,
    pub backup_path: String,
    pub output_path: String,
    pub source_min: String,
    pub source_max: String,
    pub unique_count: usize,
    pub new_prefix: String,
    pub input_text: String,
    pub original_prefix: String,
    pub delta_text: String,
    pub merge_details: Vec<String>,
}
#[derive(Clone)]
struct Saved {
    input: PreviewInput,
    destinations: Destinations,
    preview: Preview,
}
#[derive(Default)]
pub struct State {
    previews: Mutex<HashMap<String, Saved>>,
    running: Mutex<HashSet<PathBuf>>,
    pub completed: Mutex<HashSet<PathBuf>>,
    pub reports: Mutex<HashSet<PathBuf>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunResult {
    pub backup_path: String,
    pub output_path: String,
    pub report_path: String,
    pub successes: usize,
    pub errors: Vec<String>,
}

fn absolute_dir(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if !path.is_absolute() {
        return Err("Choose an absolute folder path.".into());
    }
    let real = fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !real.is_dir() {
        return Err("The selected path is not a folder.".into());
    }
    Ok(real)
}
fn mtime(path: &Path) -> Result<f64, String> {
    Ok(fs::metadata(path)
        .map_err(|e| e.to_string())?
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs_f64()
        * 1000.0)
}
fn fmt(n: u64) -> String {
    if n < 1000 {
        format!("{n:03}")
    } else {
        n.to_string()
    }
}
pub fn scan(root: &str) -> Result<Scan, String> {
    let root = absolute_dir(root)?;
    let mut groups: HashMap<String, Vec<(u64, FileEntry)>> = HashMap::new();
    let mut ignored = 0;
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if !name.to_ascii_lowercase().ends_with(".pdf") {
            continue;
        }
        let stem = &name[..name.len() - 4];
        let (prefix, raw) = if stem.bytes().all(|b| b.is_ascii_digit()) {
            ("", stem)
        } else if let Some(pos) = stem.rfind('_') {
            (&stem[..pos + 1], &stem[pos + 1..])
        } else {
            ignored += 1;
            continue;
        };
        if raw.is_empty()
            || !raw.bytes().all(|b| b.is_ascii_digit())
            || (prefix.len() == 1 && prefix == "_")
        {
            ignored += 1;
            continue;
        }
        let Ok(number) = raw.parse::<u64>() else {
            ignored += 1;
            continue;
        };
        if number > MAX {
            ignored += 1;
            continue;
        }
        let path = entry.path();
        let size = entry.metadata().map_err(|e| e.to_string())?.len();
        let file = FileEntry {
            file_name: name.clone(),
            number: number.to_string(),
            source_path: path.to_string_lossy().into_owned(),
            size,
            mtime: mtime(&path)?,
        };
        groups
            .entry(prefix.to_string())
            .or_default()
            .push((number, file));
    }
    let mut groups: Vec<Group> = groups
        .into_iter()
        .map(|(prefix, mut files)| {
            files.sort_by(|a, b| {
                a.0.cmp(&b.0)
                    .then_with(|| a.1.file_name.cmp(&b.1.file_name))
            });
            Group {
                prefix,
                min: files[0].0.to_string(),
                max: files.last().unwrap().0.to_string(),
                pdf_count: files.len(),
                files: files.into_iter().map(|(_, f)| f).collect(),
            }
        })
        .collect();
    groups.sort_by(|a, b| a.prefix.cmp(&b.prefix));
    Ok(Scan {
        root_path: root.to_string_lossy().into_owned(),
        ignored_pdf_count: ignored,
        groups,
    })
}
fn safe_target(name: &str) -> bool {
    !name.chars().any(|c| "\\/:*?\"<>|".contains(c)) && !name.ends_with(' ') && !name.ends_with('.')
}
fn label<'a>(vi: bool, en: &'a str, vn: &'a str) -> &'a str {
    if vi { vn } else { en }
}
fn signed_delta(start: u64, source: u64) -> String {
    if start > source {
        format!("N+{}", start - source)
    } else if start < source {
        format!("N-{}", source - start)
    } else {
        "N".into()
    }
}
fn build(input: &PreviewInput, destinations: &Destinations) -> Result<Preview, String> {
    let data = scan(&input.root_path)?;
    if !["SINGLE", "MERGE"].contains(&input.mode.as_str())
        || input.selected_prefixes.is_empty()
        || input.selected_prefixes.iter().collect::<HashSet<_>>().len()
            != input.selected_prefixes.len()
    {
        return Err("The selected groups are invalid.".into());
    }
    let groups: Vec<Group> = data
        .groups
        .iter()
        .filter(|g| input.selected_prefixes.contains(&g.prefix))
        .cloned()
        .collect();
    if groups.len() != input.selected_prefixes.len()
        || (input.mode == "SINGLE" && groups.len() != 1)
        || (input.mode == "MERGE" && groups.len() < 2)
    {
        return Err("The selected groups are no longer available. Scan the folder again.".into());
    }
    let available: Vec<String> = groups
        .iter()
        .flat_map(|g| g.files.iter().map(|f| f.file_name.clone()))
        .collect();
    let selected = input.selected_file_names.as_ref().unwrap_or(&available);
    let available_set: HashSet<&str> = available.iter().map(String::as_str).collect();
    if selected.is_empty()
        || selected.iter().collect::<HashSet<_>>().len() != selected.len()
        || selected.iter().any(|n| !available_set.contains(n.as_str()))
    {
        return Err("Select one or more valid PDF numbers.".into());
    }
    let selected_set: HashSet<&str> = selected.iter().map(String::as_str).collect();
    let mut name = input.new_name.trim().to_string();
    if name.to_ascii_lowercase().ends_with(".pdf") {
        name.truncate(name.len() - 4);
    }
    if name.is_empty() {
        return Err("Enter a new filename.".into());
    }
    let (prefix, start) = if name.bytes().all(|b| b.is_ascii_digit()) {
        (String::new(), name.parse::<u64>().ok())
    } else if let Some(pos) = name.rfind('_') {
        let raw = &name[pos + 1..];
        if !raw.is_empty() && raw.bytes().all(|b| b.is_ascii_digit()) {
            (name[..pos + 1].to_string(), raw.parse::<u64>().ok())
        } else {
            (
                format!(
                    "{}",
                    if name.ends_with('_') {
                        name.clone()
                    } else {
                        format!("{name}_")
                    }
                ),
                Some(1),
            )
        }
    } else {
        (format!("{name}_"), Some(1))
    };
    let Some(start) = start else {
        return Err(
            "The name contains invalid characters or the starting number is out of range.".into(),
        );
    };
    if start > MAX || !safe_target(&prefix) {
        return Err(
            "The name contains invalid characters or the starting number is out of range.".into(),
        );
    }
    let vi = input.language == "VI";
    let mut mapping = Vec::new();
    let mut missing = Vec::new();
    let mut errors = Vec::new();
    let mut merge_details = Vec::new();
    let mut unique_count = 0;
    let source_min = groups
        .iter()
        .filter_map(|g| g.min.parse::<u64>().ok())
        .min()
        .unwrap();
    let source_max = groups
        .iter()
        .filter_map(|g| g.max.parse::<u64>().ok())
        .max()
        .unwrap();
    let mut offset = 0_u64;
    for g in &groups {
        let min = g.min.parse::<u64>().unwrap();
        let max = g.max.parse::<u64>().unwrap();
        let Some(group_start) = start.checked_add(offset) else {
            errors.push("Target number exceeds the limit".into());
            break;
        };
        let seen: HashSet<&str> = g.files.iter().map(|f| f.number.as_str()).collect();
        unique_count += seen.len();
        let mut selected_numbers = HashSet::new();
        for f in &g.files {
            if selected_set.contains(f.file_name.as_str()) && !selected_numbers.insert(&f.number) {
                errors.push(format!(
                    "Duplicate number {} in group {}",
                    f.number, g.prefix
                ));
            }
        }
        // The existing report lists every gap. Keep this work off the webview thread.
        for n in min..=max {
            if !seen.contains(n.to_string().as_str()) {
                if let Some(target) = group_start.checked_add(n - min) {
                    missing.push(format!("{prefix}{}", fmt(target)));
                }
            }
        }
        for f in g
            .files
            .iter()
            .filter(|f| selected_set.contains(f.file_name.as_str()))
        {
            let number = f.number.parse::<u64>().unwrap();
            let target = group_start.checked_add(number - min).unwrap_or(u64::MAX);
            if target > MAX {
                errors.push(format!("Target number exceeds the limit: {}", f.file_name));
            }
            let target_file = format!("{prefix}{}.pdf", fmt(target));
            if target_file.chars().count() + data.root_path.chars().count() + 1 >= 260 {
                errors.push(format!("Target path is too long: {target_file}"));
            }
            mapping.push(Mapping {
                source_file: f.file_name.clone(),
                source_path: f.source_path.clone(),
                source_number: f.number.clone(),
                target_number: target.to_string(),
                target_file,
                size: f.size,
                mtime: f.mtime,
                group: g.prefix.clone(),
            });
        }
        if input.mode == "MERGE" {
            let end = group_start.saturating_add(max - min);
            merge_details.push(format!(
                "{} : {}-{} -> {}{}-{}{} | {}",
                if g.prefix.is_empty() {
                    label(vi, "[Number only]", "[Chỉ số]")
                } else {
                    &g.prefix
                },
                fmt(min),
                fmt(max),
                prefix,
                fmt(group_start),
                prefix,
                fmt(end),
                signed_delta(group_start, min)
            ));
        }
        offset = offset.saturating_add(max - min + 1);
    }
    let mut names = HashSet::new();
    for m in &mapping {
        if !names.insert(m.target_file.to_ascii_lowercase()) {
            errors.push(format!("Duplicate target name: {}", m.target_file));
        }
    }
    let backup_base = Path::new(&destinations.backup);
    let output_base = Path::new(&destinations.output);
    if !backup_base.is_absolute()
        || !output_base.is_absolute()
        || destinations
            .backup
            .eq_ignore_ascii_case(&destinations.output)
    {
        errors.push("Backup and Output must be different absolute folders.".into());
    }
    let date = Local::now();
    let date_text = format!("{:02}_{:02}_{}", date.day(), date.month(), date.year());
    let mut pair = None;
    for i in 1..10000 {
        let suffix = format!("{i:02}_{date_text}");
        let b = backup_base.join(&suffix);
        let o = output_base.join(&suffix);
        if !b.exists() && !o.exists() {
            pair = Some((b, o));
            break;
        }
    }
    if pair.is_none() {
        errors.push("Could not find an available Backup/Output folder pair.".into());
    }
    let (backup_path, output_path) = pair
        .map(|(b, o)| {
            (
                b.to_string_lossy().into_owned(),
                o.to_string_lossy().into_owned(),
            )
        })
        .unwrap_or_default();
    let delta_text = if input.mode == "MERGE" {
        label(vi, "Per group (N+K/N-K)", "Theo từng nhóm (N+K/N-K)").to_string()
    } else {
        signed_delta(start, groups[0].min.parse().unwrap())
    };
    let original_prefix = if input.mode == "MERGE" {
        if vi {
            format!("GỘP CHUNG ({} nhóm)", groups.len())
        } else {
            format!("MERGED ({} groups)", groups.len())
        }
    } else if groups[0].prefix.is_empty() {
        label(
            vi,
            "[Number only: 1.pdf, 2.pdf, ...]",
            "[Chỉ có số: 1.pdf, 2.pdf, ...]",
        )
        .into()
    } else {
        groups[0].prefix.clone()
    };
    Ok(Preview {
        token: Uuid::new_v4().to_string(),
        root_path: data.root_path,
        groups,
        mode: input.mode.clone(),
        mapping,
        missing,
        errors,
        backup_path,
        output_path,
        source_min: source_min.to_string(),
        source_max: source_max.to_string(),
        unique_count,
        new_prefix: prefix,
        input_text: input.new_name.clone(),
        original_prefix,
        delta_text,
        merge_details,
    })
}
pub fn preview(
    state: &State,
    input: PreviewInput,
    destinations: Destinations,
) -> Result<Preview, String> {
    let result = build(&input, &destinations)?;
    state.previews.lock().map_err(|e| e.to_string())?.insert(
        result.token.clone(),
        Saved {
            input,
            destinations,
            preview: result.clone(),
        },
    );
    Ok(result)
}
fn copy_verified(source: &Path, dest: &Path, expected: u64, cleanup: bool) -> Result<(), String> {
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dest)
        .map_err(|e| e.to_string())?;
    let result = (|| {
        let mut input = fs::File::open(source).map_err(|e| e.to_string())?;
        std::io::copy(&mut input, &mut output).map_err(|e| e.to_string())?;
        output.flush().map_err(|e| e.to_string())?;
        if output.metadata().map_err(|e| e.to_string())?.len() != expected {
            return Err("Target size verification failed".into());
        }
        Ok(())
    })();
    drop(output);
    if result.is_err() && cleanup {
        let _ = fs::remove_file(dest);
    }
    result
}
struct RunGuard<'a> {
    state: &'a State,
    root: PathBuf,
}
impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut running) = self.state.running.lock() {
            running.remove(&self.root);
        }
    }
}
fn copy_phase(
    mapping: &[Mapping],
    directory: &Path,
    backup: bool,
) -> Vec<Option<Result<(), String>>> {
    let next = AtomicUsize::new(0);
    let stopped = AtomicBool::new(false);
    let results = Mutex::new(vec![None; mapping.len()]);
    thread::scope(|scope| {
        for _ in 0..mapping.len().min(3) {
            let next = &next;
            let stopped = &stopped;
            let results = &results;
            scope.spawn(move || {
                loop {
                    if backup && stopped.load(Ordering::Acquire) {
                        break;
                    }
                    let index = next.fetch_add(1, Ordering::AcqRel);
                    if index >= mapping.len() {
                        break;
                    }
                    let item = &mapping[index];
                    let dest = directory.join(if backup {
                        &item.source_file
                    } else {
                        &item.target_file
                    });
                    let result =
                        copy_verified(Path::new(&item.source_path), &dest, item.size, !backup);
                    if backup && result.is_err() {
                        stopped.store(true, Ordering::Release)
                    }
                    results.lock().unwrap()[index] = Some(result);
                }
            });
        }
    });
    results.into_inner().unwrap()
}
pub fn run(state: &State, token: String) -> Result<RunResult, String> {
    let saved = state
        .previews
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&token)
        .ok_or("Preview expired. Build a new preview.")?;
    let fresh = build(&saved.input, &saved.destinations)?;
    let old: Vec<_> = saved
        .preview
        .mapping
        .iter()
        .map(|m| (&m.source_file, m.size, m.mtime, &m.target_file))
        .collect();
    let now: Vec<_> = fresh
        .mapping
        .iter()
        .map(|m| (&m.source_file, m.size, m.mtime, &m.target_file))
        .collect();
    if old != now {
        return Err("Files changed after preview. Scan the folder again.".into());
    }
    if saved.preview.backup_path != fresh.backup_path
        || saved.preview.output_path != fresh.output_path
    {
        return Err("A destination folder changed after preview. Build the preview again.".into());
    }
    if !fresh.errors.is_empty() {
        return Err(fresh.errors.join("\n"));
    }
    let root = fs::canonicalize(&saved.preview.root_path).map_err(|e| e.to_string())?;
    if !state
        .running
        .lock()
        .map_err(|e| e.to_string())?
        .insert(root.clone())
    {
        return Err("A run is already active for this folder.".into());
    }
    let _guard = RunGuard { state, root };
    let backup = Path::new(&saved.preview.backup_path);
    let output = Path::new(&saved.preview.output_path);
    fs::create_dir_all(backup.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::create_dir_all(output.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::create_dir(backup).map_err(|e| e.to_string())?;
    fs::create_dir(output).map_err(|e| e.to_string())?;
    let mut errors = Vec::new();
    let mut successes = Vec::new();
    if let Some(e) = copy_phase(&fresh.mapping, backup, true)
        .into_iter()
        .flatten()
        .find_map(Result::err)
    {
        errors.push(format!("Backup error: {e}"));
    }
    if errors.is_empty() {
        for (item, result) in fresh
            .mapping
            .iter()
            .zip(copy_phase(&fresh.mapping, output, false))
        {
            match result {
                Some(Ok(())) => {
                    successes.push(format!("{} -> {}", item.source_file, item.target_file))
                }
                Some(Err(e)) => errors.push(format!("{}: {e}", item.source_file)),
                None => errors.push(format!("{}: Copy was not attempted", item.source_file)),
            }
        }
    }
    let vi = saved.input.language == "VI";
    let mut lines = vec![
        format!(
            "{}: {}",
            label(vi, "MIN source", "Số nhỏ nhất"),
            fmt(fresh.source_min.parse().unwrap())
        ),
        format!(
            "{}: {}",
            label(vi, "MAX source", "Số lớn nhất"),
            fmt(fresh.source_max.parse().unwrap())
        ),
        format!(
            "{}: {}",
            label(vi, "PDFs selected", "PDF đã chọn"),
            fresh.mapping.len()
        ),
        format!(
            "{}: {}",
            label(vi, "Unique numbers", "Số thứ tự hiện có"),
            fresh.unique_count
        ),
        format!(
            "{}: {}",
            label(vi, "Missing numbers", "Số còn thiếu"),
            fresh.missing.len()
        ),
        String::new(),
        label(vi, "Missing sequence:", "Các số còn thiếu:").into(),
    ];
    if fresh.missing.is_empty() {
        lines.push(label(vi, "None", "Không có").into())
    } else {
        lines.extend(fresh.missing.clone())
    }
    lines.extend([
        String::new(),
        label(vi, "Renamed files:", "Tệp sau khi đổi tên:").into(),
    ]);
    if successes.is_empty() {
        lines.push(label(vi, "None", "Không có").into())
    } else if successes.len() == 1 {
        lines.push(successes[0].clone())
    } else {
        lines.extend([
            successes[0].clone(),
            "...".into(),
            successes.last().unwrap().clone(),
        ])
    }
    lines.extend([
        String::new(),
        format!(
            "{}: {}",
            label(vi, "Original prefix", "Tiền tố gốc"),
            fresh.original_prefix
        ),
        format!(
            "{}: {}",
            label(vi, "New prefix", "Tiền tố mới"),
            fresh.new_prefix
        ),
        format!(
            "{}: {}",
            label(vi, "Entered name", "Tên đã nhập"),
            fresh.input_text
        ),
    ]);
    if !fresh.merge_details.is_empty() {
        lines.extend([
            String::new(),
            label(vi, "Merged groups:", "Nhóm đã gộp:").into(),
        ]);
        lines.extend(fresh.merge_details.clone())
    }
    lines.extend([
        String::new(),
        format!("Delta: {}", fresh.delta_text),
        String::new(),
        label(vi, "Errors:", "Lỗi:").into(),
    ]);
    if errors.is_empty() {
        lines.push(label(vi, "None", "Không có").into())
    } else {
        lines.extend(errors.clone())
    }
    let report = output.join(label(vi, "Rename results.txt", "Kết quả đổi tên.txt"));
    fs::write(&report, lines.join("\r\n")).map_err(|e| e.to_string())?;
    {
        let mut completed = state.completed.lock().map_err(|e| e.to_string())?;
        completed.insert(fs::canonicalize(backup).map_err(|e| e.to_string())?);
        completed.insert(fs::canonicalize(output).map_err(|e| e.to_string())?);
        completed.insert(fs::canonicalize(&report).map_err(|e| e.to_string())?);
    }
    state
        .reports
        .lock()
        .map_err(|e| e.to_string())?
        .insert(fs::canonicalize(&report).map_err(|e| e.to_string())?);
    Ok(RunResult {
        backup_path: backup.to_string_lossy().into_owned(),
        output_path: output.to_string_lossy().into_owned(),
        report_path: report.to_string_lossy().into_owned(),
        successes: successes.len(),
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_precedes_output_and_sources_survive() {
        let root = std::env::temp_dir().join(format!("b6h-pdf-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("A_1.pdf"), b"first").unwrap();
        fs::write(root.join("A_3.PDF"), b"third").unwrap();
        let state = State::default();
        let input = PreviewInput {
            root_path: root.to_string_lossy().into_owned(),
            mode: "SINGLE".into(),
            selected_prefixes: vec!["A_".into()],
            selected_file_names: None,
            new_name: "B_010".into(),
            language: "EN".into(),
        };
        let dest = Destinations {
            backup: root.join("backup").to_string_lossy().into_owned(),
            output: root.join("output").to_string_lossy().into_owned(),
        };
        let preview = preview(&state, input, dest).unwrap();
        assert_eq!(
            preview
                .mapping
                .iter()
                .map(|m| m.target_file.as_str())
                .collect::<Vec<_>>(),
            vec!["B_010.pdf", "B_012.pdf"]
        );
        assert_eq!(preview.missing, vec!["B_011"]);
        let result = run(&state, preview.token.clone()).unwrap();
        assert_eq!(result.successes, 2);
        assert_eq!(fs::read(root.join("A_1.pdf")).unwrap(), b"first");
        assert_eq!(
            fs::read(Path::new(&result.backup_path).join("A_1.pdf")).unwrap(),
            b"first"
        );
        assert_eq!(
            fs::read(Path::new(&result.output_path).join("B_012.pdf")).unwrap(),
            b"third"
        );
        assert!(run(&state, preview.token).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
