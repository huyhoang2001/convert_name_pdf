use super::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs::OpenOptions, io::Write, sync::{Arc, OnceLock}};

const MAX_BYTES: usize = 10_000_000;
const MAX_ITEMS: usize = 10_000;
const CACHE_BUDGET: usize = 24_000_000;

#[derive(Default)]
struct Cache { entries: HashMap<PathBuf, (Vec<Value>, usize, u64)>, bytes: usize, tick: u64 }
static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
fn cache() -> &'static Mutex<Cache> { CACHE.get_or_init(|| Mutex::new(Cache::default())) }
fn drop_cached(path: &Path) {
    if let Ok(mut cache) = cache().lock() { if let Some((_, bytes, _)) = cache.entries.remove(path) { cache.bytes -= bytes; } }
}
type OpenCache = Option<(PathBuf, String, Arc<Index>, Value)>;
static OPEN_CACHE: OnceLock<Mutex<OpenCache>> = OnceLock::new();
fn open_cache() -> &'static Mutex<OpenCache> { OPEN_CACHE.get_or_init(|| Mutex::new(None)) }
#[cfg(test)]
thread_local! { static IO_STATS: std::cell::Cell<(usize, usize)> = const { std::cell::Cell::new((0, 0)) }; }
#[cfg(test)]
thread_local! { static FAIL_AT: std::cell::Cell<Option<&'static str>> = const { std::cell::Cell::new(None) }; }
fn fail_at(point: &'static str) -> Result<(), String> {
    #[cfg(test)]
    if FAIL_AT.with(|fail| { if fail.get() == Some(point) { fail.set(None); true } else { false } }) { return Err(format!("Injected Calendar failure at {point}")); }
    let _ = point;
    Ok(())
}
fn record_read(bytes: usize) {
    #[cfg(test)]
    IO_STATS.with(|stats| { let (files, read) = stats.get(); stats.set((files + 1, read + bytes)); });
    #[cfg(not(test))]
    let _ = bytes;
}

#[cfg(windows)]
mod process_mutex {
    use std::{ffi::c_void, os::windows::ffi::OsStrExt};
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn CreateMutexW(attributes: *mut c_void, owner: i32, name: *const u16) -> *mut c_void;
        fn WaitForSingleObject(handle: *mut c_void, milliseconds: u32) -> u32;
        fn ReleaseMutex(handle: *mut c_void) -> i32;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }
    pub struct Guard(*mut c_void);
    impl Drop for Guard { fn drop(&mut self) { unsafe { ReleaseMutex(self.0); CloseHandle(self.0); } } }
    pub fn lock() -> Result<Guard, String> {
        let name = std::ffi::OsStr::new("Local\\B6H-Calendar-Storage").encode_wide().chain(Some(0)).collect::<Vec<_>>();
        let handle = unsafe { CreateMutexW(std::ptr::null_mut(), 0, name.as_ptr()) };
        if handle.is_null() { return Err("Calendar process lock could not be created.".into()); }
        let wait = unsafe { WaitForSingleObject(handle, 30_000) };
        if wait != 0 && wait != 0x80 { unsafe { CloseHandle(handle); } return Err("Calendar storage is busy in another process.".into()); }
        Ok(Guard(handle))
    }
}

#[cfg(windows)]
pub fn process_lock(_base: &Path) -> Result<impl Drop, String> { process_mutex::lock() }
#[cfg(unix)]
mod unix_mutex {
    use std::{fs::{File, OpenOptions}, os::fd::AsRawFd, path::Path};
    unsafe extern "C" { fn flock(fd: i32, operation: i32) -> i32; }
    pub struct Guard(File);
    impl Drop for Guard { fn drop(&mut self) { unsafe { flock(self.0.as_raw_fd(), 8); } } }
    pub fn lock(path: &Path) -> Result<Guard, String> {
        if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
        let file = OpenOptions::new().create(true).truncate(false).read(true).write(true).open(path).map_err(|e| e.to_string())?;
        if unsafe { flock(file.as_raw_fd(), 2) } != 0 { return Err("Calendar storage is busy in another process.".into()); }
        Ok(Guard(file))
    }
}
#[cfg(unix)]
pub fn process_lock(base: &Path) -> Result<impl Drop, String> {
    let dir = root(base);
    if dir.is_symlink() { return Err("Calendar storage symlink is unsafe.".into()); }
    unix_mutex::lock(&dir.join("calendar.lock"))
}
#[cfg(not(any(windows, unix)))]
pub fn process_lock(_base: &Path) -> Result<impl Drop, String> { Ok(()) }

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Shard {
    path: String,
    year: i32,
    number: u32,
    count: usize,
    bytes: usize,
    checksum: String,
    min_start: String,
    max_end: String,
    recurring: bool,
    active_task: bool,
    #[serde(default)]
    active_board_item: bool,
    latest_done: Option<String>,
    min_reminder_due: Option<String>,
    max_reminder_due: Option<String>,
    categories: HashMap<String, usize>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Commit {
    version: u32,
    #[serde(default)]
    board_summary_version: u32,
    generation: String,
    index: String,
    metadata: String,
    index_checksum: String,
    #[serde(default)]
    index_deltas: Vec<DeltaRef>,
    metadata_checksum: String,
    shards: Vec<Shard>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Locator { shard: String, year: i32, updated_at: Option<String> }

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Index { version: u32, generation: String, ids: HashMap<String, Locator> }

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeltaRef { path: String, checksum: String }

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexDelta { version: u32, set: HashMap<String, Locator>, remove: Vec<String> }

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Intent { old: Option<String>, new: String, files: Vec<String> }

fn root(base: &Path) -> PathBuf { base.join("calendar") }
fn current(root: &Path) -> PathBuf { root.join("current.json") }

fn path(root: &Path, name: &str) -> Result<PathBuf, String> {
    if root.is_symlink() { return Err("Calendar storage symlink is unsafe.".into()); }
    let components = Path::new(name).components().collect::<Vec<_>>();
    if components.is_empty() || components.iter().any(|part| !matches!(part, std::path::Component::Normal(_)))
        || !name.ends_with(".json") { return Err("Calendar storage path is unsafe.".into()); }
    let mut result = root.to_path_buf();
    for part in components { result.push(part); if result.is_symlink() { return Err("Calendar storage symlink is unsafe.".into()); } }
    Ok(result)
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    let bytes = fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    record_read(bytes.len());
    serde_json::from_slice(&bytes).map_err(|e| format!("{}: {e}", path.display()))
}

fn durable(path: &Path, bytes: &[u8]) -> Result<(), String> {
    fs::create_dir_all(path.parent().ok_or("Calendar path has no parent.")?).map_err(|e| e.to_string())?;
    let mut file = OpenOptions::new().write(true).create_new(true).open(path).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

#[cfg(test)]
fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<usize, String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    durable(path, &bytes)?;
    Ok(bytes.len())
}

fn publish(root: &Path, commit: &Commit) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(commit).map_err(|e| e.to_string())?;
    let temp = root.join(format!("current-{}.tmp", commit.generation));
    durable(&temp, &bytes)?;
    let destination = current(root);
    if destination.exists() {
        let backup = root.join("previous.json");
        if backup.exists() { fs::remove_file(&backup).map_err(|e| e.to_string())?; }
        // The previous pointer remains recoverable until this replacement succeeds.
        fs::copy(&destination, &backup).map_err(|e| e.to_string())?;
        OpenOptions::new().write(true).open(&backup).and_then(|f| f.sync_all()).map_err(|e| e.to_string())?;
    }
    fs::rename(&temp, &destination).map_err(|e| e.to_string())
}

fn recover(root: &Path) -> Result<(), String> {
    let journal = root.join("transaction.json");
    if !journal.exists() { return Ok(()); }
    let intent: Intent = read_json(&journal)?;
    if !current(root).exists() && intent.old.is_some() {
        let backup = root.join("previous.json");
        if backup.exists() && read_json::<Commit>(&backup)?.generation == intent.old.as_deref().unwrap() {
            fs::copy(&backup, current(root)).map_err(|e| e.to_string())?;
        }
    }
    let published = if current(root).exists() {
        let commit: Commit = read_json(&current(root))?;
        commit.generation == intent.new
    } else { false };
    if !published {
        let actual = if current(root).exists() { Some(read_json::<Commit>(&current(root))?.generation) } else { None };
        if actual != intent.old { return Err("Calendar transaction needs manual recovery; original files were preserved.".into()); }
        for name in intent.files { let file = path(root, &name)?; if file.exists() { fs::remove_file(file).map_err(|e| e.to_string())?; } }
        let temp = root.join(format!("current-{}.tmp", intent.new));
        if temp.exists() { fs::remove_file(temp).map_err(|e| e.to_string())?; }
    }
    fs::remove_file(journal).map_err(|e| e.to_string())
}

fn load_commit(root: &Path) -> Result<Option<Commit>, String> {
    recover(root)?;
    if !current(root).exists() { return Ok(None); }
    let commit: Commit = read_json(&current(root))?;
    if commit.version != 1 || commit.board_summary_version > 1 { return Err("Unsupported Calendar storage format.".into()); }
    for shard in &commit.shards { path(root, &shard.path)?; }
    path(root, &commit.index)?;
    for delta in &commit.index_deltas { path(root, &delta.path)?; }
    path(root, &commit.metadata)?;
    Ok(Some(commit))
}

fn original_year(item: &Value) -> Result<i32, String> {
    let value = item.get("originalStart").or_else(|| item.get("start")).and_then(Value::as_str).ok_or("Calendar item has no original start date; migration was stopped.")?;
    let date = value.get(..10).ok_or("Calendar item has an invalid original start date; migration was stopped.")?;
    let parsed = NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| "Calendar item has an invalid original start date; migration was stopped.")?;
    if value.len() > 10 && DateTime::parse_from_rfc3339(value).is_err()
        && chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M").is_err()
        && chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S").is_err() {
        return Err("Calendar item has an invalid original start time; migration was stopped.".into());
    }
    Ok(parsed.year())
}

fn shard_bytes(items: &[Value]) -> Result<Vec<u8>, String> {
    serde_json::to_vec_pretty(items).map_err(|e| e.to_string())
}
fn item_array_cost(item: &Value) -> Result<usize, String> {
    let encoded = serde_json::to_vec_pretty(item).map_err(|e| e.to_string())?;
    Ok(encoded.len() + 2 * (encoded.iter().filter(|byte| **byte == b'\n').count() + 1) + 2)
}
fn checksum(bytes: &[u8]) -> String { hex::encode(Sha256::digest(bytes)) }

