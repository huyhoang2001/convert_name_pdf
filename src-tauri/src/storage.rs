use chrono::{DateTime, Datelike, Duration, Months, NaiveDate, Utc};
use serde_json::{Map, Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use uuid::Uuid;

pub const COPIES_COMPANY_NAME: &str = "Văn phòng công chứng Biên Hùng";
pub const COPIES_ADDRESS: &str =
    "Số 105, Đường Hưng Đạo Vương, Kp. Nam Hà, Phường Trấn Biên, Tp. Đồng Nai";
pub const COPIES_TAX_ID: &str = "3 6 0 3 6 6 1 5 7 3";

fn copies_defaults(value: &mut Value) {
    let Some(obj) = value.as_object_mut() else {
        return;
    };
    obj.entry("companyName")
        .or_insert_with(|| json!(COPIES_COMPANY_NAME));
    obj.entry("businessAddress")
        .or_insert_with(|| json!(COPIES_ADDRESS));
    obj.entry("taxId").or_insert_with(|| json!(COPIES_TAX_ID));
}

pub fn user_dir() -> Result<PathBuf, String> {
    Ok(
        PathBuf::from(std::env::var_os("APPDATA").ok_or("APPDATA is unavailable")?)
            .join("SAFE PDF RENAME"),
    )
}

static CALENDAR_LOCK: Mutex<()> = Mutex::new(());
const CALENDAR_FILE: &str = "calendar.json";
const BOARD_DONE_MS: i64 = 72 * 60 * 60 * 1000;
mod calendar_shards;

pub fn calendar_data() -> Result<Value, String> {
    let _guard = CALENDAR_LOCK.lock().map_err(|_| "Calendar storage is busy.")?;
    let base = user_dir()?;
    let _process_guard = calendar_shards::process_lock(&base)?;
    calendar_shards::full(&base)
}

pub fn save_calendar_data(value: Value) -> Result<Value, String> {
    let _guard = CALENDAR_LOCK.lock().map_err(|_| "Calendar storage is busy.")?;
    let base = user_dir()?;
    let _process_guard = calendar_shards::process_lock(&base)?;
    calendar_shards::replace(&base, value)
}

pub fn query_calendar_data(start_date: String, end_date: String, board_view: bool) -> Result<Value, String> {
    let start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d").map_err(|_| "Calendar date range is invalid.")?;
    let end = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d").map_err(|_| "Calendar date range is invalid.")?;
    if start > end { return Err("Calendar date range is invalid.".into()); }
    let _guard = CALENDAR_LOCK.lock().map_err(|_| "Calendar storage is busy.")?;
    let base = user_dir()?;
    let _process_guard = calendar_shards::process_lock(&base)?;
    calendar_shards::query(&base, &start_date, &end_date, board_view)
}

#[cfg(test)]
fn query_calendar_at(path: &Path, start_date: &str, end_date: &str, board_view: bool) -> Result<Value, String> {
    let start = NaiveDate::parse_from_str(start_date, "%Y-%m-%d").map_err(|_| "Calendar date range is invalid.")?;
    let end = NaiveDate::parse_from_str(end_date, "%Y-%m-%d").map_err(|_| "Calendar date range is invalid.")?;
    if start > end { return Err("Calendar date range is invalid.".into()); }
    let mut data = read_calendar_at(&path)?;
    if normalize_legacy_completions(&mut data, &Utc::now().to_rfc3339()) {
        validate_calendar(&data)?;
        write_calendar_at(path, &data)?;
    }
    let now = Utc::now();
    let range_start = start.format("%Y-%m-%d").to_string();
    let range_end = end.format("%Y-%m-%d").to_string();
    let all_items = data["items"].as_array().map(Vec::as_slice).unwrap_or_default();
    let category_counts = calendar_category_counts(all_items, &data["categories"]);
    let items = all_items.iter().filter(|item| {
        let status = item["status"].as_str().unwrap_or("todo");
        if board_view && item["kind"] == "task" {
            return status != "done" || board_done_visible(item, &now);
        }
        if overlaps_range(item, &range_start, &range_end) { return true; }
        if item["recurrence"].as_str().is_some_and(|value| !value.is_empty()) {
            if recurrence_overlaps_range(item, start, end) { return true; }
        }
        // Reminders only need near-term active records; old history stays out of the UI payload.
        if status != "done" && item["reminder"].as_i64().unwrap_or(0) != 0 {
            let due = date_part(item.get("due").unwrap_or(&Value::Null));
            let today = now.format("%Y-%m-%d").to_string();
            return due >= today && due <= (now + Duration::days(1)).format("%Y-%m-%d").to_string();
        }
        false
    }).cloned().collect::<Vec<_>>();
    let mut result = data;
    result["items"] = json!(items);
    result["categoryCounts"] = category_counts;
    Ok(result)
}

pub fn save_calendar_changes(
    value: Value,
    expected_updated_at: HashMap<String, Option<String>>,
    deleted_ids: Vec<String>,
) -> Result<(), String> {
    let _guard = CALENDAR_LOCK.lock().map_err(|_| "Calendar storage is busy.")?;
    let base = user_dir()?;
    let _process_guard = calendar_shards::process_lock(&base)?;
    calendar_shards::changes(&base, value, expected_updated_at, deleted_ids)
}

pub fn calendar_rebuild_status() -> Option<Value> { calendar_shards::rebuild_status(&user_dir().ok()?) }
pub fn cancel_calendar_rebuild() -> Result<(), String> { calendar_shards::cancel_rebuild(&user_dir()?) }

#[cfg(test)]
fn save_calendar_changes_at(path: &Path, value: Value, expected_updated_at: HashMap<String, Option<String>>, deleted_ids: Vec<String>) -> Result<(), String> {
    validate_calendar(&value)?;
    if deleted_ids.len() > 10_000 || deleted_ids.iter().any(|id| id.is_empty() || id.len() > 100) {
        return Err("Calendar delete request is invalid.".into());
    }
    let incoming = value["items"].as_array().ok_or("Calendar data has no items.")?;
    let incoming_ids = incoming.iter().filter_map(|item| item["id"].as_str()).collect::<HashSet<_>>();
    let delete_set = deleted_ids.iter().map(String::as_str).collect::<HashSet<_>>();
    if delete_set.len() != deleted_ids.len() || incoming_ids.iter().any(|id| delete_set.contains(id)) {
        return Err("Calendar change request contains duplicate or conflicting item IDs.".into());
    }
    let mut data = read_calendar_at(&path)?;
    normalize_legacy_completions(&mut data, &Utc::now().to_rfc3339());
    let item_indexes = {
        let original_items = data["items"].as_array().ok_or("Calendar data has no items.")?;
        let indexes = original_items.iter().enumerate().filter_map(|(index, item)| item["id"].as_str().map(|id| (id.to_string(), index))).collect::<HashMap<_, _>>();
        for id in incoming_ids.iter().chain(delete_set.iter()) {
            let expected = expected_updated_at.get(*id).ok_or("Calendar changed elsewhere. Reload and try again.")?;
            let actual = indexes.get(*id).and_then(|index| original_items[*index]["updatedAt"].as_str());
            if actual != expected.as_deref() { return Err("Calendar changed elsewhere. Reload and try again.".into()); }
        }
        indexes
    };
    let old_categories = data["categories"].as_array().cloned().unwrap_or_default();
    let new_categories = value["categories"].as_array().cloned().unwrap_or_default();
    apply_category_changes(&mut data, &old_categories, &new_categories);
    data["categories"] = json!(new_categories);
    if let Some(colors) = value.get("categoryColors") { data["categoryColors"] = colors.clone(); }

    let now = Utc::now().to_rfc3339();
    let items = data["items"].as_array_mut().ok_or("Calendar data has no items.")?;
    for incoming in incoming {
        let id = incoming["id"].as_str().ok_or("Calendar item has an invalid ID.")?;
        let existing_index = item_indexes.get(id).copied();
        let existing = existing_index.map(|index| items[index].clone());
        let mut item = merge_item(existing.as_ref(), incoming);
        apply_completion_transition(existing.as_ref(), &mut item, &now);
        if let Some(index) = existing_index { items[index] = item; } else { items.push(item); }
    }
    items.retain(|item| !delete_set.contains(item["id"].as_str().unwrap_or("")));
    data["schemaVersion"] = json!(1);
    validate_calendar(&data)?;
    write_calendar_at(path, &data)
}

fn read_calendar_at(path: &Path) -> Result<Value, String> {
    if !path.exists() { return Ok(json!({"schemaVersion":1,"categories":[],"items":[]})); }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    if bytes.len() > 10_000_000 { return Err("Calendar data exceeds the 10 MB safety limit.".into()); }
    let value: Value = serde_json::from_slice(&bytes).map_err(|error| format!("{}: {error}", path.display()))?;
    validate_calendar(&value)?;
    Ok(value)
}

fn date_part(value: &Value) -> String { value.as_str().unwrap_or("").get(..10).unwrap_or("").to_string() }
fn calendar_date(item: &Value, preferred: &str, fallback: &str) -> String {
    item.get(preferred).filter(|value| value.is_string()).or_else(|| item.get(fallback)).map(date_part).unwrap_or_default()
}
fn overlaps_range(item: &Value, start: &str, end: &str) -> bool {
    let item_start = calendar_date(item, "originalStart", "start");
    let item_end = date_part(item.get("due").unwrap_or(&Value::Null));
    !item_start.is_empty() && !item_end.is_empty() && item_start.as_str() <= end && item_end.as_str() >= start
}
fn recurrence_overlaps_range(item: &Value, start: NaiveDate, end: NaiveDate) -> bool {
    let Some(base) = NaiveDate::parse_from_str(&calendar_date(item, "originalStart", "start"), "%Y-%m-%d").ok() else { return false; };
    if base > end { return false; }
    let recurrence = item["recurrence"].as_str().unwrap_or("");
    let duration = if item["kind"] == "event" {
        NaiveDate::parse_from_str(&date_part(item.get("due").unwrap_or(&Value::Null)), "%Y-%m-%d").ok().map(|due| due.signed_duration_since(base).num_days().max(0)).unwrap_or(0)
    } else { 0 };
    let continuous_gap = match recurrence { "daily" => 1, "weekly" => 7, "monthly" => 62, "yearly" => 1461, _ => return false };
    if duration >= continuous_gap { return true; }
    let lower = start.checked_sub_signed(Duration::days(duration)).unwrap_or(NaiveDate::MIN).max(base);
    if lower > end { return false; }
    match recurrence {
        "daily" => true,
        "weekly" => {
            let elapsed = lower.signed_duration_since(base).num_days();
            let offset = elapsed + (7 - elapsed % 7) % 7;
            base.checked_add_signed(Duration::days(offset)).is_some_and(|date| date <= end)
        }
        "monthly" => {
            let Some(mut month) = lower.with_day(1) else { return false; };
            let last = end.with_day(1).unwrap_or(end);
            while month <= last {
                if month.with_day(base.day()).is_some_and(|date| date >= lower && date <= end) { return true; }
                let Some(next) = month.checked_add_months(Months::new(1)) else { break; };
                month = next;
            }
            false
        }
        "yearly" => (lower.year()..=end.year()).any(|year| NaiveDate::from_ymd_opt(year, base.month(), base.day()).is_some_and(|date| date >= lower && date <= end)),
        _ => false,
    }
}
fn board_done_visible(item: &Value, now: &DateTime<Utc>) -> bool {
    item.get("completedAt").or_else(|| item.get("completionObservedAt"))
        .and_then(Value::as_str).and_then(|stamp| DateTime::parse_from_rfc3339(stamp).ok())
        .is_some_and(|stamp| (0..BOARD_DONE_MS).contains(&now.signed_duration_since(stamp.with_timezone(&Utc)).num_milliseconds()))
}
#[cfg(test)]
fn calendar_category_counts(items: &[Value], categories: &Value) -> Value {
    let mut totals = HashMap::<&str, usize>::new();
    for item in items {
        if let Some(category) = item["category"].as_str() { *totals.entry(category).or_default() += 1; }
    }
    Value::Object(categories.as_array().into_iter().flatten().filter_map(Value::as_str).map(|category| (category.to_string(), json!(totals.get(category).copied().unwrap_or(0)))).collect())
}
fn normalize_legacy_completions(data: &mut Value, observed_at: &str) -> bool {
    let mut changed = false;
    let Some(items) = data["items"].as_array_mut() else { return false; };
    for item in items {
        if item.get("status").is_none() {
            item["status"] = json!("todo");
            changed = true;
        }
        let status = item["status"].as_str().unwrap_or("todo").to_string();
        if let Some(original) = item.get("originalStart").cloned() {
            if item.get("start") != Some(&original) { item["start"] = original; changed = true; }
        }
        if item.get("originalStart").is_none() && (status == "done" || item.get("completedAt").is_some()) {
            let start = item.get("start").cloned().unwrap_or(Value::Null);
            item["originalStart"] = start;
            changed = true;
        }
        if status == "done" && item.get("completedAt").is_none() && item.get("completionObservedAt").is_none() {
            item["completionObservedAt"] = json!(observed_at);
            changed = true;
        }
        if status == "done" && item.get("completedAt").is_some() && item.get("firstCompletedAt").is_none() {
            let earliest_done = item["statusHistory"].as_array().and_then(|history| history.iter().find(|entry| entry["status"] == "done")).and_then(|entry| entry.get("changedAt")).cloned();
            item["firstCompletedAt"] = earliest_done.unwrap_or_else(|| item["completedAt"].clone());
            changed = true;
        }
    }
    changed
}
fn preserve_locked_starts(existing: &Value, replacement: &mut Value) {
    let Some(old_items) = existing["items"].as_array() else { return; };
    let Some(new_items) = replacement["items"].as_array_mut() else { return; };
    let old_by_id = old_items.iter().filter_map(|item| item["id"].as_str().map(|id| (id, item))).collect::<HashMap<_, _>>();
    for item in new_items {
        let id = item["id"].as_str().unwrap_or("");
        if let Some(old) = old_by_id.get(id) {
            let original = old.get("originalStart").or_else(|| {
                (old["status"] == "done" || old.get("completedAt").is_some() || old.get("completionObservedAt").is_some()).then(|| old.get("start")).flatten()
            });
            if let Some(original) = original {
                item["originalStart"] = original.clone();
                item["start"] = original.clone();
                for key in ["firstCompletedAt", "completedAt", "completionObservedAt", "statusHistory"] {
                    if item.get(key).is_none() { if let Some(value) = old.get(key) { item[key] = value.clone(); } }
                }
            }
        }
    }
}
fn merge_item(existing: Option<&Value>, incoming: &Value) -> Value {
    let mut item = existing.and_then(Value::as_object).cloned().unwrap_or_default();
    if let Some(fields) = incoming.as_object() { item.extend(fields.clone()); }
    Value::Object(item)
}
fn apply_completion_transition(existing: Option<&Value>, item: &mut Value, now: &str) {
    let old_status = existing.and_then(|old| old["status"].as_str()).unwrap_or("todo").to_string();
    let status = item["status"].as_str().unwrap_or("todo").to_string();
    let changed = existing.is_some() && old_status != status;
    if let Some(old) = existing {
        for key in ["originalStart", "firstCompletedAt", "completedAt", "completionObservedAt", "statusHistory"] {
            if let Some(value) = old.get(key) { item[key] = value.clone(); }
            else { item.as_object_mut().unwrap().remove(key); }
        }
        let locked_start = old.get("originalStart").or_else(|| {
            (old["status"] == "done" || old.get("completedAt").is_some() || old.get("completionObservedAt").is_some() || (changed && status == "done"))
                .then(|| old.get("start")).flatten()
        });
        if let Some(start) = locked_start {
            item["originalStart"] = start.clone();
            item["start"] = start.clone();
        }
    }
    if changed && status == "done" {
        if item.get("originalStart").is_none() {
            item["originalStart"] = existing.and_then(|old| old.get("start")).or_else(|| item.get("start")).cloned().unwrap_or(Value::Null);
        }
        if item.get("firstCompletedAt").is_none() { item["firstCompletedAt"] = json!(now); }
        item["completedAt"] = json!(now);
        item.as_object_mut().unwrap().remove("completionObservedAt");
    }
    if changed {
        let mut history = existing.and_then(|old| old["statusHistory"].as_array()).cloned().unwrap_or_default();
        history.push(json!({"status":status,"changedAt":now}));
        item["statusHistory"] = json!(history);
    }
    item["updatedAt"] = json!(now);
}
fn apply_category_changes(data: &mut Value, old: &[Value], new: &[Value]) {
    let old_set = old.iter().filter_map(Value::as_str).collect::<HashSet<_>>();
    let new_set = new.iter().filter_map(Value::as_str).collect::<HashSet<_>>();
    let removed = old.iter().filter_map(Value::as_str).filter(|value| !new_set.contains(value)).collect::<Vec<_>>();
    let added = new.iter().filter_map(Value::as_str).filter(|value| !old_set.contains(value)).collect::<Vec<_>>();
    let renamed = if removed.len() == 1 && added.len() == 1 { Some((removed[0], added[0])) } else { None };
    let removed_set = removed.iter().copied().collect::<HashSet<_>>();
    if let Some(items) = data["items"].as_array_mut() {
        for item in items {
            if renamed.is_some_and(|(from, _)| item["category"] == from) { item["category"] = json!(renamed.unwrap().1); }
            else if item["category"].as_str().is_some_and(|category| removed_set.contains(category)) { item["category"] = json!(""); }
        }
    }
    if let Some((from, to)) = renamed {
        if let Some(colors) = data.get_mut("categoryColors").and_then(Value::as_object_mut) {
            if let Some(color) = colors.remove(from) { colors.insert(to.to_string(), color); }
        }
    } else if let Some(colors) = data.get_mut("categoryColors").and_then(Value::as_object_mut) {
        for category in removed { colors.remove(category); }
    }
}
fn validate_calendar(value: &Value) -> Result<(), String> {
    validate_calendar_limit(value, true)
}
fn validate_calendar_limit(value: &Value, limited: bool) -> Result<(), String> {
    if value["schemaVersion"] != 1 || !value["items"].is_array() || !value["categories"].is_array() {
        return Err("Calendar data has an unsupported or invalid format.".into());
    }
    if (limited && value["items"].as_array().unwrap().len() > 10_000) || value["categories"].as_array().unwrap().len() > 100 {
        return Err("Calendar data exceeds the record limit.".into());
    }
    let mut ids = HashSet::new();
    for item in value["items"].as_array().unwrap() {
        let id = item["id"].as_str().filter(|id| !id.is_empty() && id.len() <= 100).ok_or("Calendar item has an invalid ID.")?;
        if !ids.insert(id) || item["title"].as_str().is_none_or(|s| s.trim().is_empty() || s.chars().count() > 500) {
            return Err("Calendar items must have unique IDs and titles up to 500 characters.".into());
        }
        if !["task", "event"].contains(&item["kind"].as_str().unwrap_or("")) {
            return Err("Calendar item type is invalid.".into());
        }
        if !["todo", "in_progress", "in_review", "done"].contains(&item["status"].as_str().unwrap_or("todo"))
            || !["normal", "medium", "high", "urgent"].contains(&item["priority"].as_str().unwrap_or(""))
            || item["checklist"].as_array().is_none_or(|rows| rows.len() > 500)
            || item["progress"].as_u64().is_none_or(|progress| progress > 100)
        { return Err("Calendar item fields are invalid.".into()); }
        for key in ["firstCompletedAt", "completedAt", "completionObservedAt"] {
            if item.get(key).is_some_and(|value| {
                value.as_str().is_none_or(|stamp| DateTime::parse_from_rfc3339(stamp).is_err())
            }) { return Err("Calendar completion timestamp is invalid.".into()); }
        }
        if item.get("originalStart").is_some_and(|value| value.as_str().is_none_or(|start| start.is_empty() || start.len() > 100)) {
            return Err("Calendar original start is invalid.".into());
        }
        if item.get("statusHistory").is_some_and(|value| {
            value.as_array().is_none_or(|history| history.iter().any(|entry| {
                !["todo", "in_progress", "in_review", "done"].contains(&entry["status"].as_str().unwrap_or(""))
                    || entry["changedAt"].as_str().is_none_or(|stamp| DateTime::parse_from_rfc3339(stamp).is_err())
            }))
        }) { return Err("Calendar status history is invalid.".into()); }
        let start = item.get("start").and_then(Value::as_str).map(|value| value.get(..10).unwrap_or("")).unwrap_or("");
        let due = item.get("due").and_then(Value::as_str).map(|value| value.get(..10).unwrap_or("")).unwrap_or("");
        if !start.is_empty() && !due.is_empty() {
            NaiveDate::parse_from_str(start, "%Y-%m-%d").map_err(|_| "Calendar start date is invalid.")?;
            NaiveDate::parse_from_str(due, "%Y-%m-%d").map_err(|_| "Calendar end date is invalid.")?;
            if due < start { return Err("Calendar end date cannot be before its start date.".into()); }
            if item["kind"] == "event" && item["allDay"] != true && start == due {
                if let (Some(start_time), Some(end_time)) = (item["start"].as_str().and_then(|value| value.get(11..16)), item["endTime"].as_str()) {
                    if end_time < start_time { return Err("Calendar event end time cannot be before its start time.".into()); }
                }
            }
        }
    }
    if value["categories"].as_array().unwrap().iter().any(|v| v.as_str().is_none_or(|s| s.trim().is_empty() || s.chars().count() > 100)) {
        return Err("Calendar category is invalid.".into());
    }
    if let Some(colors) = value.get("categoryColors") {
        let colors = colors.as_object().ok_or("Calendar category colors are invalid.")?;
        if colors.iter().any(|(category, color)| {
            !value["categories"].as_array().unwrap().iter().any(|name| name.as_str() == Some(category))
                || color.as_str().is_none_or(|color| {
                    color.len() != 7
                        || !color.starts_with('#')
                        || !color[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
                })
        }) {
            return Err("Calendar category colors are invalid.".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod calendar_tests {
    use super::{apply_completion_transition, board_done_visible, calendar_category_counts, normalize_legacy_completions, overlaps_range, preserve_locked_starts, query_calendar_at, read_calendar_at, save_calendar_changes_at, validate_calendar, write_at, write_calendar_at, Value, BOARD_DONE_MS};
    use chrono::{DateTime, Duration, Utc};
    use serde_json::json;
    use std::{collections::{HashMap, HashSet}, fs, path::{Path, PathBuf}};
    use uuid::Uuid;

    fn temp_calendar() -> PathBuf {
        std::env::temp_dir().join(format!("b6h-calendar-{}.json", Uuid::new_v4()))
    }
    fn remove_temp(path: &Path) {
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(path.with_extension("json.b6h-electron-backup"));
    }

    fn valid() -> Value {
        json!({"schemaVersion":1,"categories":[],"items":[{"id":"one","kind":"task","title":"Việc cần làm","status":"todo","priority":"normal","checklist":[],"progress":0}]})
    }

    #[test]
    fn calendar_accepts_unicode_and_valid_records() { assert!(validate_calendar(&valid()).is_ok()); }

    #[test]
    fn calendar_rejects_duplicate_ids_and_invalid_status() {
        let mut data = valid(); let duplicate = data["items"][0].clone(); data["items"].as_array_mut().unwrap().push(duplicate);
        assert!(validate_calendar(&data).is_err());
        let mut data = valid(); data["items"][0]["status"] = json!("not-a-status");
        assert!(validate_calendar(&data).is_err());
    }

    #[test]
    fn calendar_accepts_optional_category_colors_and_legacy_data() {
        let mut data = valid();
        assert!(validate_calendar(&data).is_ok());
        data["categories"] = json!(["Work"]);
        data["categoryColors"] = json!({"Work":"#ef476f"});
        assert!(validate_calendar(&data).is_ok());
    }

    #[test]
    fn calendar_rejects_invalid_or_unknown_category_colors() {
        let mut data = valid();
        data["categories"] = json!(["Work"]);
        data["categoryColors"] = json!({"Work":"red"});
        assert!(validate_calendar(&data).is_err());
        data["categoryColors"] = json!({"Unknown":"#ef476f"});
        assert!(validate_calendar(&data).is_err());
    }

    #[test]
    fn completion_locks_exact_start_and_keeps_end_editable() {
        let before = json!({"id":"one","kind":"event","title":"Event","status":"in_progress","priority":"normal","start":"2026-11-07T09:15:00+07:00","due":"2026-11-07","endTime":"10:00","checklist":[],"progress":0});
        let mut done = json!({"id":"one","kind":"event","title":"Event","status":"done","priority":"normal","start":"2026-11-08T11:30:00+07:00","due":"2026-11-09","endTime":"12:30","checklist":[],"progress":0});
        apply_completion_transition(Some(&before), &mut done, "2026-11-08T04:00:00Z");
        assert_eq!(done["start"], "2026-11-07T09:15:00+07:00");
        assert_eq!(done["originalStart"], done["start"]);
        assert_eq!(done["due"], "2026-11-09");
        assert_eq!(done["endTime"], "12:30");
        assert_eq!(done["firstCompletedAt"], "2026-11-08T04:00:00Z");
        assert_eq!(done["completedAt"], "2026-11-08T04:00:00Z");
        assert_eq!(done["statusHistory"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn reopening_and_recompletion_keep_one_record_and_only_record_real_transitions() {
        let first = json!({"id":"one","kind":"task","title":"Task","status":"todo","priority":"normal","start":"2026-11-07","due":"2026-11-08","checklist":[],"progress":0});
        let mut done = first.clone(); done["status"] = json!("done");
        apply_completion_transition(Some(&first), &mut done, "2026-11-08T04:00:00Z");
        let first_completed = done["firstCompletedAt"].clone();
        let mut same_done = done.clone(); same_done["title"] = json!("Edited");
        apply_completion_transition(Some(&done), &mut same_done, "2026-11-08T05:00:00Z");
        assert_eq!(same_done["completedAt"], "2026-11-08T04:00:00Z");
        assert_eq!(same_done["statusHistory"].as_array().unwrap().len(), 1);
        let mut reopened = same_done.clone(); reopened["status"] = json!("in_review"); reopened["start"] = json!("2026-11-10");
        apply_completion_transition(Some(&same_done), &mut reopened, "2026-11-09T04:00:00Z");
        assert_eq!(reopened["start"], "2026-11-07");
        assert_eq!(reopened["firstCompletedAt"], first_completed);
        let mut done_again = reopened.clone(); done_again["status"] = json!("done");
        apply_completion_transition(Some(&reopened), &mut done_again, "2026-11-10T04:00:00Z");
        assert_eq!(done_again["completedAt"], "2026-11-10T04:00:00Z");
        assert_eq!(done_again["statusHistory"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn board_visibility_uses_exact_elapsed_72_hours() {
        let completed = json!({"completedAt":"2026-11-01T00:00:00Z"});
        let instant = DateTime::parse_from_rfc3339("2026-11-01T00:00:00Z").unwrap().with_timezone(&Utc);
        assert!(board_done_visible(&completed, &(instant + Duration::milliseconds(BOARD_DONE_MS - 1))));
        assert!(!board_done_visible(&completed, &(instant + Duration::milliseconds(BOARD_DONE_MS))));
        assert!(!board_done_visible(&completed, &(instant + Duration::hours(73))));
        assert!(!board_done_visible(&completed, &(instant - Duration::milliseconds(1))));
        assert!(!board_done_visible(&json!({"completedAt":"not-a-date"}), &instant));
    }

    #[test]
    fn legacy_done_observation_is_distinct_from_actual_completion() {
        let mut data = json!({"items":[{"id":"legacy","status":"done","start":"2020-01-02T08:30:00-05:00"},{"id":"old-event","kind":"event","title":"Old event","start":"2020-01-03T09:00:00+07:00"}]});
        assert!(normalize_legacy_completions(&mut data, "2026-11-08T00:00:00Z"));
        assert_eq!(data["items"][0]["originalStart"], "2020-01-02T08:30:00-05:00");
        assert_eq!(data["items"][0]["completionObservedAt"], "2026-11-08T00:00:00Z");
        assert!(data["items"][0].get("completedAt").is_none());
        assert_eq!(data["items"][1]["status"], "todo");
        assert!(data["items"][1].get("statusHistory").is_none());
    }

    #[test]
    fn full_backup_restore_cannot_unlock_a_completed_start() {
        let existing = json!({"items":[{"id":"one","status":"done","start":"2026-11-07T09:15:00+07:00","originalStart":"2026-11-07T09:15:00+07:00","firstCompletedAt":"2026-11-08T04:00:00Z","completedAt":"2026-11-08T04:00:00Z","statusHistory":[{"status":"done","changedAt":"2026-11-08T04:00:00Z"}]}]});
        let mut imported = json!({"items":[{"id":"one","status":"todo","start":"2030-01-01T00:00:00Z"}]});
        preserve_locked_starts(&existing, &mut imported);
        assert_eq!(imported["items"][0]["start"], "2026-11-07T09:15:00+07:00");
        assert_eq!(imported["items"][0]["completedAt"], "2026-11-08T04:00:00Z");
    }

    #[test]
    fn history_range_query_keeps_items_that_overlap_window() {
        let item = json!({"originalStart":"2020-01-01","start":"2020-01-01","due":"2026-11-10"});
        assert!(overlaps_range(&item, "2026-11-08", "2026-11-12"));
        assert!(!overlaps_range(&item, "2026-11-11", "2026-11-12"));
    }

    #[test]
    fn json_incremental_updates_preserve_unknown_fields_and_reject_stale_writes() {
        let path = temp_calendar();
        let original = json!({"schemaVersion":1,"categories":[],"items":[{"id":"one","kind":"task","title":"Task","status":"todo","priority":"normal","start":"2026-11-07T09:15:00+07:00","due":"2026-11-08","endTime":"10:00","checklist":[],"progress":0,"updatedAt":"v1","vendorField":{"kept":true}}]});
        write_at(&path, &original).unwrap();
        let mut completed = original["items"][0].clone();
        completed["status"] = json!("done"); completed["start"] = json!("2026-11-09T12:00:00+07:00");
        completed["due"] = json!("2026-11-10"); completed["endTime"] = json!("13:00");
        let mut expected = HashMap::new(); expected.insert("one".into(), Some("v1".into()));
        save_calendar_changes_at(&path, json!({"schemaVersion":1,"categories":[],"items":[completed.clone()]}), expected.clone(), vec![]).unwrap();
        let saved = read_calendar_at(&path).unwrap();
        let saved_item = &saved["items"][0];
        assert_eq!(saved["items"].as_array().unwrap().len(), 1);
        assert_eq!(saved_item["start"], "2026-11-07T09:15:00+07:00");
        assert_eq!(saved_item["due"], "2026-11-10");
        assert_eq!(saved_item["endTime"], "13:00");
        assert_eq!(saved_item["vendorField"]["kept"], true);
        assert_eq!(saved_item["statusHistory"].as_array().unwrap().len(), 1);
        assert!(save_calendar_changes_at(&path, json!({"schemaVersion":1,"categories":[],"items":[completed]}), expected, vec![]).is_err());
        assert_eq!(read_calendar_at(&path).unwrap()["items"][0]["status"], "done");
        remove_temp(&path);
    }

    #[test]
    fn json_range_queries_keep_historical_overlap_and_board_hides_expired_done() {
        let path = temp_calendar();
        let now = Utc::now();
        let recent = (now - Duration::hours(1)).to_rfc3339();
        let expired = (now - Duration::hours(73)).to_rfc3339();
        let data = json!({"schemaVersion":1,"categories":[],"items":[
            {"id":"old-event","kind":"event","title":"Old event","status":"done","priority":"normal","start":"2020-01-01T08:00:00-05:00","due":"2026-11-09","endTime":"09:00","checklist":[],"progress":0,"completedAt":expired},
            {"id":"recent-task","kind":"task","title":"Recent","status":"done","priority":"normal","start":"2020-01-01","due":"2020-01-01","checklist":[],"progress":0,"completedAt":recent},
            {"id":"expired-task","kind":"task","title":"Expired","status":"done","priority":"normal","start":"2020-01-01","due":"2020-01-01","checklist":[],"progress":0,"completedAt":expired}
        ]});
        write_at(&path, &data).unwrap();
        let history = query_calendar_at(&path, "2026-11-08", "2026-11-10", false).unwrap();
        assert_eq!(history["items"].as_array().unwrap().len(), 1);
        assert_eq!(history["items"][0]["id"], "old-event");
        let board = query_calendar_at(&path, "2026-11-08", "2026-11-08", true).unwrap();
        let ids = board["items"].as_array().unwrap().iter().map(|item| item["id"].as_str().unwrap()).collect::<Vec<_>>();
        assert!(ids.contains(&"recent-task"));
        assert!(!ids.contains(&"expired-task"));
        remove_temp(&path);
    }

    #[test]
    fn range_query_returns_only_recurrences_with_an_occurrence_in_view() {
        let path = temp_calendar();
        let data = json!({"schemaVersion":1,"categories":[],"items":[
            {"id":"daily","kind":"task","title":"Daily","status":"todo","priority":"normal","start":"2020-01-01","due":"2020-01-01","recurrence":"daily","checklist":[],"progress":0},
            {"id":"not-in-view","kind":"task","title":"Yearly other day","status":"todo","priority":"normal","start":"2020-11-07","due":"2020-11-07","recurrence":"yearly","checklist":[],"progress":0},
            {"id":"multi-event","kind":"event","title":"Multi-day recurrence","status":"todo","priority":"normal","start":"2020-11-08T09:00:00-05:00","due":"2020-11-10","recurrence":"yearly","checklist":[],"progress":0,"endTime":"10:00"},
            {"id":"old","kind":"task","title":"Old history","status":"done","priority":"normal","start":"2010-01-01","due":"2010-01-01","checklist":[],"progress":0}
        ]});
        write_at(&path, &data).unwrap();
        let result = query_calendar_at(&path, "2026-11-09", "2026-11-09", false).unwrap();
        let ids = result["items"].as_array().unwrap().iter().map(|item| item["id"].as_str().unwrap()).collect::<HashSet<_>>();
        assert!(ids.contains("daily"));
        assert!(ids.contains("multi-event"));
        assert!(!ids.contains("not-in-view"));
        assert!(!ids.contains("old"));
        remove_temp(&path);
    }

    #[test]
    fn category_counts_include_zeroes_and_count_items_in_one_result() {
        let items = vec![json!({"category":"Work"}), json!({"category":"Home"}), json!({"category":"Work"})];
        assert_eq!(calendar_category_counts(&items, &json!(["Work", "Home", "Empty"])), json!({"Work":2,"Home":1,"Empty":0}));
    }

    #[test]
    fn category_rename_and_delete_include_records_outside_the_queried_range() {
        let path = temp_calendar();
        let original = json!({"schemaVersion":1,"categories":["Work","Home"],"categoryColors":{"Work":"#ef476f","Home":"#3a86ff"},"items":[
            {"id":"visible","kind":"task","title":"Visible","category":"Work","status":"todo","priority":"normal","start":"2026-11-08","due":"2026-11-08","checklist":[],"progress":0,"updatedAt":"v1"},
            {"id":"hidden","kind":"task","title":"Hidden history","category":"Work","status":"done","priority":"normal","start":"2010-01-01","due":"2010-01-01","checklist":[],"progress":0,"updatedAt":"v2","vendorField":{"kept":true}},
            {"id":"home","kind":"task","title":"Other category","category":"Home","status":"todo","priority":"normal","start":"2026-11-08","due":"2026-11-08","checklist":[],"progress":0,"updatedAt":"v3"}
        ]});
        write_at(&path, &original).unwrap();
        let narrow = query_calendar_at(&path, "2026-11-08", "2026-11-08", false).unwrap();
        assert_eq!(narrow["items"].as_array().unwrap().len(), 2);
        assert_eq!(narrow["categoryCounts"]["Work"], 2);
        let mut visible = narrow["items"][0].clone(); visible["title"] = json!("Visible edited"); visible["category"] = json!("Office");
        let mut expected = HashMap::new(); expected.insert("visible".into(), Some("v1".into()));
        save_calendar_changes_at(&path, json!({"schemaVersion":1,"categories":["Office","Home"],"categoryColors":{"Office":"#ef476f","Home":"#3a86ff"},"items":[visible]}), expected, vec![]).unwrap();
        let renamed = read_calendar_at(&path).unwrap();
        assert_eq!(renamed["items"][0]["category"], "Office");
        assert_eq!(renamed["items"][0]["title"], "Visible edited");
        assert_eq!(renamed["items"][1]["category"], "Office");
        assert_eq!(renamed["items"][1]["vendorField"]["kept"], true);
        assert_eq!(renamed["items"][1]["id"], "hidden");
        assert_eq!(renamed["categoryColors"]["Office"], "#ef476f");
        save_calendar_changes_at(&path, json!({"schemaVersion":1,"categories":["Office"],"categoryColors":{"Office":"#ef476f"},"items":[]}), HashMap::new(), vec![]).unwrap();
        let deleted = read_calendar_at(&path).unwrap();
        assert_eq!(deleted["items"][0]["category"], "Office");
        assert_eq!(deleted["items"][2]["category"], "");
        assert!(deleted["categoryColors"].get("Home").is_none());
        remove_temp(&path);
    }

    #[test]
    fn indexed_changes_keep_order_append_new_items_and_validate_before_writing() {
        let path = temp_calendar();
        let original = json!({"schemaVersion":1,"categories":[],"items":[
            {"id":"a","kind":"task","title":"A","status":"todo","priority":"normal","start":"2026-11-08","due":"2026-11-08","checklist":[],"progress":0,"updatedAt":"v1"},
            {"id":"b","kind":"task","title":"B","status":"todo","priority":"normal","start":"2026-11-08","due":"2026-11-08","checklist":[],"progress":0,"updatedAt":"v2"},
            {"id":"c","kind":"task","title":"C","status":"todo","priority":"normal","start":"2026-11-08","due":"2026-11-08","checklist":[],"progress":0,"updatedAt":"v3"}
        ]});
        write_at(&path, &original).unwrap();
        let mut expected = HashMap::new(); expected.insert("c".into(), Some("v3".into())); expected.insert("d".into(), None); expected.insert("b".into(), Some("v2".into()));
        let mut changed = original["items"][2].clone(); changed["title"] = json!("C edited");
        let new_item = json!({"id":"d","kind":"task","title":"D","status":"todo","priority":"normal","start":"2026-11-08","due":"2026-11-08","checklist":[],"progress":0});
        save_calendar_changes_at(&path, json!({"schemaVersion":1,"categories":[],"items":[changed, new_item]}), expected, vec!["b".into()]).unwrap();
        let saved = read_calendar_at(&path).unwrap();
        let ids = saved["items"].as_array().unwrap().iter().map(|item| item["id"].as_str().unwrap()).collect::<Vec<_>>();
        assert_eq!(ids, ["a", "c", "d"]);
        assert_eq!(saved["items"][1]["title"], "C edited");
        let before = fs::read(&path).unwrap();
        let mut expected = HashMap::new(); expected.insert("a".into(), Some("v1".into()));
        let conflict = save_calendar_changes_at(&path, json!({"schemaVersion":1,"categories":[],"items":[saved["items"][0].clone()]}), expected.clone(), vec!["a".into()]);
        assert!(conflict.is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        assert!(save_calendar_changes_at(&path, json!({"schemaVersion":1,"categories":[],"items":[]}), HashMap::new(), vec!["a".into(), "a".into()]).is_err());
        remove_temp(&path);
    }

    #[test]
    fn calendar_size_limit_checks_the_actual_pretty_bytes_before_replacing_file() {
        let path = temp_calendar();
        let original = json!({"schemaVersion":1,"categories":[],"items":[]});
        write_at(&path, &original).unwrap();
        let before = fs::read(&path).unwrap();
        let too_large = json!({"schemaVersion":1,"categories":[],"items":[{"id":"large","kind":"task","title":"Large","description":"x".repeat(10_000_001),"status":"todo","priority":"normal","start":"2026-11-08","due":"2026-11-08","checklist":[],"progress":0}]});
        assert!(write_calendar_at(&path, &too_large).is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        remove_temp(&path);
    }


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
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    write_bytes_at(path, &bytes)
}
#[cfg(test)]
fn write_calendar_at(path: &Path, value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    if bytes.len() > 10_000_000 { return Err("Calendar data exceeds the 10 MB safety limit.".into()); }
    write_bytes_at(path, &bytes)
}
fn write_bytes_at(path: &Path, bytes: &[u8]) -> Result<(), String> {
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    if path.exists() {
        let backup = path.with_extension("json.b6h-electron-backup");
        if !backup.exists() {
            fs::copy(&path, &backup).map_err(|e| e.to_string())?;
        }
    }
    let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    if let Err(error) = fs::write(&temp, bytes) {
        let _ = fs::remove_file(&temp);
        return Err(error.to_string());
    }
    if let Err(error) = fs::rename(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(error.to_string());
    }
    Ok(())
}
fn chat_path() -> Result<PathBuf, String> {
    Ok(user_dir()?.join("chat-session.json"))
}
pub fn chat_session() -> Result<Option<Value>, String> {
    chat_session_at(&chat_path()?)
}
fn chat_session_at(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() { return Ok(None); }
    let bytes = fs::read(&path).map_err(|e| format!("Could not read chatbot session: {e}"))?;
    if bytes.len() > 1_000_000 { return Err("Chatbot session is too large to restore.".into()); }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "Chatbot session data is invalid. Reset the chatbot to continue.".to_string())?;
    validate_chat_session(&value).map_err(|_| "Chatbot session data is invalid. Reset the chatbot to continue.".to_string())?;
    Ok(Some(value))
}
fn validate_chat_session(value: &Value) -> Result<(), String> {
    let messages = value.get("messages").and_then(Value::as_array).ok_or("Invalid chatbot session.")?;
    let count = value.get("userQuestionCount").and_then(Value::as_u64).ok_or("Invalid chatbot session.")?;
    if value["schemaVersion"] != 1 || value["sessionId"].as_str().is_none_or(|id| id.is_empty() || id.len() > 100) || count > 20 || messages.len() > 40 || messages.iter().filter(|message| message["role"] == "user").count() as u64 != count {
        return Err("Invalid chatbot session.".into());
    }
    for message in messages {
        let role = message["role"].as_str().ok_or("Invalid chatbot session.")?;
        let mode = message["mode"].as_str().ok_or("Invalid chatbot session.")?;
        let status = message["status"].as_str().ok_or("Invalid chatbot session.")?;
        let text = message["text"].as_str().ok_or("Invalid chatbot session.")?;
        let limit = if role == "user" { 1000 } else { 32000 };
        if !["user", "assistant"].contains(&role) || !["offline", "online"].contains(&mode) || !["accepted", "pending", "complete", "error", "interrupted"].contains(&status) || text.chars().count() > limit || message["id"].as_str().is_none_or(|id| id.is_empty() || id.len() > 100) || !message["createdAt"].is_number() {
            return Err("Invalid chatbot session.".into());
        }
        if let Some(context) = message.get("context") {
            let faq_ids = ["rename", "scan", "count", "merge", "backup", "translation", "signature", "copies", "settings", "privacy", "word-recent", "word-shortcuts", "word-multiple-files", "word-documents", "features"];
            let invalid_scalar = ["fieldId", "validationCode", "errorCode", "previousFaqId"].iter().any(|key| {
                context.get(*key).is_some_and(|value| !value.is_null() && value.as_str().is_none())
            });
            let invalid_faq_ids = context.get("faqIds").is_some_and(|ids| {
                ids.as_array().is_none_or(|ids| ids.len() > 3 || ids.iter().any(|id| {
                    id.as_str().is_none_or(|id| !faq_ids.contains(&id))
                }))
            });
            if context["selector"].as_str().is_none_or(|selector| !["home", "rename", "count", "translation", "signature", "copies", "word", "settings"].contains(&selector))
                || invalid_scalar
                || context["fieldId"].as_str().is_some_and(|field| !["refNo", "quantity", "unitPrice", "totalAmount", "customer", "description"].contains(&field))
                || context["validationCode"].as_str().is_some_and(|code| !["copiesNumbersInvalid", "browser-invalid", "signatureHeaderInvalid"].contains(&code))
                || context["errorCode"].as_str().is_some_and(|code| !["access_error", "file_not_found", "workbook_format_error", "ipc_error", "online_error", "validation_error", "operation_error"].contains(&code))
                || context["previousFaqId"].as_str().is_some_and(|id| !faq_ids.contains(&id))
                || invalid_faq_ids
            {
                return Err("Invalid chatbot session context.".into());
            }
        }
    }
    Ok(())
}
pub fn save_chat_session(value: &Value) -> Result<(), String> {
    save_chat_session_at(&chat_path()?, value)
}
fn save_chat_session_at(path: &Path, value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    if bytes.len() > 1_000_000 { return Err("Chatbot session is too large to save.".into()); }
    validate_chat_session(value)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| format!("Could not save chatbot session: {e}"))?;
    let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    fs::write(&temp, bytes).map_err(|e| format!("Could not save chatbot session: {e}"))?;
    if let Err(error) = fs::rename(&temp, &path) {
        let _ = fs::remove_file(&temp);
        return Err(format!("Could not save chatbot session: {error}"));
    }
    Ok(())
}
pub fn reset_chat_session() -> Result<(), String> {
    reset_chat_session_at(&chat_path()?)
}
fn reset_chat_session_at(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not reset chatbot session: {error}")),
    }?;
    let Some(parent) = path.parent() else { return Ok(()); };
    let prefix = format!("{}.", path.file_stem().and_then(|name| name.to_str()).unwrap_or("chat-session"));
    let entries = match fs::read_dir(parent) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Could not reset chatbot session: {error}")),
    };
    for entry in entries {
        let entry = entry.map_err(|e| format!("Could not reset chatbot session: {e}"))?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with(&prefix) && name.ends_with(".tmp") { fs::remove_file(entry.path()).map_err(|e| format!("Could not reset chatbot session: {e}"))?; }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copies_defaults_fill_legacy_settings_but_keep_explicit_blanks() {
        let mut legacy = json!({"header:number":"Entry"});
        copies_defaults(&mut legacy);
        assert_eq!(legacy["companyName"], COPIES_COMPANY_NAME);
        assert_eq!(legacy["businessAddress"], COPIES_ADDRESS);
        assert_eq!(legacy["taxId"], COPIES_TAX_ID);
        let mut cleared = json!({"companyName":"", "businessAddress":"", "taxId":""});
        copies_defaults(&mut cleared);
        assert_eq!(cleared["companyName"], "");
        assert_eq!(cleared["businessAddress"], "");
        assert_eq!(cleared["taxId"], "");
    }
    #[test]
    fn copies_business_settings_are_validated_as_bounded_strings() {
        validate_labels(
            &json!({"companyName":"", "businessAddress":"A", "taxId":"000 123"}),
            Some("copies"),
        )
        .unwrap();
        assert!(validate_labels(&json!({"taxId":"x".repeat(1001)}), Some("copies")).is_err());
        assert!(validate_labels(&json!({"companyName":"name"}), Some("translation")).is_err());
    }
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
    #[test]
    fn chatbot_session_replaces_and_resets_only_its_unarchived_file() {
        let dir = std::env::temp_dir().join(format!("b6h-chat-session-{}", Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("chat-session.json");
        let session = json!({"schemaVersion":1,"sessionId":"test","userQuestionCount":1,"messages":[
            {"id":"q1","requestId":"r1","role":"user","mode":"offline","text":"How do I save?","status":"accepted","createdAt":1,"context":{"selector":"copies","faqIds":["copies"]}},
            {"id":"a1","requestId":"r1","role":"assistant","mode":"offline","text":"Use Save.","status":"complete","createdAt":1}
        ]});
        save_chat_session_at(&path, &session).unwrap();
        save_chat_session_at(&path, &session).unwrap();
        assert_eq!(chat_session_at(&path).unwrap().unwrap()["userQuestionCount"], 1);
        assert!(!path.with_extension("json.b6h-electron-backup").exists());
        fs::write(dir.join("chat-session.old.tmp"), "old").unwrap();
        reset_chat_session_at(&path).unwrap();
        assert_eq!(chat_session_at(&path).unwrap(), None);
        assert!(!dir.join("chat-session.old.tmp").exists());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn malformed_chat_session_is_reported_without_deleting_it() {
        let dir = std::env::temp_dir().join(format!("b6h-chat-invalid-{}", Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("chat-session.json");
        fs::write(&path, b"not json").unwrap();
        assert!(chat_session_at(&path).is_err());
        assert!(path.exists());
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
        "scanOnLaunch": saved.get("scanOnLaunch").and_then(Value::as_bool).unwrap_or(true),
        "showDocxCompatibilityWarnings": saved.get("showDocxCompatibilityWarnings").and_then(Value::as_bool).unwrap_or(true)
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
    word.insert(
        "showDocxCompatibilityWarnings".into(),
        json!(
            value
                .get("showDocxCompatibilityWarnings")
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
            if selector == Some("copies")
                && ["companyName", "businessAddress", "taxId"].contains(&key.as_str())
            {
                continue;
            }
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
    let mut value = read(&format!("{selector}-settings.json"))?;
    if selector == "copies" {
        copies_defaults(&mut value);
    }
    validate_labels(&value, Some(selector))?;
    Ok(value)
}
pub fn save_selector_settings(selector: &str, value: Value) -> Result<Value, String> {
    let mut value = value;
    if selector == "copies" {
        copies_defaults(&mut value);
    }
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
