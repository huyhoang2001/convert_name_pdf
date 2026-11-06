use chrono::{Duration, NaiveDate};
use serde_json::{Map, Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use umya_spreadsheet::{
    self as xlsx,
    structs::{HorizontalAlignmentValues, VerticalAlignmentValues, Worksheet},
};
use unicode_normalization::UnicodeNormalization;
use uuid::Uuid;

const T_KEYS: [&str; 9] = [
    "number",
    "date",
    "person",
    "document",
    "languages",
    "certifier",
    "copies",
    "fee",
    "notes",
];
const T_EN: [&str; 9] = [
    "Serial / certification number",
    "Certification date",
    "Full name and number of Citizen Identity Card/Identity Card/Electronic Identity/Certificate of Identity or Passport/immigration or international travel document",
    "Translated document name",
    "Translated from / to",
    "Certifying signer and title",
    "Number of certified translated copies",
    "Certification fee",
    "Notes",
];
const T_VI: [&str; 9] = [
    "Số thứ tự / số chứng thực",
    "Ngày tháng năm chứng thực",
    "Họ tên, số Thẻ căn cước công dân/Thẻ căn cước/Căn cước điện tử/Giấy chứng nhận căn cước hoặc Hộ chiếu/giấy tờ xuất nhập cảnh/giấy tờ có giá trị đi lại quốc tế",
    "Tên của giấy tờ, văn bản đã được dịch",
    "Dịch từ tiếng sang tiếng",
    "Họ tên, chức danh người ký chứng thực",
    "Số lượng bản dịch đã được chứng thực chữ ký",
    "Phí chứng thực",
    "Ghi chú",
];
const S_KEYS: [&str; 8] = [
    "number",
    "date",
    "person",
    "document",
    "certifier",
    "copies",
    "fee",
    "notes",
];
const S_SETTING: [&str; 8] = [
    "signatureHeaderNumber",
    "signatureHeaderDate",
    "signatureHeaderPerson",
    "signatureHeaderDocument",
    "signatureHeaderSigner",
    "signatureHeaderCount",
    "signatureHeaderFee",
    "signatureHeaderNotes",
];
const S_VI: [&str; 8] = [
    "Số Chứng thực/Số thứ tự",
    "Ngày tháng năm chứng thực",
    "Họ tên, số Thẻ căn cước công dân/Thẻ căn cước/Căn cước điện tử/Giấy chứng nhận căn cước hoặc Hộ chiếu/giấy tờ xuất nhập cảnh/giấy tờ có giá trị đi lại quốc tế",
    "Tên của giấy tờ, văn bản đã chứng thực chữ ký/điểm chỉ",
    "Họ tên, chức danh người ký chứng thực",
    "Số lượng giấy giấy tờ, văn bản đã chứng thực chữ ký/điểm chỉ",
    "Phí chứng thực",
    "Ghi chú",
];
const S_APP: [&str; 8] = [
    "Số Chứng thực/Số thứ tự",
    "Ngày chứng thực",
    "Họ tên, số Thẻ căn cước công dân/Thẻ căn cước/Căn cước điện tử/Giấy chứng nhận căn cước hoặc Hộ chiếu/giấy tờ xuất nhập cảnh/giấy tờ có giá trị đi lại quốc tế",
    "Tên giấy tờ/văn bản được chứng thực chữ ký/điểm chỉ",
    "Họ tên, chức danh người ký chứng thực",
    "Số lượng giấy tờ/văn bản được chứng thực chữ ký/điểm chỉ",
    "Phí chứng thực",
    "Ghi chú",
];
const S_EN: [&str; 8] = [
    "Serial / certification number",
    "Attestation date",
    "Full name and number of Citizen Identity Card/ID Card/Electronic Identity/Identity Certificate or Passport/immigration or international travel document",
    "Name of the documents/papers with certified signatures/fingerprints",
    "Name and title of certifying signer",
    "Number of documents/papers with certified signatures/fingerprints",
    "Certification fee",
    "Notes",
];
const C_KEYS: [&str; 7] = [
    "number",
    "refNo",
    "customer",
    "description",
    "quantity",
    "unitPrice",
    "total",
];
const C_VI: [&str; 7] = [
    "STT",
    "SCT",
    "Tên khách hàng",
    "Nội dung",
    "SL",
    "Số bản sao",
    "Thành tiền",
];
const C_ALIASES: [&[&str]; 7] = [
    &["no", "serial number", "stt"],
    &["ref no", "reference number", "sct"],
    &["customer name", "customer", "ten khach hang"],
    &["description", "content", "noi dung"],
    &["quantity", "qty", "sl"],
    &[
        "unit price",
        "number of copies",
        "copies",
        "so ban sao",
        "unit",
        "don gia",
        "don",
    ],
    &["total amount", "amount", "thanh tien"],
];

#[derive(Default)]
pub struct State {
    imported: Mutex<HashMap<PathBuf, (String, HashMap<String, String>)>>,
    operation: Arc<tokio::sync::Mutex<()>>,
}
impl State {
    pub fn operation_lock(&self) -> Arc<tokio::sync::Mutex<()>> {
        self.operation.clone()
    }

    pub fn clear(&self, kind: &str) -> Result<bool, String> {
        self.imported
            .lock()
            .map_err(|e| e.to_string())?
            .retain(|_, value| value.0 != kind);
        Ok(true)
    }
}
fn string(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or("").into()
}
fn normalize(value: &str) -> String {
    value
        .to_lowercase()
        .replace('đ', "d")
        .nfd()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
        .collect::<String>()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
fn date_text(value: &str) -> String {
    if let Ok(serial) = value.parse::<f64>() {
        if serial.is_finite() && serial >= 0.0 {
            if let Some(date) = NaiveDate::from_ymd_opt(1899, 12, 30)
                .and_then(|d| d.checked_add_signed(Duration::days(serial.floor() as i64)))
            {
                return date.format("%Y-%m-%d").to_string();
            }
        }
    }
    if let Ok(date) = NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        return date.format("%Y-%m-%d").to_string();
    }
    for format in ["%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%m-%d-%Y"] {
        if let Ok(date) = NaiveDate::parse_from_str(value, format) {
            return date.format("%Y-%m-%d").to_string();
        }
    }
    value.into()
}
fn date_serial(value: &str) -> Option<String> {
    let date = NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()?;
    Some(
        date.signed_duration_since(NaiveDate::from_ymd_opt(1899, 12, 30)?)
            .num_days()
            .to_string(),
    )
}
fn cell(sheet: &Worksheet, col: u32, row: u32) -> String {
    sheet
        .get_cell((col, row))
        .map(|c| c.get_value().into_owned())
        .unwrap_or_default()
}
fn rows(sheet: &Worksheet) -> Vec<Vec<String>> {
    let mut out = Vec::new();
    for row in 1..=sheet.get_highest_row().min(100_500) {
        let values: Vec<String> = (1..=sheet.get_highest_column().min(220))
            .map(|col| cell(sheet, col, row))
            .collect();
        if values.iter().any(|v| !v.is_empty()) {
            out.push(values)
        }
    }
    out
}
fn custom(settings: &Value) -> Vec<(String, String)> {
    settings
        .as_object()
        .map(|map| {
            map.keys()
                .filter_map(|key| {
                    key.strip_prefix("custom:")?
                        .strip_suffix(":label")
                        .map(|id| {
                            (
                                id.to_string(),
                                map.get(&format!("custom:{id}:header"))
                                    .and_then(Value::as_str)
                                    .unwrap_or("")
                                    .to_string(),
                            )
                        })
                })
                .collect()
        })
        .unwrap_or_default()
}
fn header_candidates(kind: &str, settings: &Value, language: &str) -> Vec<String> {
    match kind {
        "translation" => T_KEYS
            .iter()
            .enumerate()
            .map(|(i, key)| {
                settings
                    .get(format!("header:{key}"))
                    .and_then(Value::as_str)
                    .filter(|v| !v.trim().is_empty())
                    .unwrap_or(if language == "EN" { T_EN[i] } else { T_VI[i] })
                    .to_string()
            })
            .collect(),
        "signature" => S_KEYS
            .iter()
            .enumerate()
            .map(|(i, _)| {
                settings
                    .get(format!("header:{}", S_SETTING[i]))
                    .and_then(Value::as_str)
                    .filter(|v| !v.trim().is_empty())
                    .unwrap_or(if language == "EN" { S_EN[i] } else { S_APP[i] })
                    .to_string()
            })
            .collect(),
        _ => C_KEYS
            .iter()
            .enumerate()
            .map(|(i, key)| {
                settings
                    .get(format!("header:{key}"))
                    .and_then(Value::as_str)
                    .filter(|v| !v.trim().is_empty())
                    .unwrap_or(C_VI[i])
                    .to_string()
            })
            .collect(),
    }
}
fn matching_register(kind: &str, row: &[String], settings: &Value) -> Option<Vec<usize>> {
    let mut result = Vec::new();
    let configured = header_candidates(kind, settings, "VI");
    let keys: &[&str] = if kind == "translation" {
        &T_KEYS
    } else {
        &S_KEYS
    };
    for i in 0..keys.len() {
        let mut options = vec![configured[i].as_str(), keys[i]];
        if kind == "translation" {
            options.extend([T_EN[i], T_VI[i]]);
            if keys[i] == "person" {
                options.extend(["Enter information", "Nhập thông tin"]);
            }
        } else {
            options.extend([S_VI[i], S_APP[i], S_EN[i]]);
        }
        let index = row.iter().position(|value| {
            let actual = normalize(value);
            options.iter().any(|option| {
                let expected = normalize(option);
                actual == expected
                    || (actual.len().min(expected.len()) >= 32
                        && (actual.starts_with(&expected) || expected.starts_with(&actual)))
            }) || (kind == "translation"
                && keys[i] == "person"
                && ["ho ten", "can cuoc", "ho chieu"]
                    .iter()
                    .all(|part| actual.contains(part)))
        });
        result.push(index?);
    }
    Some(result)
}
fn parse_register(kind: &str, sheet: &Worksheet, settings: &Value) -> Option<Value> {
    let all = rows(sheet);
    let keys: &[&str] = if kind == "translation" {
        &T_KEYS
    } else {
        &S_KEYS
    };
    for (start, header) in all.iter().enumerate() {
        let Some(indexes) = matching_register(kind, header, settings) else {
            continue;
        };
        let custom_indexes: Vec<_> = custom(settings)
            .into_iter()
            .map(|(id, name)| {
                (
                    id,
                    header.iter().position(|v| normalize(v) == normalize(&name)),
                )
            })
            .collect();
        let mut records = Vec::new();
        for row in all.iter().skip(start + 1) {
            if !indexes.iter().enumerate().any(|(i, index)| {
                i > 0 && !row.get(*index).unwrap_or(&String::new()).trim().is_empty()
            }) {
                continue;
            }
            let mut record = Map::new();
            record.insert(
                "id".into(),
                json!(format!(
                    "{}-{}",
                    if kind == "translation" {
                        "row"
                    } else {
                        "signature"
                    },
                    Uuid::new_v4()
                )),
            );
            for (i, key) in keys.iter().enumerate() {
                let raw = row.get(indexes[i]).cloned().unwrap_or_default();
                record.insert(
                    (*key).into(),
                    json!(if *key == "date" { date_text(&raw) } else { raw }),
                );
            }
            for (id, index) in &custom_indexes {
                record.insert(
                    format!("custom:{id}"),
                    json!(index.and_then(|i| row.get(i)).cloned().unwrap_or_default()),
                );
            }
            records.push(Value::Object(record));
        }
        return Some(json!(records));
    }
    None
}
pub fn parse_translation_rows(
    rows: &[Vec<String>],
    settings: &Value,
) -> Result<Option<Value>, String> {
    if rows.is_empty() {
        return Ok(None);
    }
    let header = &rows[0];
    let indexes = matching_register("translation", header, settings);
    let Some(indexes) = indexes else {
        return Ok(None);
    };
    let mut result = Vec::new();
    for row in rows.iter().skip(1) {
        if !indexes
            .iter()
            .skip(1)
            .any(|i| row.get(*i).is_some_and(|s| !s.trim().is_empty()))
        {
            continue;
        }
        let mut record = Map::new();
        record.insert("id".into(), json!(format!("import-{}", Uuid::new_v4())));
        for (i, key) in T_KEYS.iter().enumerate() {
            record.insert(
                (*key).into(),
                json!(row.get(indexes[i]).cloned().unwrap_or_default()),
            );
        }
        result.push(Value::Object(record));
    }
    Ok(Some(json!(result)))
}
fn parse_copies(sheet: &Worksheet, settings: &Value) -> Option<Value> {
    let all = rows(sheet);
    for (start, header) in all.iter().enumerate().take(20) {
        let mut indexes = Vec::new();
        for (i, key) in C_KEYS.iter().enumerate() {
            let aliases = C_ALIASES[i].iter().map(|s| s.to_string()).chain(
                settings
                    .get(format!("header:{key}"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
            );
            if let Some(index) = header
                .iter()
                .position(|v| aliases.clone().any(|a| normalize(v) == normalize(&a)))
            {
                indexes.push(index);
            } else {
                break;
            }
        }
        if indexes.len() != C_KEYS.len() {
            continue;
        }
        let custom_indexes: Vec<_> = custom(settings)
            .into_iter()
            .map(|(id, name)| {
                (
                    id,
                    header.iter().position(|v| normalize(v) == normalize(&name)),
                )
            })
            .collect();
        let mut records = Vec::new();
        for row in all.iter().skip(start + 1) {
            let seq = row.get(indexes[0]).map(String::as_str).unwrap_or("");
            if !seq.bytes().all(|b| b.is_ascii_digit()) || seq.is_empty() {
                continue;
            }
            let get = |i: usize| row.get(indexes[i]).cloned().unwrap_or_default();
            let quantity = get(4).replace(',', "");
            let unit = get(5).replace(',', "");
            let total = get(6).replace(',', "");
            if get(2).is_empty() && get(3).is_empty() && quantity.is_empty() && unit.is_empty() {
                continue;
            }
            let calculated = (quantity
                .parse::<u64>()
                .unwrap_or(0)
                .saturating_mul(unit.parse::<u64>().unwrap_or(0))
                + 1)
                / 2
                * 10000;
            let mut record = json!({"id":format!("copy-{}",Uuid::new_v4()),"refNo":get(1).replace(',',""),"customer":get(2),"description":get(3),"quantity":quantity,"unitPrice":unit,"totalAmount":total,"manualTotal":!get(6).is_empty()&&get(6).replace(',',"").parse::<u64>().unwrap_or(0)!=calculated});
            for (id, index) in &custom_indexes {
                record[format!("custom:{id}")] =
                    json!(index.and_then(|i| row.get(i)).cloned().unwrap_or_default())
            }
            records.push(record)
        }
        let first = cell(sheet, 1, 2);
        let date = regex::Regex::new(
            r"(?i)(\d{1,2})\s*(?:tháng|[/-])\s*(\d{1,2})\s*(?:năm|[/-])\s*(\d{4})",
        )
        .unwrap()
        .captures(&first)
        .map(|m| format!("{}-{:0>2}-{:0>2}", &m[3], &m[2], &m[1]))
        .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
        let address_row =
            if normalize(&cell(sheet, 1, 3)).starts_with(&normalize("Tên doanh nghiệp:")) {
                4
            } else {
                3
            };
        let address = cell(sheet, 1, address_row)
            .trim_start_matches("Địa chỉ: ")
            .to_string();
        return Some(
            json!({"name":sheet.get_name(),"title":cell(sheet,1,1),"address":address,"date":date,"rows":records}),
        );
    }
    None
}
fn valid_file(file: &str) -> Result<PathBuf, String> {
    let path = Path::new(file);
    if !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("xlsx"))
    {
        return Err("Choose a valid .xlsx workbook.".into());
    }
    Ok(path.to_path_buf())
}
fn resolve_import_file(file: &str) -> Result<PathBuf, String> {
    let path = Path::new(file);
    if !path.is_dir() {
        return valid_file(file);
    }

    let mut workbooks = Vec::new();
    for entry in
        fs::read_dir(path).map_err(|e| format!("Could not read the dropped folder: {e}"))?
    {
        let entry =
            entry.map_err(|e| format!("Could not read an item in the dropped folder: {e}"))?;
        if !entry
            .file_type()
            .map_err(|e| format!("Could not inspect an item in the dropped folder: {e}"))?
            .is_file()
        {
            continue;
        }
        let workbook = entry.path();
        let name = workbook
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        if name.starts_with("~$")
            || !workbook
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("xlsx"))
        {
            continue;
        }
        workbooks.push(workbook);
    }
    workbooks.sort();

    match workbooks.as_slice() {
        [workbook] => valid_file(&workbook.to_string_lossy()),
        [] => Err("The dropped folder does not contain an .xlsx workbook.".into()),
        _ => Err("The dropped folder contains multiple .xlsx workbooks. Place only the workbook to import in the folder.".into()),
    }
}
fn load(file: &Path) -> Result<xlsx::structs::Spreadsheet, String> {
    xlsx::reader::xlsx::read(file).map_err(|_|"This file could not be read as an Excel .xlsx workbook. It may be damaged, password-protected, or saved in an unsupported format.".into())
}
pub fn import(state: &State, kind: &str, file: &str, settings: &Value) -> Result<Value, String> {
    let path = resolve_import_file(file)?;
    let path = fs::canonicalize(path).map_err(|e| e.to_string())?;
    let book = load(&path)?;
    let mut sheets = Vec::new();
    let mut source = Map::new();
    for sheet in book.get_sheet_collection() {
        let parsed = if kind == "copies" {
            parse_copies(sheet, settings)
        } else {
            parse_register(kind, sheet, settings)
        };
        if let Some(value) = parsed {
            let id = format!("{kind}-sheet-{}", Uuid::new_v4());
            let mut register = value.as_object().cloned().unwrap_or_else(|| {
                let mut map = Map::new();
                map.insert("rows".into(), value);
                map
            });
            register.insert("id".into(), json!(id));
            register.insert("name".into(), json!(sheet.get_name()));
            source.insert(id, json!(sheet.get_name()));
            sheets.push(Value::Object(register));
        }
    }
    if sheets.is_empty() {
        return Err(format!("No {kind} register sheets were found."));
    }
    let source_map: HashMap<String, String> = source
        .iter()
        .map(|(k, v)| (k.clone(), v.as_str().unwrap().into()))
        .collect();
    state
        .imported
        .lock()
        .map_err(|e| e.to_string())?
        .insert(path.clone(), (kind.into(), source_map));
    Ok(json!({"file":path.to_string_lossy(),"sheets":sheets,"sourceMap":source}))
}
fn set_cell(sheet: &mut Worksheet, col: u32, row: u32, value: &str, numeric: bool) {
    let cell = sheet.get_cell_mut((col, row));
    if numeric {
        if let Ok(number) = value.replace(',', "").parse::<f64>() {
            cell.set_value_number(number);
            return;
        }
    }
    cell.set_value_string(value);
}
fn merged_span(sheet: &Worksheet, col: u32, row: u32) -> Option<(u32, u32, u32, u32)> {
    sheet.get_merge_cells().iter().find_map(|range| {
        let value = range.get_range();
        let Some((start, end)) = value.split_once(':') else {
            return None;
        };
        let (Some(start_col), Some(start_row), _, _) =
            xlsx::helper::coordinate::index_from_coordinate(start)
        else {
            return None;
        };
        let (Some(end_col), Some(end_row), _, _) =
            xlsx::helper::coordinate::index_from_coordinate(end)
        else {
            return None;
        };
        ((start_col..=end_col).contains(&col) && (start_row..=end_row).contains(&row))
            .then_some((start_col, start_row, end_col, end_row))
    })
}
fn decorate(sheet: &mut Worksheet, last_row: u32, columns: usize, widths: &[f64], copies: bool) {
    let header_row = if copies { 5 } else { 1 };
    for row in 1..=last_row {
        for col in 1..=columns as u32 {
            let style = sheet.get_style_mut((col, row));
            style
                .get_font_mut()
                .set_name("Times New Roman")
                .set_size(14.0)
                .set_bold(row == 1 || copies && (row == 5 || row >= last_row - 3));
            let align = style.get_alignment_mut();
            align.set_horizontal(if copies && (row == last_row - 3 || row == last_row - 2) {
                HorizontalAlignmentValues::Left
            } else if copies && row == 4 {
                HorizontalAlignmentValues::Right
            } else {
                HorizontalAlignmentValues::Center
            });
            align.set_vertical(VerticalAlignmentValues::Center);
            align.set_wrap_text(true);
            let borders = style.get_borders_mut();
            borders.get_left_mut().set_border_style("thin");
            borders.get_right_mut().set_border_style("thin");
            borders.get_top_mut().set_border_style("thin");
            borders.get_bottom_mut().set_border_style("thin");
        }
    }
    let mut fitted_widths = Vec::with_capacity(columns);
    for col in 1..=columns as u32 {
        let mut width = widths[col as usize - 1];
        for row in 1..=last_row {
            if row == header_row || merged_span(sheet, col, row).is_some() {
                continue;
            }
            width = width.max(
                (cell(sheet, col, row)
                    .lines()
                    .map(|line| line.chars().count())
                    .max()
                    .unwrap_or(0)
                    + 2) as f64,
            );
        }
        let width = width.clamp(1.0, 255.0);
        fitted_widths.push(width);
        sheet
            .get_column_dimension_by_number_mut(&col)
            .set_width(width);
    }
    for row in 1..=last_row {
        let mut max_lines = 1u32;
        for col in 1..=columns as u32 {
            if let Some((start_col, start_row, end_col, _)) = merged_span(sheet, col, row) {
                if col == start_col && row == start_row {
                    let value = cell(sheet, start_col, start_row);
                    let width: f64 = fitted_widths[start_col as usize - 1..end_col as usize]
                        .iter()
                        .sum();
                    max_lines = max_lines.max(
                        value
                            .lines()
                            .map(|line| {
                                ((line.chars().count() as f64 / (width - 2.0).max(1.0)).ceil()
                                    as u32)
                                    .max(1)
                            })
                            .sum(),
                    );
                }
            } else {
                let value = cell(sheet, col, row);
                let width = fitted_widths[col as usize - 1].max(1.0);
                max_lines = max_lines.max(
                    value
                        .lines()
                        .map(|line| {
                            ((line.chars().count() as f64 / (width - 2.0).max(1.0)).ceil() as u32)
                                .max(1)
                        })
                        .sum(),
                );
            }
        }
        sheet.get_row_dimension_mut(&row).set_height(
            (max_lines as f64 * 20.0 + 8.0)
                .clamp(if copies && row == 1 { 30.0 } else { 24.0 }, 409.0),
        );
    }
}
fn append_register(
    book: &mut xlsx::structs::Spreadsheet,
    kind: &str,
    sheets: &[Value],
    settings: &Value,
    language: &str,
) -> Result<(), String> {
    for register in sheets {
        let name = string(register, "name");
        if name.trim().is_empty() || name.chars().count() > 31 {
            return Err("Invalid register sheet name.".into());
        }
        let sheet = book.new_sheet(&name).map_err(|e| e.to_string())?;
        let keys: &[&str] = if kind == "translation" {
            &T_KEYS
        } else {
            &S_KEYS
        };
        let mut headers = header_candidates(kind, settings, language);
        let custom = custom(settings);
        headers.extend(custom.iter().map(|(_, h)| h.clone()));
        for (i, header) in headers.iter().enumerate() {
            set_cell(sheet, i as u32 + 1, 1, header, false)
        }
        let rows = register
            .get("rows")
            .and_then(Value::as_array)
            .ok_or("Invalid register rows")?;
        if rows.len() > 100000 {
            return Err("Invalid register rows".into());
        }
        let mut widths: Vec<f64> = vec![14.0; headers.len()];
        for (row_index, record) in rows.iter().enumerate() {
            for (i, key) in keys.iter().enumerate() {
                let value = if *key == "number" {
                    if kind == "translation" {
                        (row_index + 1).to_string()
                    } else {
                        format!("{:02}", row_index + 1)
                    }
                } else if *key == "date" {
                    date_serial(&string(record, key)).unwrap_or_else(|| string(record, key))
                } else {
                    string(record, key)
                };
                set_cell(
                    sheet,
                    i as u32 + 1,
                    row_index as u32 + 2,
                    &value,
                    kind == "translation" && *key == "number"
                        || ["date", "copies", "fee"].contains(key),
                );
                widths[i] = widths[i]
                    .max((value.lines().map(|l| l.chars().count()).max().unwrap_or(0) + 2) as f64);
            }
            for (j, (id, _)) in custom.iter().enumerate() {
                set_cell(
                    sheet,
                    (keys.len() + j + 1) as u32,
                    row_index as u32 + 2,
                    &string(record, &format!("custom:{id}")),
                    false,
                )
            }
        }
        for (i, header) in headers.iter().enumerate() {
            widths[i] = widths[i]
                .max(
                    (header
                        .lines()
                        .map(|line| line.chars().count())
                        .max()
                        .unwrap_or(0)
                        + 2)
                    .min(40) as f64,
                )
                .min(255.0);
        }
        for record in rows {
            for (j, (id, _)) in custom.iter().enumerate() {
                let value = string(record, &format!("custom:{id}"));
                let col = keys.len() + j;
                widths[col] = widths[col]
                    .max(
                        (value
                            .lines()
                            .map(|line| line.chars().count())
                            .max()
                            .unwrap_or(0)
                            + 2) as f64,
                    )
                    .min(255.0);
            }
        }
        let last = (rows.len() + 1) as u32;
        decorate(sheet, last, headers.len(), &widths, false);
        for (i, key) in keys.iter().enumerate() {
            let format = match *key {
                "date" => Some("dd/mm/yyyy"),
                "copies" => Some("0"),
                "fee" => Some("#,##0"),
                _ => None,
            };
            if let Some(format) = format {
                for row in 2..=last {
                    sheet
                        .get_style_mut((i as u32 + 1, row))
                        .get_number_format_mut()
                        .set_format_code(format);
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn workbook_operations_share_an_exclusive_lock() {
        let state = State::default();
        let first = state.operation_lock();
        let second = state.operation_lock();
        let guard = first.clone().try_lock_owned().unwrap();
        assert!(second.try_lock_owned().is_err());
        drop(guard);
        assert!(first.try_lock_owned().is_ok());
    }

    #[test]
    fn date_text_parses_excel_serial_times_and_day_first_dates() {
        assert_eq!(date_text("46026.7083333333"), "2026-01-04");
        assert_eq!(date_text("04/01/2026"), "2026-01-04");
        assert_eq!(date_text("2026-01-04"), "2026-01-04");
    }

    #[test]
    fn translation_and_signature_workbooks_use_day_first_date_format() {
        let root = std::env::temp_dir().join(format!("b6h-date-format-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let state = State::default();
        for kind in ["translation", "signature"] {
            let file = root.join(format!("{kind}.xlsx"));
            create(
                &state,
                kind,
                &file.to_string_lossy(),
                &json!([{"id":"sheet","name":"Register","rows":[{"id":"row","date":"2026-01-04"}]}]),
                &json!({}),
                "EN",
            )
            .unwrap();
            let book = load(&file).unwrap();
            let sheet = book.get_sheet_by_name("Register").unwrap();
            assert_eq!(sheet.get_value("B2"), "46026");
            assert_eq!(
                sheet
                    .get_cell("B2")
                    .unwrap()
                    .get_style()
                    .get_number_format()
                    .unwrap()
                    .get_format_code(),
                "dd/mm/yyyy"
            );
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn importing_a_dropped_folder_uses_its_only_workbook_without_a_picker() {
        let root = std::env::temp_dir().join(format!("b6h-dropped-folder-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("register.xlsx");
        let state = State::default();
        create(
            &state,
            "translation",
            &file.to_string_lossy(),
            &json!([{"id":"sheet","name":"Register","rows":[]}]),
            &json!({}),
            "EN",
        )
        .unwrap();

        let imported = import(&state, "translation", &root.to_string_lossy(), &json!({})).unwrap();

        assert_eq!(
            imported["file"].as_str(),
            Some(fs::canonicalize(file).unwrap().to_string_lossy().as_ref())
        );
        assert_eq!(imported["sheets"][0]["name"], "Register");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn dropped_folder_with_multiple_workbooks_returns_a_clear_error() {
        let root = std::env::temp_dir().join(format!("b6h-ambiguous-folder-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let state = State::default();
        for name in ["first.xlsx", "second.xlsx"] {
            create(
                &state,
                "translation",
                &root.join(name).to_string_lossy(),
                &json!([{"id":"sheet","name":"Register","rows":[]}]),
                &json!({}),
                "EN",
            )
            .unwrap();
        }

        let error = import(&state, "translation", &root.to_string_lossy(), &json!({})).unwrap_err();

        assert!(error.contains("multiple .xlsx workbooks"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn exceljs_workbook_preserves_unrelated_content() {
        let root = std::env::temp_dir().join(format!("b6h-exceljs-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("register.xlsx");
        let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("../scripts/workbook-parity.cjs");
        let node = if cfg!(windows) { "node.exe" } else { "node" };
        assert!(
            std::process::Command::new(node)
                .arg(&script)
                .arg("create")
                .arg(&file)
                .status()
                .unwrap()
                .success()
        );
        let state = State::default();
        let imported = import(&state, "translation", &file.to_string_lossy(), &json!({})).unwrap();
        assert_eq!(imported["sheets"][0]["rows"][0]["person"], "First person");
        let mut edited = imported.clone();
        edited["sheets"][0]["rows"][0]["person"] = json!("Second person");
        save(&state, "translation", &edited, &json!({}), "VI").unwrap();
        assert!(
            std::process::Command::new(node)
                .arg(&script)
                .arg("compare")
                .arg(&file)
                .status()
                .unwrap()
                .success()
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn translation_round_trip_keeps_unrelated_sheet() {
        let root = std::env::temp_dir().join(format!("b6h-workbook-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("register.xlsx");
        let mut book = xlsx::new_file_empty_worksheet();
        book.new_sheet("Cover")
            .unwrap()
            .get_cell_mut("A1")
            .set_value("Keep me");
        let register = book.new_sheet("2026").unwrap();
        for (i, header) in T_VI.iter().enumerate() {
            register
                .get_cell_mut(((i + 1) as u32, 1))
                .set_value(*header);
        }
        register.get_cell_mut("A2").set_value_number(1);
        register.get_cell_mut("C2").set_value("First person");
        xlsx::writer::xlsx::write(&book, &file).unwrap();
        let state = State::default();
        let imported = import(&state, "translation", &file.to_string_lossy(), &json!({})).unwrap();
        assert_eq!(imported["sheets"][0]["rows"][0]["person"], "First person");
        let mut edited = imported.clone();
        edited["sheets"][0]["rows"][0]["person"] = json!("Second person");
        edited["sheets"][0]["rows"][0]["notes"] = json!("First line\nSecond line\nThird line");
        save(&state, "translation", &edited, &json!({}), "VI").unwrap();
        let result = load(&file).unwrap();
        let register = result.get_sheet_by_name("2026").unwrap();
        assert_eq!(
            result.get_sheet_by_name("Cover").unwrap().get_value("A1"),
            "Keep me"
        );
        assert_eq!(register.get_value("C2"), "Second person");
        assert_eq!(
            register.get_value("I2"),
            "First line\nSecond line\nThird line"
        );
        assert!(*register.get_row_dimension(&2).unwrap().get_height() >= 56.0);
        assert!(*register.get_column_dimension("C").unwrap().get_width() > 32.0);
        assert!(register.get_tables().is_empty());
        assert!(!file.with_extension("b6h-backup.xlsx").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn auto_fit_uses_full_matrix_when_first_row_is_merged() {
        let mut book = xlsx::new_file_empty_worksheet();
        let sheet = book.new_sheet("Register").unwrap();
        sheet.add_merge_cells("A1:G1");
        sheet
            .get_cell_mut("A1")
            .set_value("Long merged heading ".repeat(20));
        sheet.get_cell_mut("A2").set_value("No.");
        sheet.get_cell_mut("G2").set_value("Notes");
        sheet
            .get_cell_mut("G3")
            .set_value("This long value must determine the final column width");

        decorate(sheet, 3, 7, &[8.0; 7], false);

        assert!(*sheet.get_column_dimension("A").unwrap().get_width() < 20.0);
        assert!(*sheet.get_column_dimension("G").unwrap().get_width() > 40.0);
        assert!(*sheet.get_row_dimension(&1).unwrap().get_height() > 24.0);
    }
    #[test]
    fn long_register_headers_wrap_with_bounded_column_width() {
        let mut book = xlsx::new_file_empty_worksheet();
        let sheet = book.new_sheet("Register").unwrap();
        sheet
            .get_cell_mut("A1")
            .set_value("Long header ".repeat(20));
        sheet.get_cell_mut("A2").set_value("Short value");

        decorate(sheet, 2, 1, &[40.0], false);

        assert!(*sheet.get_column_dimension("A").unwrap().get_width() <= 40.0);
        assert!(
            *sheet.get_row_dimension(&1).unwrap().get_height()
                > *sheet.get_row_dimension(&2).unwrap().get_height()
        );
    }
    #[test]
    fn copies_template_uses_sample_layout_settings_and_grows_rows() {
        let root = std::env::temp_dir().join(format!("b6h-copies-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("copies.xlsx");
        let state = State::default();
        let id = "00000000-0000-4000-8000-000000000001";
        let mut settings =
            json!({"companyName":"Example Co","businessAddress":"1 Main St","taxId":"000 123"});
        settings[format!("custom:{id}:label")] = json!("Case note");
        settings[format!("custom:{id}:header")] = json!("Case note");
        create(&state,"copies",&file.to_string_lossy(),&json!([
            {"id":"empty","name":"Empty","date":"2026-08-15","rows":[]},
            {"id":"single","name":"Single","date":"2026-08-15","rows":[
                {"id":"only","refNo":"1","customer":"Single row","description":"Document","quantity":"1","unitPrice":"1"}
            ]},
            {"id":"many","name":"Many","date":"2026-08-15","rows":[
                {"id":"a","refNo":"3487","customer":"A","description":"B","quantity":"5","unitPrice":"1","custom:00000000-0000-4000-8000-000000000001":"first"},
                {"id":"b","refNo":"3488","customer":"C","description":"D","quantity":"2","unitPrice":"3","custom:00000000-0000-4000-8000-000000000001":"second"}
            ]}
        ]),&settings,"VI").unwrap();
        let book = load(&file).unwrap();
        let empty = book.get_sheet_by_name("Empty").unwrap();
        assert_eq!(empty.get_value("G9"), "0");
        assert!(empty.get_value("A10").starts_with("B"));
        let single = book.get_sheet_by_name("Single").unwrap();
        assert_eq!(single.get_value("A8"), "1");
        assert_eq!(single.get_value("G9"), "10000");
        assert_eq!(single.get_cell("G9").unwrap().get_formula(), "SUM(G8:G8)");
        let sheet = book.get_sheet_by_name("Many").unwrap();
        assert!(sheet.get_value("A1").starts_with("B"));
        assert!(sheet.get_value("A3").contains("Example Co"));
        assert!(sheet.get_value("A4").contains("1 Main St"));
        assert!(sheet.get_value("A5").contains("000 123"));
        assert_eq!(sheet.get_value("H7"), "Case note");
        assert_eq!(sheet.get_value("H8"), "first");
        assert_eq!(sheet.get_value("G10"), "60000");
        assert_eq!(sheet.get_cell("G10").unwrap().get_formula(), "SUM(G8:G9)");
        assert!(sheet.get_value("A11").starts_with("B"));
        assert!(
            sheet
                .get_merge_cells()
                .iter()
                .any(|range| range.get_range() == "A1:H1")
        );
        assert!(
            sheet
                .get_merge_cells()
                .iter()
                .any(|range| range.get_range() == "A10:F10")
        );
        let title_font = sheet
            .get_cell("A1")
            .unwrap()
            .get_style()
            .get_font()
            .unwrap();
        assert_eq!(title_font.get_font_name().get_val(), "Times New Roman");
        assert!(*title_font.get_font_bold().get_val());
        let body_font = sheet
            .get_cell("A8")
            .unwrap()
            .get_style()
            .get_font()
            .unwrap();
        assert_eq!(body_font.get_font_name().get_val(), "Times New Roman");
        let added_body_font = sheet
            .get_cell("A9")
            .unwrap()
            .get_style()
            .get_font()
            .unwrap();
        assert_eq!(added_body_font.get_font_name().get_val(), "Times New Roman");
        assert_eq!(*sheet.get_row_dimension(&8).unwrap().get_height(), 18.0);
        let imported = import(&state, "copies", &file.to_string_lossy(), &settings).unwrap();
        assert_eq!(imported["sheets"][2]["address"], "1 Main St");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn copies_import_supports_old_address_row_and_save_keeps_other_sheets() {
        let root = std::env::temp_dir().join(format!("b6h-copies-save-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("copies.xlsx");
        let settings = json!({});
        let mut book = xlsx::new_file_empty_worksheet();
        book.new_sheet("Cover")
            .unwrap()
            .get_cell_mut("A1")
            .set_value("Keep me");
        let old = book.new_sheet("Old").unwrap();
        old.get_cell_mut("A1").set_value("Old title");
        old.get_cell_mut("A3").set_value("Địa chỉ: Old addr");
        for (index, header) in header_candidates("copies", &settings, "VI")
            .iter()
            .enumerate()
        {
            old.get_cell_mut(((index + 1) as u32, 5)).set_value(header);
        }
        old.get_cell_mut("A6").set_value_number(1);
        old.get_cell_mut("C6").set_value("A person");
        xlsx::writer::xlsx::write(&book, &file).unwrap();
        let state = State::default();
        let imported = import(&state, "copies", &file.to_string_lossy(), &settings).unwrap();
        assert_eq!(imported["sheets"][0]["address"], "Old addr");
        save(&state, "copies", &imported, &settings, "VI").unwrap();
        let saved = load(&file).unwrap();
        assert_eq!(
            saved.get_sheet_by_name("Cover").unwrap().get_value("A1"),
            "Keep me"
        );
        assert!(
            saved
                .get_sheet_by_name("Old")
                .unwrap()
                .get_value("A4")
                .contains(crate::storage::COPIES_ADDRESS)
        );
        fs::remove_dir_all(root).unwrap();
    }
}
fn write(book: &xlsx::structs::Spreadsheet, file: &Path) -> Result<(), String> {
    let temp = file.with_extension(format!("{}.tmp.xlsx", Uuid::new_v4()));
    xlsx::writer::xlsx::write(book, &temp).map_err(|e| e.to_string())?;
    fs::rename(&temp, file).map_err(|e| e.to_string())
}
fn write_new(book: &xlsx::structs::Spreadsheet, file: &Path) -> Result<(), String> {
    let temp = file.with_extension(format!("{}.tmp.xlsx", Uuid::new_v4()));
    xlsx::writer::xlsx::write(book, &temp).map_err(|e| e.to_string())?;
    let result = fs::hard_link(&temp, file).map_err(|e| e.to_string());
    let _ = fs::remove_file(temp);
    result
}
pub fn create(
    state: &State,
    kind: &str,
    file: &str,
    sheets: &Value,
    settings: &Value,
    language: &str,
) -> Result<Value, String> {
    let path = valid_file(file)?;
    if path.exists() {
        return Err("A file already exists at that location.".into());
    }
    let sheets = sheets.as_array().ok_or("Invalid register sheets")?;
    if sheets.is_empty() || sheets.len() > 255 {
        return Err("Invalid register sheets".into());
    }
    let mut book = xlsx::new_file_empty_worksheet();
    if kind == "copies" {
        append_copies(&mut book, sheets, settings)?
    } else {
        append_register(&mut book, kind, sheets, settings, language)?
    }
    write_new(&book, &path)?;
    let source: Map<String, Value> = sheets
        .iter()
        .map(|s| (string(s, "id"), json!(string(s, "name"))))
        .collect();
    state.imported.lock().map_err(|e| e.to_string())?.insert(
        fs::canonicalize(&path).map_err(|e| e.to_string())?,
        (
            kind.into(),
            source
                .iter()
                .map(|(key, value)| (key.clone(), value.as_str().unwrap_or("").into()))
                .collect(),
        ),
    );
    Ok(json!({"file":file,"sourceMap":source}))
}
pub fn save(
    state: &State,
    kind: &str,
    input: &Value,
    settings: &Value,
    language: &str,
) -> Result<usize, String> {
    let file = string(input, "file");
    let path = fs::canonicalize(valid_file(&file)?)
        .map_err(|_| "The imported workbook is no longer available.".to_string())?;
    let sheets = input
        .get("sheets")
        .and_then(Value::as_array)
        .ok_or("Invalid register sheets")?;
    let source = input
        .get("sourceMap")
        .and_then(Value::as_object)
        .ok_or("Invalid source map")?;
    let expected = state
        .imported
        .lock()
        .map_err(|e| e.to_string())?
        .get(&path)
        .cloned()
        .ok_or("The imported workbook is no longer available.")?;
    if expected.0 != kind
        || expected.1
            != source
                .iter()
                .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string())))
                .collect()
    {
        return Err("The imported workbook changed. Refresh it before saving.".into());
    }
    let mut book = load(&path)?;
    let originals: HashSet<_> = source.values().filter_map(Value::as_str).collect();
    let protected: HashSet<_> = book
        .get_sheet_collection()
        .iter()
        .filter(|s| !originals.contains(s.get_name()))
        .map(|s| s.get_name().to_lowercase())
        .collect();
    if sheets
        .iter()
        .any(|s| protected.contains(&string(s, "name").to_lowercase()))
    {
        return Err("A sheet name conflicts with an unrelated sheet in the workbook.".into());
    }
    for name in originals {
        let _ = book.remove_sheet_by_name(name);
    }
    if kind == "copies" {
        append_copies(&mut book, sheets, settings)?
    } else {
        append_register(&mut book, kind, sheets, settings, language)?
    }
    write(&book, &path)?;
    state.imported.lock().map_err(|e| e.to_string())?.insert(
        path,
        (
            kind.into(),
            sheets
                .iter()
                .map(|s| (string(s, "id"), string(s, "name")))
                .collect(),
        ),
    );
    Ok(sheets.len())
}
fn words_vi(amount: u64) -> Result<String, String> {
    if amount == 0 {
        return Ok("Không đồng".into());
    }
    let digits = [
        "không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín",
    ];
    let units = ["", "ngàn", "triệu", "tỷ", "ngàn tỷ", "triệu tỷ", "tỷ tỷ"];
    let mut groups = Vec::new();
    let mut remaining = amount;
    while remaining > 0 {
        groups.push((remaining % 1000) as usize);
        remaining /= 1000;
    }
    if groups.len() > units.len() {
        return Err("Amount is too large.".into());
    }
    let mut parts = Vec::new();
    for index in (0..groups.len()).rev() {
        let value = groups[index];
        if value == 0 {
            continue;
        }
        let higher = groups.iter().skip(index + 1).any(|n| *n > 0);
        let hundreds = value / 100;
        let tens = value % 100 / 10;
        let ones = value % 10;
        let mut words = Vec::new();
        if hundreds > 0 || (higher && value < 100) {
            words.extend([digits[hundreds], "trăm"]);
        }
        if tens > 1 {
            words.extend([digits[tens], "mươi"]);
        } else if tens == 1 {
            words.push("mười");
        } else if ones > 0 && (hundreds > 0 || higher) {
            words.push("lẻ");
        }
        if ones > 0 {
            words.push(if tens > 1 && ones == 1 {
                "mốt"
            } else if tens >= 1 && ones == 5 {
                "lăm"
            } else if tens > 1 && ones == 4 {
                "tư"
            } else {
                digits[ones]
            });
        }
        parts.push(
            [words.join(" "), units[index].into()]
                .into_iter()
                .filter(|s: &String| !s.is_empty())
                .collect::<Vec<_>>()
                .join(" "),
        );
    }
    let mut text = parts.join(" ");
    let first = text.chars().next().unwrap();
    text.replace_range(..first.len_utf8(), &first.to_uppercase().to_string());
    Ok(format!("{text} đồng"))
}
fn copy_total(row: &Value) -> Result<u64, String> {
    let number = |key| -> Result<u64, String> {
        let value = string(row, key).replace(',', "");
        if value.is_empty() {
            Ok(0)
        } else {
            value
                .parse::<u64>()
                .map_err(|_| format!("{key} must be a whole number."))
        }
    };
    if row.get("manualTotal").and_then(Value::as_bool) == Some(true) {
        return number("totalAmount");
    }
    let product = number("quantity")?
        .checked_mul(number("unitPrice")?)
        .ok_or("Total amount is outside the supported number range.")?;
    product
        .div_ceil(2)
        .checked_mul(10000)
        .ok_or("Total amount is outside the supported number range.".into())
}
fn append_copies(
    book: &mut xlsx::structs::Spreadsheet,
    sheets: &[Value],
    settings: &Value,
) -> Result<(), String> {
    let custom = custom(settings);
    let mut headers = header_candidates("copies", settings, "VI");
    headers.extend(custom.iter().map(|(_, header)| header.clone()));
    for register in sheets {
        let name = string(register, "name");
        if name.trim().is_empty() || name.chars().count() > 31 {
            return Err("Invalid copies register sheet name.".into());
        }
        let rows = register
            .get("rows")
            .and_then(Value::as_array)
            .ok_or("Invalid copies register rows")?;
        if rows.len() > 100000 {
            return Err("Invalid copies register rows".into());
        }
        let template = xlsx::reader::xlsx::read_reader(
            &mut Cursor::new(include_bytes!("../resources/copies-template.xlsx")),
            true,
        )
        .map_err(|e| e.to_string())?;
        let mut sheet = template
            .get_sheet(&0)
            .ok_or("Copies template has no worksheet")?
            .clone();
        sheet.set_name(&name);
        book.add_sheet(sheet).map_err(|e| e.to_string())?;
        let sheet = book
            .get_sheet_by_name_mut(&name)
            .ok_or("Could not add Copies worksheet")?;
        let last_col =
            xlsx::helper::coordinate::string_from_column_index(&headers.len().try_into().unwrap());
        let data_rows = rows.len().max(1) as u32;
        if data_rows > 1 {
            sheet.insert_new_row(&9, &(data_rows - 1));
        }
        let total_row = 8 + data_rows;
        let words_row = total_row + 1;
        let invoice_row = words_row + 1;
        let signature_row = invoice_row + 1;
        for row in 9..=(7 + rows.len() as u32) {
            if !rows.is_empty() {
                sheet.copy_row_styling(&8, &row, Some(&1), Some(&(headers.len() as u32)));
            }
        }
        for col in 8..=headers.len() as u32 {
            if headers.len() > 7 {
                sheet.copy_col_styling(&7, &col, Some(&1), Some(&signature_row));
            }
        }
        sheet.get_merge_cells_mut().retain(|range| {
            let (_, row, _, _) = xlsx::helper::coordinate::index_from_coordinate(
                range.get_range().split(':').next().unwrap_or(""),
            );
            let Some(row) = row else {
                return true;
            };
            !(row <= 6 || [total_row, words_row, invoice_row, signature_row].contains(&row))
        });
        for row in 1..=6 {
            sheet.add_merge_cells(format!("A{row}:{last_col}{row}"));
        }
        let title = string(register, "title");
        if !title.is_empty() {
            set_cell(sheet, 1, 1, &title, false);
        }
        let date = string(register, "date");
        let pieces: Vec<_> = date.split('-').collect();
        if pieces.len() != 3 {
            return Err("Invalid copies register date.".into());
        }
        set_cell(
            sheet,
            1,
            2,
            &format!("Ngày {} tháng {} năm {}", pieces[2], pieces[1], pieces[0]),
            false,
        );
        set_business_detail(
            sheet,
            3,
            "Tên doanh nghiệp: ",
            settings
                .get("companyName")
                .and_then(Value::as_str)
                .unwrap_or(crate::storage::COPIES_COMPANY_NAME),
        );
        set_business_detail(
            sheet,
            4,
            "Địa chỉ: ",
            settings
                .get("businessAddress")
                .and_then(Value::as_str)
                .unwrap_or(crate::storage::COPIES_ADDRESS),
        );
        set_business_detail(
            sheet,
            5,
            "Mã số thuế: ",
            settings
                .get("taxId")
                .and_then(Value::as_str)
                .unwrap_or(crate::storage::COPIES_TAX_ID),
        );
        set_cell(sheet, 1, 6, "Đơn vị tính: VNĐ", false);
        for (col, header) in headers.iter().enumerate() {
            set_cell(sheet, col as u32 + 1, 7, header, false);
        }
        let mut totals = Vec::new();
        for (offset, record) in rows.iter().enumerate() {
            let row = (offset + 8) as u32;
            set_cell(sheet, 1, row, &(offset + 1).to_string(), true);
            let ref_no = string(record, "refNo");
            let fallback = (offset + 1).to_string();
            set_cell(
                sheet,
                2,
                row,
                if ref_no.is_empty() {
                    &fallback
                } else {
                    &ref_no
                },
                true,
            );
            for (col, key) in ["customer", "description", "quantity", "unitPrice"]
                .iter()
                .enumerate()
            {
                set_cell(sheet, col as u32 + 3, row, &string(record, key), col >= 2);
            }
            let total = copy_total(record)?;
            totals.push(total);
            if record.get("manualTotal").and_then(Value::as_bool) == Some(true)
                || (!string(record, "quantity").is_empty()
                    && !string(record, "unitPrice").is_empty())
            {
                set_cell(sheet, 7, row, &total.to_string(), true);
            }
            for (j, (id, _)) in custom.iter().enumerate() {
                set_cell(
                    sheet,
                    j as u32 + 8,
                    row,
                    &string(record, &format!("custom:{id}")),
                    false,
                );
            }
        }
        let total_amount = totals
            .iter()
            .try_fold(0_u64, |sum, n| sum.checked_add(*n))
            .ok_or("Total amount is outside the supported number range.")?;
        if total_amount > 9_007_199_254_740_991 {
            return Err("Total amount is outside the supported number range.".into());
        }
        sheet.add_merge_cells(format!("A{total_row}:F{total_row}"));
        set_cell(sheet, 1, total_row, "Tổng cộng chứng thực bản sao", false);
        let formula = if rows.is_empty() {
            "0".to_string()
        } else {
            format!("SUM(G8:G{})", rows.len() + 7)
        };
        sheet
            .get_cell_mut((7, total_row))
            .set_formula(formula)
            .set_formula_result_default(total_amount.to_string());
        sheet.add_merge_cells(format!("A{words_row}:{last_col}{words_row}"));
        set_cell(
            sheet,
            1,
            words_row,
            &format!("Bằng chữ: {}", words_vi(total_amount)?),
            false,
        );
        sheet.add_merge_cells(format!("A{invoice_row}:C{invoice_row}"));
        set_cell(sheet, 1, invoice_row, "HĐ:________", false);
        sheet.add_merge_cells(format!("D{invoice_row}:{last_col}{invoice_row}"));
        set_cell(
            sheet,
            4,
            invoice_row,
            "Người cung cấp hàng hóa, dịch vụ",
            false,
        );
        sheet.add_merge_cells(format!("D{signature_row}:{last_col}{signature_row}"));
        set_cell(sheet, 4, signature_row, "(Ký, ghi rõ họ tên)", false);
        for col in [2, 5, 6, 7] {
            let format = if col == 2 || col == 5 { "0" } else { "#,##0" };
            for row in 8..=total_row {
                sheet
                    .get_style_mut((col, row))
                    .get_number_format_mut()
                    .set_format_code(format);
            }
        }
    }
    Ok(())
}
fn set_business_detail(sheet: &mut Worksheet, row: u32, label: &str, value: &str) {
    let mut rich = xlsx::structs::RichText::default();
    let mut label_run = xlsx::structs::TextElement::default();
    label_run.set_text(label);
    rich.add_rich_text_elements(label_run);
    let mut value_run = xlsx::structs::TextElement::default();
    value_run.set_text(value);
    value_run
        .get_font_mut()
        .set_name("Times New Roman")
        .set_size(14.0)
        .set_bold(true);
    rich.add_rich_text_elements(value_run);
    sheet.get_cell_mut((1, row)).set_rich_text(rich);
}