fn summary(name: String, year: i32, number: u32, items: &[Value], bytes: usize) -> Shard {
    let mut result = Shard { path: name, year, number, count: items.len(), bytes, checksum: checksum(&shard_bytes(items).expect("serializable items")), min_start: String::new(), max_end: String::new(), recurring: false, active_task: false, active_board_item: false, latest_done: None, min_reminder_due: None, max_reminder_due: None, categories: HashMap::new() };
    for item in items {
        let start = calendar_date(item, "originalStart", "start");
        let end = date_part(item.get("due").unwrap_or(&Value::Null));
        if result.min_start.is_empty() || start < result.min_start { result.min_start = start; }
        if end > result.max_end { result.max_end = end; }
        result.recurring |= item["recurrence"].as_str().is_some_and(|s| !s.is_empty());
        result.active_task |= item["kind"] == "task" && item["status"] != "done";
        result.active_board_item |= item["status"] != "done";
        if item["status"] != "done" && item["reminder"].as_i64().unwrap_or(0) != 0 {
            let due = date_part(item.get("due").unwrap_or(&Value::Null));
            if !due.is_empty() {
                if result.min_reminder_due.as_deref().is_none_or(|old| due.as_str() < old) { result.min_reminder_due = Some(due.clone()); }
                if result.max_reminder_due.as_deref().is_none_or(|old| due.as_str() > old) { result.max_reminder_due = Some(due); }
            }
        }
        if item["status"] == "done" {
            if let Some(stamp) = item.get("completedAt").or_else(|| item.get("completionObservedAt")).and_then(Value::as_str) {
                if DateTime::parse_from_rfc3339(stamp).is_ok_and(|candidate| result.latest_done.as_deref().is_none_or(|old| DateTime::parse_from_rfc3339(old).map_or(true, |previous| candidate > previous))) {
                    result.latest_done = Some(stamp.to_string());
                }
            }
        }
        if let Some(category) = item["category"].as_str() { *result.categories.entry(category.to_string()).or_default() += 1; }
    }
    result
}
fn shard_key(year: i32, number: u32) -> String { format!("years/{year}/{year}-{number:03}") }
fn locator_key(shard: &Shard) -> String { shard_key(shard.year, shard.number) }

fn read_shard(root: &Path, shard: &Shard) -> Result<Vec<Value>, String> {
    let file = path(root, &shard.path)?;
    if let Ok(mut cache) = cache().lock() {
        cache.tick += 1;
        let tick = cache.tick;
        if let Some((items, _, used)) = cache.entries.get_mut(&file) { *used = tick; return Ok(items.clone()); }
    }
    let bytes = fs::read(&file).map_err(|e| format!("{}: {e}", file.display()))?;
    record_read(bytes.len());
    if bytes.len() != shard.bytes || bytes.len() > MAX_BYTES || checksum(&bytes) != shard.checksum { return Err(format!("Calendar shard checksum mismatch: {}", file.display())); }
    let items: Vec<Value> = serde_json::from_slice(&bytes).map_err(|e| format!("{}: {e}", file.display()))?;
    if items.len() != shard.count || items.len() > MAX_ITEMS { return Err(format!("Calendar shard count mismatch: {}", file.display())); }
    validate_calendar(&json!({"schemaVersion":1,"categories":[],"items":items.clone()}))?;
    for item in &items { if original_year(item)? != shard.year { return Err(format!("Calendar shard ownership mismatch: {}", file.display())); } }
    let weight = bytes.len().saturating_mul(3);
    if weight <= CACHE_BUDGET {
        if let Ok(mut cache) = cache().lock() {
            while cache.bytes + weight > CACHE_BUDGET {
                let Some(oldest) = cache.entries.iter().min_by_key(|(_, (_, _, tick))| tick).map(|(path, _)| path.clone()) else { break; };
                if let Some((_, bytes, _)) = cache.entries.remove(&oldest) { cache.bytes -= bytes; }
            }
            cache.tick += 1;
            let tick = cache.tick;
            cache.bytes += weight;
            cache.entries.insert(file, (items.clone(), weight, tick));
        }
    }
    Ok(items)
}

fn rebuild_index(root: &Path, commit: &Commit) -> Result<Index, String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let status_path = root.join("rebuild-status.json");
    let cancel_path = root.join("cancel-rebuild");
    if status_path.is_symlink() || cancel_path.is_symlink() { return Err("Calendar rebuild path is unsafe.".into()); }
    let _ = fs::remove_file(&cancel_path);
    fs::write(&status_path, serde_json::to_vec(&json!({"completed":0,"total":commit.shards.len()})).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let _status = RebuildStatusGuard(status_path);
    let mut index = Index { version: 1, generation: commit.generation.clone(), ids: HashMap::new() };
    for (position, shard) in commit.shards.iter().enumerate() {
        if cancel_path.exists() { let _ = fs::remove_file(&cancel_path); return Err("Calendar index rebuild was cancelled.".into()); }
        drop_cached(&path(root, &shard.path)?);
        for item in read_shard(root, shard)? {
            let id = item["id"].as_str().ok_or("Calendar shard contains an invalid ID.")?.to_string();
            if index.ids.insert(id, Locator { shard: locator_key(shard), year: shard.year, updated_at: item["updatedAt"].as_str().map(str::to_string) }).is_some() {
                return Err("Calendar shards contain duplicate IDs; original files were preserved.".into());
            }
        }
        fs::write(root.join("rebuild-status.json"), serde_json::to_vec(&json!({"completed":position + 1,"total":commit.shards.len()})).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    }
    Ok(index)
}

struct RebuildStatusGuard(PathBuf);
impl Drop for RebuildStatusGuard { fn drop(&mut self) { let _ = fs::remove_file(&self.0); } }

pub fn rebuild_status(base: &Path) -> Option<Value> {
    let root = root(base);
    let file = root.join("rebuild-status.json");
    if root.is_symlink() || file.is_symlink() { return None; }
    fs::read(file).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok())
}

pub fn cancel_rebuild(base: &Path) -> Result<(), String> {
    let root = root(base);
    if root.is_symlink() { return Err("Calendar storage symlink is unsafe.".into()); }
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let file = root.join("cancel-rebuild");
    if file.is_symlink() { return Err("Calendar rebuild path is unsafe.".into()); }
    fs::write(file, b"cancel").map_err(|e| e.to_string())
}

fn load_index(root: &Path, commit: &Commit) -> Result<(Index, Commit), String> {
    let file = path(root, &commit.index)?;
    let loaded = (|| -> Result<Index, String> {
        let bytes = fs::read(&file).map_err(|e| e.to_string())?; record_read(bytes.len());
        if checksum(&bytes) != commit.index_checksum { return Err("Calendar index checksum mismatch.".into()); }
        let mut index: Index = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if index.version != 1 || commit.index_deltas.is_empty() && index.generation != commit.generation { return Err("Calendar index version or generation is invalid.".into()); }
        for reference in &commit.index_deltas {
            let bytes = fs::read(path(root, &reference.path)?).map_err(|e| e.to_string())?; record_read(bytes.len());
            if checksum(&bytes) != reference.checksum { return Err("Calendar index delta checksum mismatch.".into()); }
            let delta: IndexDelta = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            if delta.version != 1 { return Err("Calendar index delta version is invalid.".into()); }
            for id in delta.remove { index.ids.remove(&id); }
            index.ids.extend(delta.set);
        }
        if index.ids.len() != commit.shards.iter().map(|s| s.count).sum::<usize>() { return Err("Calendar index item count mismatch.".into()); }
        let shards = commit.shards.iter().map(|shard| (locator_key(shard), shard.year)).collect::<HashMap<_, _>>();
        if index.ids.values().any(|loc| shards.get(&loc.shard) != Some(&loc.year)) { return Err("Calendar index locator is stale.".into()); }
        Ok(index)
    })();
    if let Ok(index) = loaded {
        return Ok((index, commit.clone()));
    }
    let mut next = new_commit();
    next.board_summary_version = commit.board_summary_version;
    next.shards = commit.shards.clone();
    let mut index = rebuild_index(root, commit)?;
    index.generation = next.generation.clone();
    let meta = metadata(root, commit)?;
    commit_transaction(root, Some(commit), next.clone(), &index, &meta, Vec::new(), None)?;
    Ok((index, read_json(&current(root))?))
}

fn metadata(root: &Path, commit: &Commit) -> Result<Value, String> {
    let bytes = fs::read(path(root, &commit.metadata)?).map_err(|e| e.to_string())?;
    record_read(bytes.len());
    if checksum(&bytes) != commit.metadata_checksum { return Err("Calendar metadata checksum mismatch; original files were preserved.".into()); }
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

fn upgrade_board_summaries(root: &Path, commit: &Commit, mut index: Index, meta: &Value) -> Result<(Commit, Index), String> {
    let mut next = commit.clone();
    next.generation = Uuid::new_v4().to_string();
    next.board_summary_version = 1;
    next.metadata = format!("metadata/{}.json", next.generation);
    index.generation = next.generation.clone();
    for shard in &mut next.shards {
        let items = read_shard(root, shard)?;
        *shard = summary(shard.path.clone(), shard.year, shard.number, &items, shard.bytes);
    }
    commit_transaction(root, Some(commit), next, &index, meta, Vec::new(), None)?;
    Ok((read_json(&current(root))?, index))
}

fn cleanup(root: &Path) {
    let mut keep = HashSet::new();
    for pointer in ["current.json", "previous.json"] {
        if let Ok(commit) = read_json::<Commit>(&root.join(pointer)) {
            keep.insert(commit.index);
            keep.insert(commit.metadata);
            for delta in commit.index_deltas { keep.insert(delta.path); }
            for shard in commit.shards { keep.insert(shard.path); }
        }
    }
    for section in ["indexes", "metadata", "years"] {
        if root.join(section).is_symlink() { continue; }
        let Ok(entries) = fs::read_dir(root.join(section)) else { continue; };
        for entry in entries.flatten() {
            if entry.path().is_symlink() { continue; }
            let paths = if section == "years" { fs::read_dir(entry.path()).ok().into_iter().flatten().filter_map(Result::ok).map(|item| item.path()).collect::<Vec<_>>() } else { vec![entry.path()] };
            for file in paths {
                let Some(name) = file.file_name().and_then(|n| n.to_str()) else { continue; };
                let Some(stem) = name.strip_suffix(".json") else { continue; };
                if stem.len() < 36 || Uuid::parse_str(&stem[stem.len()-36..]).is_err() { continue; }
                let Ok(relative) = file.strip_prefix(root) else { continue; };
                if !keep.contains(&relative.to_string_lossy().replace('\\', "/")) { let _ = fs::remove_file(file); }
            }
        }
    }
}

fn commit_transaction(root: &Path, old: Option<&Commit>, mut next: Commit, index: &Index, meta: &Value, writes: Vec<(String, Vec<Value>)>, delta: Option<IndexDelta>) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let compact = delta.is_none() || old.is_none() || old.is_some_and(|commit| commit.index_deltas.len() >= 63);
    let index_path;
    let index_bytes;
    if compact {
        next.index = format!("indexes/{}.json", next.generation);
        next.index_deltas.clear();
        index_path = next.index.clone();
        let mut snapshot = index.clone(); snapshot.generation = next.generation.clone();
        index_bytes = serde_json::to_vec_pretty(&snapshot).map_err(|e| e.to_string())?;
        next.index_checksum = checksum(&index_bytes);
    } else {
        let prior = old.unwrap();
        next.index = prior.index.clone();
        next.index_checksum = prior.index_checksum.clone();
        next.index_deltas = prior.index_deltas.clone();
        let reference_path = format!("indexes/delta-{}.json", next.generation);
        index_bytes = serde_json::to_vec_pretty(delta.as_ref().unwrap()).map_err(|e| e.to_string())?;
        next.index_deltas.push(DeltaRef { path: reference_path.clone(), checksum: checksum(&index_bytes) });
        index_path = reference_path;
    }
    let mut files = writes.iter().map(|(name, _)| name.clone()).collect::<Vec<_>>();
    files.push(index_path.clone()); files.push(next.metadata.clone());
    let journal = root.join("transaction.json");
    let intent_bytes = serde_json::to_vec_pretty(&Intent { old: old.map(|c| c.generation.clone()), new: next.generation.clone(), files }).map_err(|e| e.to_string())?;
    let intent_temp = root.join(format!("transaction-{}.tmp", next.generation));
    durable(&intent_temp, &intent_bytes)?;
    fs::rename(&intent_temp, &journal).map_err(|e| e.to_string())?;
    fail_at("journal")?;
    for (name, items) in &writes {
        let bytes = shard_bytes(&items)?;
        if bytes.len() > MAX_BYTES || items.len() > MAX_ITEMS { return Err("Calendar shard exceeds its safety limit.".into()); }
        durable(&path(root, name)?, &bytes)?;
        fail_at("shard")?;
    }
    for (name, _) in &writes {
        let shard = next.shards.iter().find(|s| &s.path == name).ok_or("Calendar transaction is missing a shard summary.")?;
        let bytes = fs::read(path(root, name)?).map_err(|e| e.to_string())?;
        record_read(bytes.len());
        if bytes.len() != shard.bytes || checksum(&bytes) != shard.checksum { return Err("Calendar shard verification failed; prior data was preserved.".into()); }
    }
    let meta_bytes = serde_json::to_vec_pretty(meta).map_err(|e| e.to_string())?;
    next.metadata_checksum = checksum(&meta_bytes);
    durable(&path(root, &index_path)?, &index_bytes)?;
    fail_at("index")?;
    durable(&path(root, &next.metadata)?, &meta_bytes)?;
    fail_at("metadata")?;
    let index_check = fs::read(path(root, &index_path)?).map_err(|e| e.to_string())?;
    let metadata_check = fs::read(path(root, &next.metadata)?).map_err(|e| e.to_string())?;
    record_read(index_check.len()); record_read(metadata_check.len());
    if index_check != index_bytes || metadata_check != meta_bytes {
        return Err("Calendar transaction verification failed; prior data was preserved.".into());
    }
    next.shards.sort_by_key(|s| (s.year, s.number));
    fail_at("publish")?;
    publish(root, &next)?;
    let _ = fs::remove_file(journal);
    cleanup(root);
    if let Ok(mut cache) = open_cache().lock() {
        *cache = Some((root.to_path_buf(), next.generation.clone(), Arc::new(index.clone()), meta.clone()));
    }
    Ok(())
}

fn new_commit() -> Commit {
    let generation = Uuid::new_v4().to_string();
    Commit { version: 1, board_summary_version: 1, generation: generation.clone(), index: format!("indexes/{generation}.json"), index_checksum: String::new(), index_deltas: Vec::new(), metadata: format!("metadata/{generation}.json"), metadata_checksum: String::new(), shards: Vec::new() }
}

fn append(root: &Path, next: &mut Commit, index: &mut Index, writes: &mut Vec<(String, Vec<Value>)>, year: i32, item: Value, locator_changes: &mut HashSet<String>) -> Result<(), String> {
    let mut candidate = next.shards.iter().enumerate().filter(|(_, s)| s.year == year).max_by_key(|(_, s)| s.number).map(|(i, _)| i);
    if let Some(i) = candidate {
        let name = next.shards[i].path.clone();
        let mut items = if let Some((_, items)) = writes.iter().find(|(path, _)| path == &name) { items.clone() } else { read_shard(root, &next.shards[i])? };
        items.push(item.clone());
        let bytes = shard_bytes(&items)?;
        if items.len() <= MAX_ITEMS && bytes.len() <= MAX_BYTES {
            let new_name = format!("years/{year}/{year}-{:03}-{}.json", next.shards[i].number, next.generation);
            let number = next.shards[i].number;
            next.shards[i] = summary(new_name.clone(), year, number, &items, bytes.len());
            if let Some(pos) = writes.iter().position(|(path, _)| path == &name) { writes[pos] = (new_name.clone(), items.clone()); }
            else { writes.push((new_name.clone(), items.clone())); }
            for record in &items { if let Some(id) = record["id"].as_str() { index.ids.insert(id.to_string(), Locator { shard: shard_key(year, number), year, updated_at: record["updatedAt"].as_str().map(str::to_string) }); } }
            return Ok(());
        }
        candidate = Some(i);
    }
    let number = candidate.map(|i| next.shards[i].number + 1).unwrap_or(1);
    let items = vec![item];
    let bytes = shard_bytes(&items)?;
    if bytes.len() > MAX_BYTES { return Err("Calendar item exceeds the 10 MB shard limit; shorten its content.".into()); }
    let name = format!("years/{year}/{year}-{number:03}-{}.json", next.generation);
    let shard = summary(name.clone(), year, number, &items, bytes.len());
    let id = items[0]["id"].as_str().unwrap().to_string();
    index.ids.insert(id.clone(), Locator { shard: shard_key(year, number), year, updated_at: items[0]["updatedAt"].as_str().map(str::to_string) });
    locator_changes.insert(id);
    next.shards.push(shard);
    writes.push((name, items));
    Ok(())
}

fn build_shards(next: &mut Commit, index: &mut Index, writes: &mut Vec<(String, Vec<Value>)>, items: &[Value]) -> Result<(), String> {
    let mut years = std::collections::BTreeMap::<i32, Vec<Value>>::new();
    for item in items { years.entry(original_year(item)?).or_default().push(item.clone()); }
    for (year, records) in years {
        let mut number = 1;
        let mut batch = Vec::new();
        let mut size = 2;
        let flush = |batch: &mut Vec<Value>, number: u32, next: &mut Commit, index: &mut Index, writes: &mut Vec<(String, Vec<Value>)>| -> Result<(), String> {
            if batch.is_empty() { return Ok(()); }
            let bytes = shard_bytes(batch)?;
            if batch.len() > MAX_ITEMS || bytes.len() > MAX_BYTES { return Err("Calendar shard exceeds its safety limit.".into()); }
            let name = format!("years/{year}/{year}-{number:03}-{}.json", next.generation);
            for item in batch.iter() {
                let id = item["id"].as_str().unwrap().to_string();
                index.ids.insert(id, Locator { shard: shard_key(year, number), year, updated_at: item["updatedAt"].as_str().map(str::to_string) });
            }
            next.shards.push(summary(name.clone(), year, number, batch, bytes.len()));
            writes.push((name, std::mem::take(batch)));
            Ok(())
        };
        for item in records {
            let encoded = serde_json::to_vec_pretty(&item).map_err(|e| e.to_string())?;
            let growth = encoded.len() + 2 * (encoded.iter().filter(|b| **b == b'\n').count() + 1);
            let proposed = if batch.is_empty() { 4 + growth } else { size + 2 + growth };
            if proposed > MAX_BYTES || batch.len() == MAX_ITEMS {
                flush(&mut batch, number, next, index, writes)?;
                number += 1;
                size = 2;
            }
            size = if batch.is_empty() { 4 + growth } else { size + 2 + growth };
            if size > MAX_BYTES { return Err("Calendar item exceeds the 10 MB shard limit; shorten its content.".into()); }
            batch.push(item);
        }
        flush(&mut batch, number, next, index, writes)?;
    }
    Ok(())
}

fn prepare_legacy(base: &Path) -> Result<(), String> {
    let root = root(base);
    if current(&root).exists() { return Ok(()); }
    recover(&root)?;
    let legacy = base.join(CALENDAR_FILE);
    if !legacy.exists() && root.join("migration/legacy-calendar.json").exists() {
        return Err("Calendar legacy file is missing during migration; recovery copy was preserved.".into());
    }
    let mut value = if legacy.exists() {
        let bytes = fs::read(&legacy).map_err(|e| e.to_string())?;
        if bytes.len() > MAX_BYTES { return Err("Legacy Calendar file exceeds the 10 MB safety limit; original data was preserved.".into()); }
        serde_json::from_slice(&bytes).map_err(|e| format!("{}: {e}", legacy.display()))?
    } else { json!({"schemaVersion":1,"categories":[],"items":[]}) };
    validate_calendar_limit(&value, false)?;
    for item in value["items"].as_array().unwrap() { original_year(item)?; }
    let copy = root.join("migration/legacy-calendar.json");
    if legacy.exists() {
        let bytes = fs::read(&legacy).map_err(|e| e.to_string())?;
        if !copy.exists() { durable(&copy, &bytes)?; }
        if fs::read(&copy).map_err(|e| e.to_string())? != bytes { return Err("Calendar migration copy verification failed.".into()); }
    }
    normalize_legacy_completions(&mut value, &Utc::now().to_rfc3339());
    validate_calendar_limit(&value, false)?;
    let mut next = new_commit();
    let mut index = Index { version: 1, generation: next.generation.clone(), ids: HashMap::new() };
    let mut writes = Vec::new();
    build_shards(&mut next, &mut index, &mut writes, value["items"].as_array().unwrap())?;
    let mut meta = value.clone(); meta["items"] = json!([]);
    commit_transaction(&root, None, next, &index, &meta, writes, None)
}

fn open(base: &Path) -> Result<(PathBuf, Commit, Arc<Index>, Value), String> {
    prepare_legacy(base)?;
    let root = root(base);
    let commit = load_commit(&root)?.ok_or("Calendar migration is incomplete.")?;
    if commit.board_summary_version == 1 {
        if let Ok(cache) = open_cache().lock() {
            if let Some((cached_root, generation, index, meta)) = cache.as_ref() {
                if cached_root == &root && generation == &commit.generation { return Ok((root, commit, index.clone(), meta.clone())); }
            }
        }
    }
    let (mut index, mut commit) = load_index(&root, &commit)?;
    let meta = metadata(&root, &commit)?;
    if commit.board_summary_version == 0 {
        (commit, index) = upgrade_board_summaries(&root, &commit, index, &meta)?;
    }
    let index = Arc::new(index);
    if let Ok(mut cache) = open_cache().lock() { *cache = Some((root.clone(), commit.generation.clone(), index.clone(), meta.clone())); }
    Ok((root, commit, index, meta))
}

pub fn full(base: &Path) -> Result<Value, String> {
    let (root, commit, _, mut meta) = match open(base) {
        Ok(value) => value,
        Err(error) if error.contains("original start") && !current(&root(base)).exists() => {
            let mut legacy = read_calendar_at(&base.join(CALENDAR_FILE))?;
            normalize_legacy_completions(&mut legacy, &Utc::now().to_rfc3339());
            return Ok(legacy);
        }
        Err(error) => return Err(error),
    };
    let mut items = Vec::new();
    for shard in &commit.shards { items.extend(read_shard(&root, shard)?); }
    meta["items"] = json!(items);
    validate_calendar_limit(&meta, false)?;
    Ok(meta)
}

pub fn query(base: &Path, start_date: &str, end_date: &str, board: bool) -> Result<Value, String> {
    let start = NaiveDate::parse_from_str(start_date, "%Y-%m-%d").map_err(|_| "Calendar date range is invalid.")?;
    let end = NaiveDate::parse_from_str(end_date, "%Y-%m-%d").map_err(|_| "Calendar date range is invalid.")?;
    if start > end { return Err("Calendar date range is invalid.".into()); }
    let (root, commit, _, mut meta) = match open(base) {
        Ok(value) => value,
        Err(error) if error.contains("original start") && !current(&root(base)).exists() => {
            let mut legacy = read_calendar_at(&base.join(CALENDAR_FILE))?;
            normalize_legacy_completions(&mut legacy, &Utc::now().to_rfc3339());
            legacy["storageWarning"] = json!("Calendar migration stopped because a legacy record has no valid original start. Data is read-only until it is corrected.");
            return Ok(legacy);
        }
        Err(error) => return Err(error),
    };
    let now = Utc::now();
    let cutoff = now - Duration::hours(72);
    let today = now.format("%Y-%m-%d").to_string();
    let tomorrow = (now + Duration::days(1)).format("%Y-%m-%d").to_string();
    let mut found = Vec::new();
    let mut seen = HashSet::new();
    for shard in &commit.shards {
        let range = !board && (shard.recurring && shard.min_start.as_str() <= end_date
            || shard.min_start.as_str() <= end_date && shard.max_end.as_str() >= start_date);
        let active = board && (shard.active_task || shard.active_board_item);
        let recent = board && shard.latest_done.as_deref().is_some_and(|stamp| DateTime::parse_from_rfc3339(stamp).is_ok_and(|time| time.with_timezone(&Utc) >= cutoff));
        let reminder = !board && shard.min_reminder_due.as_deref().is_some_and(|min| min <= tomorrow.as_str()) && shard.max_reminder_due.as_deref().is_some_and(|max| max >= today.as_str());
        if !range && !active && !recent && !reminder { continue; }
        for item in read_shard(&root, shard)? {
            let status = item["status"].as_str().unwrap_or("todo");
            let include = if board {
                status != "done" || board_done_visible(&item, &now)
            } else {
                overlaps_range(&item, start_date, end_date)
                || item["recurrence"].as_str().is_some_and(|s| !s.is_empty()) && recurrence_overlaps_range(&item, start, end)
                || status != "done" && item["reminder"].as_i64().unwrap_or(0) != 0 && {
                    let due = date_part(item.get("due").unwrap_or(&Value::Null));
                    due >= today && due <= tomorrow
                }
            };
            if include && seen.insert(item["id"].as_str().unwrap_or("").to_string()) { found.push(item); }
        }
    }
    let mut counts = HashMap::<String, usize>::new();
    for shard in &commit.shards { for (name, count) in &shard.categories { *counts.entry(name.clone()).or_default() += count; } }
    meta["categoryCounts"] = Value::Object(meta["categories"].as_array().into_iter().flatten().filter_map(Value::as_str).map(|name| (name.to_string(), json!(counts.get(name).copied().unwrap_or(0)))).collect());
    meta["items"] = json!(found);
    Ok(meta)
}

pub fn replace(base: &Path, mut value: Value) -> Result<Value, String> {
    validate_calendar_limit(&value, false)?;
    let (root, old, _, _) = open(base)?;
    let existing = full(base)?;
    preserve_locked_starts(&existing, &mut value);
    normalize_legacy_completions(&mut value, &Utc::now().to_rfc3339());
    validate_calendar_limit(&value, false)?;
    for item in value["items"].as_array().unwrap() { original_year(item)?; }
    let mut next = new_commit();
    let mut index = Index { version: 1, generation: next.generation.clone(), ids: HashMap::new() };
    let mut writes = Vec::new();
    build_shards(&mut next, &mut index, &mut writes, value["items"].as_array().unwrap())?;
    let mut meta = value.clone(); meta["items"] = json!([]);
    commit_transaction(&root, Some(&old), next, &index, &meta, writes, None)?;
    Ok(value)
}

pub fn changes(base: &Path, value: Value, expected: HashMap<String, Option<String>>, deleted: Vec<String>) -> Result<(), String> {
    validate_calendar(&value)?;
    if deleted.len() > 10_000 || deleted.iter().any(|id| id.is_empty() || id.len() > 100) || deleted.iter().collect::<HashSet<_>>().len() != deleted.len() {
        return Err("Calendar delete request is invalid.".into());
    }
    let (root, old, old_index, old_meta) = open(base)?;
    let incoming = value["items"].as_array().unwrap();
    let mut change_ids = HashSet::new();
    for item in incoming { if !change_ids.insert(item["id"].as_str().unwrap().to_string()) { return Err("Duplicate Calendar item ID.".into()); } }
    let delete_ids = deleted.into_iter().collect::<HashSet<_>>();
    if delete_ids.iter().any(|id| change_ids.contains(id)) { return Err("Calendar change and delete IDs overlap.".into()); }
    let mut locator_changes = change_ids.union(&delete_ids).cloned().collect::<HashSet<_>>();
    for id in change_ids.iter().chain(delete_ids.iter()) {
        let revision = expected.get(id).ok_or("Calendar changed elsewhere. Reload and try again.")?;
        if old_index.ids.contains_key(id) != revision.is_some() { return Err("Calendar changed elsewhere. Reload and try again.".into()); }
        if old_index.ids.get(id).and_then(|loc| loc.updated_at.as_ref()) != revision.as_ref() { return Err("Calendar changed elsewhere. Reload and try again.".into()); }
    }
    let old_categories = old_meta["categories"].as_array().cloned().unwrap_or_default();
    let new_categories = value["categories"].as_array().cloned().unwrap_or_default();
    let categories_changed = old_categories != new_categories;
    let mut next = new_commit(); next.shards = old.shards.clone();
    let mut index = (*old_index).clone(); index.generation = next.generation.clone();
    let mut meta = old_meta;
    meta["categories"] = json!(new_categories.clone());
    if let Some(colors) = value.get("categoryColors") { meta["categoryColors"] = colors.clone(); }
    let mut touched = HashMap::<String, Vec<Value>>::new();
    for id in change_ids.iter().chain(delete_ids.iter()) {
        if let Some(loc) = old_index.ids.get(id) {
            let shard = next.shards.iter().find(|s| locator_key(s) == loc.shard).ok_or("Calendar index is stale.")?;
            if !touched.contains_key(&shard.path) { touched.insert(shard.path.clone(), read_shard(&root, shard)?); }
        }
    }
    if categories_changed { for shard in &next.shards { if !touched.contains_key(&shard.path) { touched.insert(shard.path.clone(), read_shard(&root, shard)?); } } }
    let mut writes = Vec::new();
    let mut additions = Vec::new();
    let now = Utc::now().to_rfc3339();
    for (old_name, mut items) in touched {
        let old_shard = next.shards.iter().find(|s| s.path == old_name).unwrap().clone();
        if categories_changed {
            let mut wrapper = json!({"items": items});
            apply_category_changes(&mut wrapper, &old_categories, &new_categories);
            items = wrapper["items"].as_array().unwrap().clone();
        }
        let positions = items.iter().enumerate().filter_map(|(position, item)| item["id"].as_str().map(|id| (id.to_string(), position))).collect::<HashMap<_, _>>();
        for id in &delete_ids {
            if old_index_shard(&old_index, id) == Some(locator_key(&old_shard).as_str()) && !positions.contains_key(id) { return Err("Calendar index is stale.".into()); }
        }
        let mut remove_ids = delete_ids.clone();
        for change in incoming {
            let id = change["id"].as_str().unwrap();
            if old_index_shard(&old_index, id) != Some(locator_key(&old_shard).as_str()) { continue; }
            let position = *positions.get(id).ok_or("Calendar index is stale.")?;
            let mut updated = merge_item(Some(&items[position]), change);
            apply_completion_transition(Some(&items[position]), &mut updated, &now);
            let year = original_year(&updated)?;
            if year != old_shard.year {
                remove_ids.insert(id.to_string());
                index.ids.remove(id);
                additions.push(updated);
                continue;
            }
            index.ids.insert(id.to_string(), Locator { shard: locator_key(&old_shard), year, updated_at: updated["updatedAt"].as_str().map(str::to_string) });
            items[position] = updated;
        }
        let bytes = shard_bytes(&items)?;
        if bytes.len() > MAX_BYTES {
            let mut size = bytes.len();
            for item in items.iter().rev() {
                if size <= MAX_BYTES { break; }
                let Some(id) = item["id"].as_str().filter(|id| change_ids.contains(*id)) else { continue; };
                additions.push(item.clone());
                remove_ids.insert(id.to_string());
                index.ids.remove(id);
                size = size.saturating_sub(item_array_cost(item)?);
            }
            if size > MAX_BYTES { return Err("Calendar shard cannot fit after category update.".into()); }
        }
        items.retain(|item| !remove_ids.contains(item["id"].as_str().unwrap_or("")));
        for id in &remove_ids { index.ids.remove(id); }
        let new_name = format!("years/{}/{:04}-{:03}-{}.json", old_shard.year, old_shard.year, old_shard.number, next.generation);
        let bytes = shard_bytes(&items)?;
        if bytes.len() > MAX_BYTES || items.len() > MAX_ITEMS { return Err("Calendar shard cannot fit after update.".into()); }
        let summary = summary(new_name.clone(), old_shard.year, old_shard.number, &items, bytes.len());
        *next.shards.iter_mut().find(|s| s.path == old_name).unwrap() = summary;
        writes.push((new_name, items));
    }
    for item in incoming {
        let id = item["id"].as_str().unwrap();
        if expected.get(id) == Some(&None) {
            let mut new_item = item.clone();
            apply_completion_transition(None, &mut new_item, &now);
            additions.push(new_item);
        }
    }
    for item in additions { let year = original_year(&item)?; append(&root, &mut next, &mut index, &mut writes, year, item, &mut locator_changes)?; }
    validate_calendar_limit(&meta, false)?;
    let delta = IndexDelta {
        version: 1,
        set: locator_changes.iter().filter_map(|id| index.ids.get(id).cloned().map(|loc| (id.clone(), loc))).collect(),
        remove: locator_changes.into_iter().filter(|id| !index.ids.contains_key(id)).collect(),
    };
    commit_transaction(&root, Some(&old), next, &index, &meta, writes, Some(delta))
}

fn old_index_shard<'a>(index: &'a Index, id: &str) -> Option<&'a str> { index.ids.get(id).map(|loc| loc.shard.as_str()) }

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;
    fn base() -> PathBuf { std::env::temp_dir().join(format!("b6h-shard-test-{}", Uuid::new_v4())) }
    fn item(id: &str, start: &str) -> Value {
        json!({"id":id,"kind":"task","title":"Tiếng Việt","description":"","category":"","status":"todo","priority":"normal","start":start,"due":start,"allDay":true,"checklist":[],"progress":0,"updatedAt":"first"})
    }
    fn event(id: &str, start: &str, status: &str) -> Value {
        let mut item = item(id, start);
        item["kind"] = json!("event"); item["status"] = json!(status);
        item
    }
    fn data(items: Vec<Value>) -> Value { json!({"schemaVersion":1,"categories":[],"items":items}) }
    fn physical_locator_fixture(base: &Path, keep_deltas: bool) -> Commit {
        replace(base, data(vec![item("one", "2026-01-01"), item("two", "2026-01-02")])).unwrap();
        if keep_deltas {
            let mut updated = item("one", "2026-01-01"); updated["title"] = json!("updated");
            changes(base, data(vec![updated]), HashMap::from([("one".into(), Some("first".into()))]), vec![]).unwrap();
        }
        let root = root(base);
        let mut commit: Commit = read_json(&current(&root)).unwrap();
        let physical = commit.shards[0].path.clone();
        let index_file = path(&root, &commit.index).unwrap();
        let mut index: Index = read_json(&index_file).unwrap();
        for locator in index.ids.values_mut() { locator.shard = physical.clone(); }
        let bytes = serde_json::to_vec_pretty(&index).unwrap();
        fs::write(index_file, &bytes).unwrap();
        commit.index_checksum = checksum(&bytes);
        for reference in &mut commit.index_deltas {
            let file = path(&root, &reference.path).unwrap();
            let mut delta: IndexDelta = read_json(&file).unwrap();
            for locator in delta.set.values_mut() { locator.shard = physical.clone(); }
            let bytes = serde_json::to_vec_pretty(&delta).unwrap();
            fs::write(file, &bytes).unwrap();
            reference.checksum = checksum(&bytes);
        }
        let mut manifest = serde_json::to_value(&commit).unwrap();
        if !keep_deltas { manifest.as_object_mut().unwrap().remove("indexDeltas"); }
        fs::write(current(&root), serde_json::to_vec_pretty(&manifest).unwrap()).unwrap();
        if let Ok(mut cache) = open_cache().lock() { *cache = None; }
        commit
    }
    #[test]
    fn migration_and_cross_year_query_preserve_legacy() {
        let base = base(); fs::create_dir_all(&base).unwrap();
        let original = data(vec![item("old", "2023-01-01"), item("new", "2028-01-01")]);
        write_calendar_at(&base.join(CALENDAR_FILE), &original).unwrap();
        assert_eq!(query(&base, "2028-01-01", "2028-01-31", true).unwrap()["items"].as_array().unwrap().len(), 2);
        assert_eq!(full(&base).unwrap()["items"].as_array().unwrap().len(), 2);
        assert_eq!(read_calendar_at(&base.join(CALENDAR_FILE)).unwrap(), original);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn current_manifest_without_index_deltas_allows_status_changes() {
        let base = base();
        replace(&base, data(vec![item("kept", "2026-01-01")])).unwrap();
        let manifest_path = current(&root(&base));
        let mut manifest: Value = serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();
        manifest.as_object_mut().unwrap().remove("indexDeltas");
        fs::write(&manifest_path, serde_json::to_vec_pretty(&manifest).unwrap()).unwrap();
        if let Ok(mut cache) = open_cache().lock() { *cache = None; }

        let mut changed = item("kept", "2026-01-01");
        changed["status"] = json!("in_progress");
        changed["updatedAt"] = json!("second");
        changes(&base, data(vec![changed]), HashMap::from([("kept".into(), Some("first".into()))]), vec![]).unwrap();
        assert_eq!(full(&base).unwrap()["items"][0]["status"], "in_progress");
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn new_event_is_retrievable_after_cache_reopen() {
        let base = base();
        replace(&base, data(vec![])).unwrap();
        let mut event = item("event", "2026-11-09");
        event["kind"] = json!("event");
        event["status"] = json!("in_review");
        event["start"] = json!("2026-11-09T09:00");
        event["endTime"] = json!("10:00");
        event["allDay"] = json!(false);
        changes(&base, data(vec![event]), HashMap::from([("event".into(), None)]), vec![]).unwrap();

        if let Ok(mut cache) = open_cache().lock() { *cache = None; }
        let visible = query(&base, "2026-11-09", "2026-11-09", false).unwrap();
        assert_eq!(visible["items"].as_array().unwrap().len(), 1);
        assert_eq!(visible["items"][0]["kind"], "event");
        assert_eq!(visible["items"][0]["status"], "in_review");
        assert_eq!(full(&base).unwrap()["items"][0]["id"], "event");
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn board_includes_active_events_across_years_and_upgrades_old_summaries() {
        let base = base();
        let now = Utc::now();
        let mut past_active = event("past-active", "2010-01-01", "in_review");
        let future_active = event("future-active", "2030-01-01", "todo");
        let today = now.format("%Y-%m-%d").to_string();
        let mut recent_done = event("recent-done", "2015-01-01", "done");
        recent_done["completedAt"] = json!((now - Duration::hours(71)).to_rfc3339());
        let mut expired_done = event("expired-done", &today, "done");
        expired_done["completedAt"] = json!((now - Duration::hours(72)).to_rfc3339());
        replace(&base, data(vec![past_active.clone(), future_active, recent_done, expired_done])).unwrap();

        let root = root(&base);
        let original_shards = {
            let commit: Commit = read_json(&current(&root)).unwrap();
            commit.shards.iter().map(|shard| (shard.path.clone(), fs::read(path(&root, &shard.path).unwrap()).unwrap())).collect::<HashMap<_, _>>()
        };
        let mut manifest: Value = serde_json::from_slice(&fs::read(current(&root)).unwrap()).unwrap();
        manifest.as_object_mut().unwrap().remove("boardSummaryVersion");
        for shard in manifest["shards"].as_array_mut().unwrap() {
            shard.as_object_mut().unwrap().remove("activeBoardItem");
            shard["latestDone"] = Value::Null;
        }
        fs::write(current(&root), serde_json::to_vec_pretty(&manifest).unwrap()).unwrap();
        if let Ok(mut cache) = open_cache().lock() { *cache = None; }
        let first = query(&base, &today, &today, true).unwrap();
        let ids = first["items"].as_array().unwrap().iter().filter_map(|item| item["id"].as_str()).collect::<HashSet<_>>();
        assert_eq!(ids, HashSet::from(["past-active", "future-active", "recent-done"]));

        let upgraded: Commit = read_json(&current(&root)).unwrap();
        assert_eq!(upgraded.board_summary_version, 1);
        let expired_path = path(&root, &upgraded.shards.iter().find(|shard| shard.year == now.year()).unwrap().path).unwrap();
        for (name, bytes) in original_shards { assert_eq!(fs::read(path(&root, &name).unwrap()).unwrap(), bytes); }

        if let Ok(mut cache) = cache().lock() { *cache = Cache::default(); }
        if let Ok(mut cache) = open_cache().lock() { *cache = None; }
        let board = query(&base, &today, &today, true).unwrap();
        assert_eq!(board["items"].as_array().unwrap().len(), 3);
        let loaded = cache().lock().unwrap().entries.keys().filter(|file| file.starts_with(root.join("years"))).cloned().collect::<HashSet<_>>();
        assert_eq!(loaded.len(), 3, "only active or recently completed Event shards should be opened");
        assert!(!loaded.contains(&expired_path));

        past_active["status"] = json!("done");
        past_active["updatedAt"] = json!("second");
        changes(&base, data(vec![past_active]), HashMap::from([("past-active".into(), Some("first".into()))]), vec![]).unwrap();
        if let Ok(mut cache) = open_cache().lock() { *cache = None; }
        let board = query(&base, &today, &today, true).unwrap();
        assert!(board["items"].as_array().unwrap().iter().any(|item| item["id"] == "past-active" && item["status"] == "done"));
        if let Ok(mut cache) = open_cache().lock() { *cache = None; }
        assert!(query(&base, &today, &today, true).unwrap()["items"].as_array().unwrap().iter().any(|item| item["id"] == "past-active"));
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn failed_board_summary_upgrade_recovers_and_keeps_events_readable() {
        let base = base();
        replace(&base, data(vec![event("event", "2010-01-01", "in_review")])).unwrap();
        let root = root(&base);
        let pointer = fs::read(current(&root)).unwrap();
        let mut manifest: Value = serde_json::from_slice(&pointer).unwrap();
        manifest.as_object_mut().unwrap().remove("boardSummaryVersion");
        for shard in manifest["shards"].as_array_mut().unwrap() { shard.as_object_mut().unwrap().remove("activeBoardItem"); }
        fs::write(current(&root), serde_json::to_vec_pretty(&manifest).unwrap()).unwrap();
        let pointer = fs::read(current(&root)).unwrap();
        if let Ok(mut cache) = open_cache().lock() { *cache = None; }
        FAIL_AT.with(|fail| fail.set(Some("index")));
        let today = Utc::now().format("%Y-%m-%d").to_string();
        assert!(query(&base, &today, &today, true).is_err());
        FAIL_AT.with(|fail| fail.set(None));
        assert_eq!(fs::read(current(&root)).unwrap(), pointer);
        let board = query(&base, &today, &today, true).unwrap();
        assert_eq!(board["items"][0]["id"], "event");
        assert_eq!(read_json::<Commit>(&current(&root)).unwrap().board_summary_version, 1);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn physical_locators_rebuild_and_status_moves_survive_restart() {
        for keep_deltas in [false, true] {
            let base = base();
            let legacy = physical_locator_fixture(&base, keep_deltas);
            let root = root(&base);
            let shard_bytes = fs::read(path(&root, &legacy.shards[0].path).unwrap()).unwrap();
            let (_, rebuilt, index, _) = open(&base).unwrap();
            assert_ne!(rebuilt.generation, legacy.generation);
            assert!(index.ids.values().all(|locator| locator.shard == locator_key(&legacy.shards[0])));
            assert_eq!(fs::read(path(&root, &legacy.shards[0].path).unwrap()).unwrap(), shard_bytes);
            for status in ["in_progress", "in_review", "done", "todo"] {
                let before = full(&base).unwrap()["items"].as_array().unwrap().iter().find(|item| item["id"] == "one").unwrap().clone();
                let mut changed = before.clone(); changed["status"] = json!(status);
                changes(&base, data(vec![changed]), HashMap::from([("one".into(), before["updatedAt"].as_str().map(str::to_string))]), vec![]).unwrap();
                if let Ok(mut cache) = open_cache().lock() { *cache = None; }
                let today = Utc::now().format("%Y-%m-%d").to_string();
                let board = query(&base, &today, &today, true).unwrap();
                assert_eq!(board["items"].as_array().unwrap().iter().find(|item| item["id"] == "one").unwrap()["status"], status);
            }
            fs::remove_dir_all(base).unwrap();
        }
    }
    #[test]
    fn mismatched_existing_locator_rejects_edits_and_deletes() {
        let base = base();
        replace(&base, data(vec![item("one", "2026-01-01"), item("two", "2027-01-01")])).unwrap();
        let root = root(&base);
        let mut commit: Commit = read_json(&current(&root)).unwrap();
        let file = path(&root, &commit.index).unwrap();
        let mut index: Index = read_json(&file).unwrap();
        let other = index.ids["two"].clone();
        index.ids.insert("one".into(), other);
        let bytes = serde_json::to_vec_pretty(&index).unwrap();
        fs::write(file, &bytes).unwrap();
        commit.index_checksum = checksum(&bytes);
        fs::write(current(&root), serde_json::to_vec_pretty(&commit).unwrap()).unwrap();
        if let Ok(mut cache) = open_cache().lock() { *cache = None; }
        let pointer = fs::read(current(&root)).unwrap();
        assert!(changes(&base, data(vec![item("one", "2026-01-01")]), HashMap::from([("one".into(), Some("first".into()))]), vec![]).is_err());
        assert!(changes(&base, data(vec![]), HashMap::from([("one".into(), Some("first".into()))]), vec!["one".into()]).is_err());
        assert_eq!(fs::read(current(&root)).unwrap(), pointer);
        assert_eq!(full(&base).unwrap()["items"].as_array().unwrap().len(), 2);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn physical_locator_rebuild_failure_keeps_prior_pointer() {
        let base = base();
        let legacy = physical_locator_fixture(&base, false);
        let root = root(&base);
        let pointer = fs::read(current(&root)).unwrap();
        let shard = fs::read(path(&root, &legacy.shards[0].path).unwrap()).unwrap();
        FAIL_AT.with(|fail| fail.set(Some("index")));
        assert!(open(&base).is_err());
        FAIL_AT.with(|fail| fail.set(None));
        assert_eq!(fs::read(current(&root)).unwrap(), pointer);
        assert_eq!(fs::read(path(&root, &legacy.shards[0].path).unwrap()).unwrap(), shard);
        if let Ok(mut cache) = open_cache().lock() { *cache = None; }
        assert_eq!(full(&base).unwrap()["items"].as_array().unwrap().len(), 2);
        assert_ne!(open(&base).unwrap().1.generation, legacy.generation);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    #[ignore = "requires a verified isolated copy of the owner's calendar"]
    fn copied_calendar_status_move_survives_reopen() {
        let base = PathBuf::from(std::env::var_os("B6H_CALENDAR_CLONE_BASE").expect("Set B6H_CALENDAR_CLONE_BASE to the verified copy"));
        let root = root(&base);
        assert!(current(&root).exists());
        let (_, commit, index, _) = open(&base).unwrap();
        assert!(index.ids.values().all(|locator| commit.shards.iter().any(|shard| locator.shard == locator_key(shard))));
        let all = full(&base).unwrap();
        let original = all["items"].as_array().unwrap().iter().find(|item| item["kind"] == "task" && item["status"] != "done").unwrap().clone();
        let status = if original["status"] == "in_progress" { "in_review" } else { "in_progress" };
        let mut changed = original.clone(); changed["status"] = json!(status);
        let mut request = all.clone(); request["items"] = json!([changed]);
        changes(&base, request, HashMap::from([(original["id"].as_str().unwrap().to_string(), original["updatedAt"].as_str().map(str::to_string))]), vec![]).unwrap();
        if let Ok(mut cache) = open_cache().lock() { *cache = None; }
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let board = query(&base, &today, &today, true).unwrap();
        assert_eq!(board["items"].as_array().unwrap().iter().find(|item| item["id"] == original["id"]).unwrap()["status"], status);
        assert_eq!(full(&base).unwrap()["items"].as_array().unwrap().iter().find(|item| item["id"] == original["id"]).unwrap()["status"], status);
    }
    #[test]
    fn migration_normalizes_legacy_done_without_editing_original() {
        let base = base(); fs::create_dir_all(&base).unwrap();
        let mut legacy_done = item("done", "2026-11-08"); legacy_done["status"] = json!("done");
        let original = data(vec![legacy_done]);
        write_calendar_at(&base.join(CALENDAR_FILE), &original).unwrap();
        let exported = full(&base).unwrap();
        assert_eq!(exported["items"][0]["originalStart"], "2026-11-08");
        assert!(exported["items"][0]["completionObservedAt"].as_str().is_some());
        assert_eq!(read_calendar_at(&base.join(CALENDAR_FILE)).unwrap(), original);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn migration_accepts_legacy_record_count_above_old_global_limit() {
        let base = base(); fs::create_dir_all(&base).unwrap();
        let records = (0..10_001).map(|n| item(&format!("legacy-{n}"), "2026-01-01")).collect();
        write_calendar_at(&base.join(CALENDAR_FILE), &data(records)).unwrap();
        assert_eq!(full(&base).unwrap()["items"].as_array().unwrap().len(), 10_001);
        assert_eq!(open(&base).unwrap().1.shards.iter().map(|s| s.count).sum::<usize>(), 10_001);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn missing_start_keeps_legacy_and_does_not_publish() {
        let base = base(); fs::create_dir_all(&base).unwrap();
        let mut invalid = item("bad", ""); invalid["start"] = json!("");
        let original = data(vec![invalid]);
        write_calendar_at(&base.join(CALENDAR_FILE), &original).unwrap();
        assert_eq!(full(&base).unwrap()["items"].as_array().unwrap().len(), 1);
        assert!(query(&base, "2026-01-01", "2026-01-31", false).unwrap()["storageWarning"].is_string());
        assert_eq!(read_calendar_at(&base.join(CALENDAR_FILE)).unwrap(), original);
        assert!(!current(&root(&base)).exists());
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn incremental_save_preserves_other_shard_bytes() {
        let base = base();
        replace(&base, data(vec![item("old", "2023-01-01"), item("new", "2028-01-01")])).unwrap();
        let (root, before, _, _) = open(&base).unwrap();
        let prior = before.shards.iter().find(|s| s.year == 2023).unwrap();
        let old_bytes = fs::read(path(&root, &prior.path).unwrap()).unwrap();
        let mut updated = item("new", "2028-01-01"); updated["title"] = json!("Changed");
        changes(&base, data(vec![updated]), HashMap::from([("new".into(), Some("first".into()))]), vec![]).unwrap();
        assert_eq!(fs::read(path(&root, &prior.path).unwrap()).unwrap(), old_bytes);
        assert_eq!(full(&base).unwrap()["items"].as_array().unwrap().len(), 2);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn locator_delta_survives_multiple_edits_and_new_items() {
        let base = base(); replace(&base, data(vec![item("one", "2026-01-01"), item("two", "2026-01-02")])).unwrap();
        for (id, revision, title) in [("one", "first", "changed-one"), ("two", "first", "changed-two")] {
            let mut changed = item(id, if id == "one" { "2026-01-01" } else { "2026-01-02" }); changed["title"] = json!(title);
            changes(&base, data(vec![changed]), HashMap::from([(id.into(), Some(revision.into()))]), vec![]).unwrap();
        }
        let new_item = item("three", "2026-01-03");
        changes(&base, data(vec![new_item]), HashMap::from([("three".into(), None)]), vec![]).unwrap();
        let all = full(&base).unwrap();
        assert_eq!(all["items"].as_array().unwrap().len(), 3);
        assert_eq!(all["items"].as_array().unwrap().iter().map(|item| item["title"].as_str().unwrap()).collect::<HashSet<_>>(), HashSet::from(["changed-one", "changed-two", "Tiếng Việt"]));
        assert_eq!(open(&base).unwrap().2.ids.len(), 3);
        let (root, current, _, _) = open(&base).unwrap();
        fs::write(path(&root, &current.index_deltas[0].path).unwrap(), b"corrupt").unwrap();
        if let Ok(mut cache) = open_cache().lock() { *cache = None; }
        assert_eq!(full(&base).unwrap()["items"].as_array().unwrap().len(), 3);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn count_rollover_and_index_rebuild_keep_every_item() {
        let base = base();
        let records = (0..10_001).map(|n| item(&format!("id-{n}"), "2026-01-01")).collect();
        replace(&base, data(records)).unwrap();
        let (root, first, _, _) = open(&base).unwrap();
        assert_eq!(first.shards.len(), 2);
        assert_eq!(first.shards.iter().map(|s| s.count).sum::<usize>(), 10_001);
        fs::remove_file(path(&root, &first.index).unwrap()).unwrap();
        if let Ok(mut cache) = open_cache().lock() { *cache = None; }
        assert_eq!(full(&base).unwrap()["items"].as_array().unwrap().len(), 10_001);
        assert_ne!(open(&base).unwrap().1.generation, first.generation);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn unfinished_transaction_rolls_back_orphan_files() {
        let base = base(); replace(&base, data(vec![item("a", "2026-01-01")])).unwrap();
        let (root, first, _, _) = open(&base).unwrap();
        let orphan = "years/2026/2026-099-00000000-0000-0000-0000-000000000001.json";
        durable(&path(&root, orphan).unwrap(), b"[]").unwrap();
        write_json(&root.join("transaction.json"), &Intent { old: Some(first.generation), new: Uuid::new_v4().to_string(), files: vec![orphan.into()] }).unwrap();
        assert_eq!(full(&base).unwrap()["items"].as_array().unwrap().len(), 1);
        assert!(!path(&root, orphan).unwrap().exists());
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn committed_pointer_wins_if_crash_precedes_journal_cleanup() {
        let base = base(); replace(&base, data(vec![item("a", "2026-01-01")])).unwrap();
        let old = open(&base).unwrap().1;
        let mut updated = item("a", "2026-01-01"); updated["title"] = json!("committed");
        changes(&base, data(vec![updated]), HashMap::from([("a".into(), Some("first".into()))]), vec![]).unwrap();
        let (root, current, _, _) = open(&base).unwrap();
        write_json(&root.join("transaction.json"), &Intent { old: Some(old.generation), new: current.generation, files: vec![] }).unwrap();
        assert_eq!(full(&base).unwrap()["items"][0]["title"], "committed");
        assert!(!root.join("transaction.json").exists());
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn checksum_damage_returns_error_without_empty_fallback() {
        let base = base(); replace(&base, data(vec![item("a", "2026-01-01")])).unwrap();
        let (root, first, _, _) = open(&base).unwrap();
        let shard = path(&root, &first.shards[0].path).unwrap();
        if let Ok(mut cache) = cache().lock() { cache.entries.remove(&shard); cache.bytes = 0; }
        fs::write(&shard, b"[]").unwrap();
        assert!(full(&base).is_err());
        assert_eq!(fs::read(&shard).unwrap(), b"[]");
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn start_year_can_move_before_done_but_locks_after_completion() {
        let base = base(); replace(&base, data(vec![item("a", "2026-12-31")])).unwrap();
        changes(&base, data(vec![item("a", "2027-01-01")]), HashMap::from([("a".into(), Some("first".into()))]), vec![]).unwrap();
        assert_eq!(full(&base).unwrap()["items"][0]["start"], "2027-01-01");
        assert_eq!(open(&base).unwrap().2.ids["a"].year, 2027);
        let current = full(&base).unwrap()["items"][0].clone();
        let mut done = current.clone(); done["status"] = json!("done");
        changes(&base, data(vec![done]), HashMap::from([("a".into(), current["updatedAt"].as_str().map(str::to_string))]), vec![]).unwrap();
        let locked = full(&base).unwrap()["items"][0].clone();
        let mut altered = locked.clone(); altered["start"] = json!("2028-01-01"); altered["due"] = json!("2028-01-01");
        changes(&base, data(vec![altered]), HashMap::from([("a".into(), locked["updatedAt"].as_str().map(str::to_string))]), vec![]).unwrap();
        assert_eq!(full(&base).unwrap()["items"][0]["start"], "2027-01-01");
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn exact_utf8_byte_limit_is_per_shard() {
        let base = base();
        let mut record = item("a", "2026-01-01");
        record["description"] = json!("x".repeat(MAX_BYTES - shard_bytes(&[record.clone()]).unwrap().len()));
        assert_eq!(shard_bytes(&[record.clone()]).unwrap().len(), MAX_BYTES);
        replace(&base, data(vec![record.clone()])).unwrap();
        let before = full(&base).unwrap();
        record["description"] = json!(format!("{}y", record["description"].as_str().unwrap()));
        assert!(replace(&base, data(vec![record])).is_err());
        assert_eq!(full(&base).unwrap(), before);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn injected_failures_preserve_previous_complete_state() {
        for point in ["journal", "shard", "index", "metadata", "publish"] {
            let base = base(); replace(&base, data(vec![item("a", "2026-01-01")])).unwrap();
            let before = full(&base).unwrap();
            let mut changed = item("a", "2026-01-01"); changed["title"] = json!("New");
            FAIL_AT.with(|fail| fail.set(Some(point)));
            assert!(changes(&base, data(vec![changed]), HashMap::from([("a".into(), Some("first".into()))]), vec![]).is_err(), "{point}");
            assert_eq!(full(&base).unwrap(), before, "{point}");
            assert!(!root(&base).join("transaction.json").exists());
            fs::remove_dir_all(base).unwrap();
        }
    }
    #[test]
    fn selective_month_query_reads_no_unrelated_shards() {
        let base = base();
        replace(&base, data(vec![item("old", "2022-01-01"), item("current", "2026-11-08"), item("future", "2030-01-01")])).unwrap();
        let (root, commit, _, _) = open(&base).unwrap();
        if let Ok(mut cache) = cache().lock() { cache.entries.clear(); cache.bytes = 0; }
        IO_STATS.with(|stats| stats.set((0, 0)));
        let result = query(&base, "2026-11-01", "2026-11-30", false).unwrap();
        assert_eq!(result["items"].as_array().unwrap().len(), 1);
        let (files, bytes) = IO_STATS.with(|stats| stats.get());
        assert_eq!(files, 2); // Commit pointer and the one candidate shard; index is cached.
        assert!(bytes > 0);
        assert_eq!(commit.shards.len(), 3);
        assert!(root.join("current.json").exists());
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn byte_rollover_and_recent_done_keep_cross_year_access() {
        let base = base();
        let mut first = item("first", "2023-01-01"); first["description"] = json!("ă".repeat(3_000_000));
        let mut second = item("second", "2023-01-01"); second["description"] = json!("ă".repeat(3_000_000));
        let mut done = item("done", "2023-01-01");
        done["status"] = json!("done"); done["completedAt"] = json!((Utc::now() - Duration::hours(71)).to_rfc3339());
        replace(&base, data(vec![first, second, done])).unwrap();
        let (_, commit, _, _) = open(&base).unwrap();
        assert_eq!(commit.shards.len(), 2);
        assert!(commit.shards.iter().all(|s| s.bytes <= MAX_BYTES));
        let board = query(&base, "2028-01-01", "2028-01-01", true).unwrap();
        assert_eq!(board["items"].as_array().unwrap().len(), 3);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn board_done_window_is_72_hours_and_history_stays_queryable() {
        let base = base();
        let now = Utc::now();
        let mut inside = item("inside", &now.format("%Y-%m-%d").to_string());
        inside["status"] = json!("done"); inside["completedAt"] = json!((now - Duration::hours(71)).to_rfc3339());
        let mut outside = item("outside", &now.format("%Y-%m-%d").to_string());
        outside["status"] = json!("done"); outside["completedAt"] = json!((now - Duration::hours(73)).to_rfc3339());
        replace(&base, data(vec![inside, outside])).unwrap();
        let today = now.format("%Y-%m-%d").to_string();
        let board = query(&base, &today, &today, true).unwrap();
        assert_eq!(board["items"].as_array().unwrap().iter().map(|item| item["id"].as_str().unwrap()).collect::<Vec<_>>(), vec!["inside"]);
        let history = query(&base, &today, &today, false).unwrap();
        assert_eq!(history["items"].as_array().unwrap().len(), 2);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn large_multi_year_backup_roundtrip() {
        let base = base();
        let records = (0..25_000).map(|n| item(&format!("id-{n}"), &format!("{}-01-01", 2023 + n % 5))).collect::<Vec<_>>();
        replace(&base, data(records)).unwrap();
        let exported = full(&base).unwrap();
        assert_eq!(exported["items"].as_array().unwrap().len(), 25_000);
        assert_eq!(open(&base).unwrap().1.shards.len(), 5);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn category_rename_reaches_hidden_years() {
        let base = base();
        let mut old = item("old", "2022-01-01"); old["category"] = json!("Office");
        let mut recent = item("recent", "2028-01-01"); recent["category"] = json!("Office");
        let source = json!({"schemaVersion":1,"categories":["Office"],"categoryColors":{"Office":"#112233"},"items":[old,recent]});
        replace(&base, source).unwrap();
        let visible = query(&base, "2028-01-01", "2028-01-31", false).unwrap();
        assert_eq!(visible["items"].as_array().unwrap().len(), 1);
        let changed = json!({"schemaVersion":1,"categories":["Work"],"categoryColors":{"Work":"#112233"},"items":[]});
        changes(&base, changed, HashMap::new(), vec![]).unwrap();
        let all = full(&base).unwrap();
        assert_eq!(all["items"].as_array().unwrap().iter().filter(|item| item["category"] == "Work").count(), 2);
        assert_eq!(all["categoryColors"]["Work"], "#112233");
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn stale_revision_and_duplicate_requests_leave_state_untouched() {
        let base = base(); replace(&base, data(vec![item("a", "2026-01-01")])).unwrap();
        let before = full(&base).unwrap();
        assert!(changes(&base, data(vec![item("a", "2026-01-01")]), HashMap::from([("a".into(), Some("stale".into()))]), vec![]).is_err());
        assert!(changes(&base, data(vec![item("a", "2026-01-01")]), HashMap::from([("a".into(), None)]), vec![]).is_err());
        assert!(changes(&base, data(vec![]), HashMap::new(), vec!["a".into(), "a".into()]).is_err());
        assert_eq!(full(&base).unwrap(), before);
        fs::remove_dir_all(base).unwrap();
    }
    #[cfg(windows)]
    fn cpu_ram() -> (f64, usize) {
        use std::ffi::c_void;
        #[repr(C)] #[derive(Default, Clone, Copy)] struct FileTime { low: u32, high: u32 }
        #[repr(C)] struct Memory { cb: u32, faults: u32, peak: usize, current: usize, quota_peak_paged: usize, quota_paged: usize, quota_peak_nonpaged: usize, quota_nonpaged: usize, pagefile: usize, peak_pagefile: usize }
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn GetCurrentProcess() -> *mut c_void;
            fn GetProcessTimes(process: *mut c_void, created: *mut FileTime, exited: *mut FileTime, kernel: *mut FileTime, user: *mut FileTime) -> i32;
            fn K32GetProcessMemoryInfo(process: *mut c_void, counters: *mut Memory, size: u32) -> i32;
        }
        unsafe {
            let handle = GetCurrentProcess();
            let (mut created, mut exited, mut kernel, mut user) = (FileTime::default(), FileTime::default(), FileTime::default(), FileTime::default());
            let _ = GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user);
            let mut memory = Memory { cb: std::mem::size_of::<Memory>() as u32, faults: 0, peak: 0, current: 0, quota_peak_paged: 0, quota_paged: 0, quota_peak_nonpaged: 0, quota_nonpaged: 0, pagefile: 0, peak_pagefile: 0 };
            let _ = K32GetProcessMemoryInfo(handle, &mut memory, std::mem::size_of::<Memory>() as u32);
            let ticks = |time: FileTime| ((time.high as u64) << 32) | time.low as u64;
            ((ticks(kernel) + ticks(user)) as f64 / 10_000_000.0, memory.peak)
        }
    }
    #[cfg(not(windows))]
    fn cpu_ram() -> (f64, usize) { (0.0, 0) }
    fn percentile(samples: &[f64], p: f64) -> f64 {
        let mut sorted = samples.to_vec(); sorted.sort_by(f64::total_cmp);
        sorted[((sorted.len() - 1) as f64 * p).ceil() as usize]
    }
    #[test]
    #[ignore = "explicit Windows performance run"]
    fn benchmark_legacy_and_shards() {
        eprintln!("BENCH columns=items,years,engine,phase,median_ms,p95_ms,cpu_seconds,peak_ram_bytes,files_opened,bytes_read,ipc_bytes,shards");
        for count in [100, 1_000, 10_000, 25_000, 50_000] {
            for years in [1, 3, 5] {
                let base = base(); fs::create_dir_all(&base).unwrap();
                let records = (0..count).map(|n| {
                    let year = 2026 + n % years;
                    let mut record = item(&format!("id-{n}"), &format!("{year}-11-08"));
                    if n % 100 == 0 { record["due"] = json!("2031-11-08"); }
                    if n % 200 == 0 { record["recurrence"] = json!("yearly"); }
                    record
                }).collect::<Vec<_>>();
                let original = data(records);
                if count <= 10_000 {
                    let legacy = base.join("legacy.json");
                    write_calendar_at(&legacy, &original).unwrap();
                    let mut times = Vec::new(); let mut ipc = 0;
                    let (start_cpu, _) = cpu_ram();
                    for _ in 0..5 {
                        let start = Instant::now();
                        let response = query_calendar_at(&legacy, "2028-11-01", "2028-11-30", false).unwrap();
                        times.push(start.elapsed().as_secs_f64() * 1000.0);
                        ipc = serde_json::to_vec(&response).unwrap().len();
                    }
                    let (end_cpu, peak) = cpu_ram();
                    eprintln!("BENCH {count},{years},legacy,month,{:.3},{:.3},{:.3},{peak},1,{}, {ipc},0", percentile(&times, 0.5), percentile(&times, 0.95), end_cpu-start_cpu, fs::metadata(&legacy).unwrap().len());
                    for (phase, from, to, board) in [("board", "2028-11-08", "2028-11-08", true), ("timeline", "2028-11-01", "2028-11-14", false)] {
                        let mut times = Vec::new(); let mut ipc = 0; let (start_cpu, _) = cpu_ram();
                        for _ in 0..5 {
                            let start = Instant::now(); let response = query_calendar_at(&legacy, from, to, board).unwrap();
                            times.push(start.elapsed().as_secs_f64() * 1000.0);
                            ipc = serde_json::to_vec(&response).unwrap().len();
                        }
                        let (end_cpu, peak) = cpu_ram();
                        eprintln!("BENCH {count},{years},legacy,{phase},{:.3},{:.3},{:.3},{peak},1,{},{ipc},0", percentile(&times, 0.5), percentile(&times, 0.95), end_cpu-start_cpu, fs::metadata(&legacy).unwrap().len());
                    }
                    for batch in [1, 100] {
                        let mut times = Vec::new(); let (start_cpu, _) = cpu_ram();
                        for run in 0..5 {
                            let existing = read_calendar_at(&legacy).unwrap();
                            let prior = existing["items"].as_array().unwrap();
                            let updates = (0..batch).map(|n| { let mut record = prior[n].clone(); record["title"] = json!(format!("edit-{run}")); record }).collect::<Vec<_>>();
                            let expected = (0..batch).map(|n| (format!("id-{n}"), prior[n]["updatedAt"].as_str().map(str::to_string))).collect();
                            let start = Instant::now(); save_calendar_changes_at(&legacy, data(updates), expected, vec![]).unwrap();
                            times.push(start.elapsed().as_secs_f64() * 1000.0);
                        }
                        let (end_cpu, peak) = cpu_ram();
                        eprintln!("BENCH {count},{years},legacy,save_{batch},{:.3},{:.3},{:.3},{peak},1,{},0,0", percentile(&times, 0.5), percentile(&times, 0.95), end_cpu-start_cpu, fs::metadata(&legacy).unwrap().len());
                    }
                } else { eprintln!("BENCH {count},{years},legacy,month,unsupported,unsupported,unsupported,unsupported,unsupported,unsupported,unsupported,0"); }
                let start = Instant::now();
                replace(&base, original).unwrap();
                let stage_ms = start.elapsed().as_secs_f64() * 1000.0;
                let shard_count = open(&base).unwrap().1.shards.len();
                if let Ok(mut cache) = cache().lock() { cache.entries.clear(); cache.bytes = 0; }
                let mut times = Vec::new(); let mut files = 0; let mut bytes = 0; let mut ipc = 0; let mut cold = (0.0, 0, 0);
                let (start_cpu, _) = cpu_ram();
                for _ in 0..5 {
                    IO_STATS.with(|stats| stats.set((0, 0)));
                    let start = Instant::now();
                    let response = query(&base, "2028-11-01", "2028-11-30", false).unwrap();
                    times.push(start.elapsed().as_secs_f64() * 1000.0);
                    (files, bytes) = IO_STATS.with(|stats| stats.get());
                    if times.len() == 1 { cold = (times[0], files, bytes); }
                    ipc = serde_json::to_vec(&response).unwrap().len();
                }
                let (end_cpu, peak) = cpu_ram();
                eprintln!("BENCH {count},{years},shards,month_cold_app_cache,{:.3},{:.3},n/a,{peak},{},{},{ipc},{shard_count}", cold.0, cold.0, cold.1, cold.2);
                eprintln!("BENCH {count},{years},shards,month_warm,{:.3},{:.3},{:.3},{peak},{files},{bytes},{ipc},{shard_count}", percentile(&times[1..], 0.5), percentile(&times[1..], 0.95), end_cpu-start_cpu);
                eprintln!("BENCH {count},{years},shards,stage,{stage_ms:.3},{stage_ms:.3},n/a,{peak},n/a,n/a,n/a,{shard_count}");
                for (phase, from, to, board) in [("board", "2028-11-08", "2028-11-08", true), ("timeline", "2028-11-01", "2028-11-14", false)] {
                    let mut times = Vec::new(); let mut ipc = 0; let (start_cpu, _) = cpu_ram();
                    for _ in 0..5 {
                        IO_STATS.with(|stats| stats.set((0, 0)));
                        let start = Instant::now(); let response = query(&base, from, to, board).unwrap();
                        times.push(start.elapsed().as_secs_f64() * 1000.0);
                        ipc = serde_json::to_vec(&response).unwrap().len();
                        (files, bytes) = IO_STATS.with(|stats| stats.get());
                    }
                    let (end_cpu, peak) = cpu_ram();
                    eprintln!("BENCH {count},{years},shards,{phase},{:.3},{:.3},{:.3},{peak},{files},{bytes},{ipc},{shard_count}", percentile(&times, 0.5), percentile(&times, 0.95), end_cpu-start_cpu);
                }
                for batch in [1, 100] {
                    let mut times = Vec::new(); let (start_cpu, _) = cpu_ram();
                    for run in 0..5 {
                        let (_, _, index, _) = open(&base).unwrap();
                        let updates = (0..batch).map(|n| { let mut record = item(&format!("id-{n}"), &format!("{}-11-08", 2026 + n % years)); record["title"] = json!(format!("edit-{run}")); record }).collect::<Vec<_>>();
                        let expected = (0..batch).map(|n| { let id = format!("id-{n}"); (id.clone(), index.ids[&id].updated_at.clone()) }).collect();
                        IO_STATS.with(|stats| stats.set((0, 0)));
                        let start = Instant::now(); changes(&base, data(updates), expected, vec![]).unwrap();
                        times.push(start.elapsed().as_secs_f64() * 1000.0);
                        (files, bytes) = IO_STATS.with(|stats| stats.get());
                    }
                    let (end_cpu, peak) = cpu_ram();
                    eprintln!("BENCH {count},{years},shards,save_{batch},{:.3},{:.3},{:.3},{peak},{files},{bytes},0,{shard_count}", percentile(&times, 0.5), percentile(&times, 0.95), end_cpu-start_cpu);
                }
                fs::remove_dir_all(base).unwrap();
            }
        }
    }
    #[test]
    #[ignore = "explicit Windows performance run"]
    fn benchmark_index_delta_saves() {
        let base = base();
        let items = (0..10_000).map(|n| item(&format!("id-{n}"), &format!("{}-11-08", 2024 + n % 5))).collect();
        replace(&base, data(items)).unwrap();
        eprintln!("DELTA_BENCH batch,median_ms,p95_ms,cpu_seconds,peak_ram_bytes,files_opened,bytes_read");
        for batch in [1, 100] {
            let mut times = Vec::new(); let mut files = 0; let mut bytes = 0;
            let (cpu_start, _) = cpu_ram();
            for run in 0..5 {
                let (_, _, index, _) = open(&base).unwrap();
                let updates = (0..batch).map(|n| { let mut record = item(&format!("id-{n}"), &format!("{}-11-08", 2024 + n % 5)); record["title"] = json!(format!("edit-{run}")); record }).collect::<Vec<_>>();
                let expected = (0..batch).map(|n| { let id = format!("id-{n}"); (id.clone(), index.ids[&id].updated_at.clone()) }).collect();
                IO_STATS.with(|stats| stats.set((0, 0)));
                let start = Instant::now(); changes(&base, data(updates), expected, vec![]).unwrap();
                times.push(start.elapsed().as_secs_f64() * 1000.0);
                (files, bytes) = IO_STATS.with(|stats| stats.get());
            }
            let (cpu_end, peak) = cpu_ram();
            eprintln!("DELTA_BENCH {batch},{:.3},{:.3},{:.3},{peak},{files},{bytes}", percentile(&times, 0.5), percentile(&times, 0.95), cpu_end-cpu_start);
        }
        fs::remove_dir_all(base).unwrap();
    }
}
