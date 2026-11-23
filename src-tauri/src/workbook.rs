use chrono::{Duration, NaiveDate};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use sha2::{Digest, Sha256};
use serde_json::{Map, Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Cursor, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
#[cfg(windows)]
use std::os::windows::fs::OpenOptionsExt;
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
    imported: Mutex<HashMap<PathBuf, (String, HashMap<String, String>, String)>>,
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
fn date_display(value: &str) -> Option<String> {
    Some(NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()?.format("%d/%m/%Y").to_string())
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
fn indexed_rows(sheet: &Worksheet) -> Vec<(u32, Vec<String>)> {
    (1..=sheet.get_highest_row().min(100_500))
        .map(|row| (row, (1..=sheet.get_highest_column().min(220)).map(|col| cell(sheet, col, row)).collect()))
        .collect()
}
fn numeric_stt(value: &str) -> Option<u32> {
    let number = value.trim().parse::<u32>().ok()?;
    (number > 0 && number <= 100_499).then_some(number)
}
fn concise_translation_language(value: &str) -> Option<&'static str> {
    let mut cleaned = value.trim().to_lowercase();
    while let Some(rest) = cleaned.strip_prefix("tiếng ") { cleaned = rest.to_string(); }
    let normalized = cleaned.nfd().filter(|character| !matches!(*character as u32, 0x0300..=0x036f)).collect::<String>();
    match normalized.trim() {
        "viet" | "vietnamese" => Some("Việt"),
        "anh" | "english" => Some("Anh"),
        "hoa" | "trung" | "chinese" => Some("Hoa"),
        "nhat" | "japanese" => Some("Nhật"),
        "han" | "korean" => Some("Hàn"),
        "phap" | "french" => Some("Pháp"),
        _ => None,
    }
}
fn concise_translation_language_pair(value: &str) -> String {
    let (source, target) = [" -> ", " – ", " — ", " - "]
        .iter()
        .find_map(|separator| value.split_once(separator))
        .or_else(|| value.split_once('-'))
        .unwrap_or(("", ""));
    match (concise_translation_language(source), concise_translation_language(target)) {
        (Some(source), Some(target)) => format!("{source} - {target}"),
        _ => value.to_string(),
    }
}
fn has_cell_content(sheet: &Worksheet, col: usize, row: u32) -> bool {
    sheet.get_cell(((col + 1) as u32, row)).is_some_and(|cell| {
        !cell.get_value().to_string().is_empty() || !cell.get_formula().is_empty()
    })
}
fn has_business_value(sheet: &Worksheet, col: usize, row: u32) -> bool {
    sheet.get_cell(((col + 1) as u32, row)).is_some_and(|cell| {
        cell.get_formula().is_empty() && !cell.get_value().to_string().trim().is_empty()
    })
}
fn write_signature_stt(sheet: &mut Worksheet, col: u32, row: u32, number: u32) {
    let coordinate = (col, row);
    let format = sheet.get_style(coordinate).get_number_format().map(|format| format.get_format_code().to_string()).unwrap_or_default();
    let cell = sheet.get_cell_mut(coordinate);
    cell.set_value_number(number as f64);
    if format.is_empty() || format == "General" { sheet.get_style_mut(coordinate).get_number_format_mut().set_format_code("00"); }
}
fn normalize_signature_stt(sheet: &mut Worksheet, col: u32, row: u32, number: u32) {
    let coordinate = (col, row);
    let Some(cell) = sheet.get_cell(coordinate) else { write_signature_stt(sheet, col, row, number); return };
    if !cell.get_formula().is_empty() { return; }
    if cell.get_data_type() == "n" {
        let format = sheet.get_style(coordinate).get_number_format().map(|format| format.get_format_code().to_string()).unwrap_or_default();
        if format.is_empty() || format == "General" { sheet.get_style_mut(coordinate).get_number_format_mut().set_format_code("00"); }
    } else if numeric_stt(cell.get_value().as_ref()) == Some(number) && number < 10 && cell.get_value().as_ref() != format!("{number:02}") {
        sheet.get_cell_mut(coordinate).set_value_string(format!("{number:02}"));
    }
}
fn clear_business_cell(sheet: &mut Worksheet, col: u32, row: u32) {
    if sheet.get_cell((col, row)).is_some_and(|cell| cell.get_formula().is_empty()) {
        sheet.get_cell_mut((col, row)).set_value_string("");
    }
}
fn register_date_is_text(sheet: &Worksheet, col: u32, row: u32) -> bool {
    if let Some(cell) = sheet.get_cell((col, row)) {
        if !cell.get_formula().is_empty() { return false; }
        if !cell.get_value().to_string().trim().is_empty() { return cell.get_data_type() != "n"; }
    }
    let format = sheet.get_style((col, row)).get_number_format().map(|format| format.get_format_code().to_string()).unwrap_or_default();
    format == "@"
}
fn write_register_date(sheet: &mut Worksheet, col: u32, row: u32, value: &str) {
    if value.is_empty() { clear_business_cell(sheet, col, row); return; }
    if let Some(display) = date_display(value) {
        if register_date_is_text(sheet, col, row) {
            if cell(sheet, col, row) != display { set_cell(sheet, col, row, &display, false); }
        } else {
            let serial = date_serial(value).expect("validated ISO date has an Excel serial");
            if cell(sheet, col, row) != serial { set_cell(sheet, col, row, &serial, true); }
            sheet.get_style_mut((col, row)).get_number_format_mut().set_format_code("dd/mm/yyyy");
        }
    }
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
    let all = indexed_rows(sheet);
    let keys: &[&str] = if kind == "translation" {
        &T_KEYS
    } else {
        &S_KEYS
    };
    for (start, (_, header)) in all.iter().enumerate() {
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
        let mut stt_counts = HashMap::<u32, usize>::new();
        let mut allocation_max = 0;
        for (row_number, row) in all.iter().skip(start + 1) {
            let number_col = indexes[0] as u32 + 1;
            let (row_start, row_end) = merged_span(sheet, number_col, *row_number)
                .map(|(_, start, _, end)| (start, end)).unwrap_or((*row_number, *row_number));
            if row_start != *row_number { continue; }
            let stt_raw = row.get(indexes[0]).map(String::as_str).unwrap_or("");
            let stt = numeric_stt(stt_raw);
            if kind == "signature" || kind == "translation" {
                if let Some(stt) = stt { *stt_counts.entry(stt).or_default() += 1; allocation_max = allocation_max.max(stt); }
            }
            let business = if kind == "signature" {
                indexes.iter().enumerate().any(|(i, index)| i > 0 && (*row_number..=row_end).any(|r| has_business_value(sheet, *index, r)))
                    || custom_indexes.iter().any(|(_, index)| index.is_some_and(|col| (*row_number..=row_end).any(|r| has_business_value(sheet, col, r))))
            } else {
                indexes.iter().enumerate().any(|(i, index)| i > 0 && !row.get(*index).unwrap_or(&String::new()).trim().is_empty())
                    || custom_indexes.iter().any(|(_, index)| index.is_some_and(|col| (*row_number..=row_end).any(|r| has_business_value(sheet, col, r))))
            };
            if !business {
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
                let raw = if kind == "signature" && *key == "person" {
                    (*row_number..=row_end).map(|r| cell(sheet, indexes[i] as u32 + 1, r)).filter(|v| !v.trim().is_empty()).collect::<Vec<_>>().join("\n\n")
                } else { row.get(indexes[i]).cloned().unwrap_or_default() };
                record.insert(
                    (*key).into(),
                    json!(if *key == "date" { date_text(&raw) } else if kind == "signature" && *key == "document" { raw.to_uppercase() } else if kind == "translation" && *key == "number" { numeric_stt(&raw).map(|number| format!("{number:02}")).unwrap_or(raw) } else { raw }),
                );
            }
            if kind == "signature" || kind == "translation" { record.insert("workbookRow".into(), json!(row_number)); record.insert("workbookRowEnd".into(), json!(row_end)); }
            for (id, index) in &custom_indexes {
                record.insert(
                    format!("custom:{id}"),
                    json!(index.and_then(|i| row.get(i)).cloned().unwrap_or_default()),
                );
            }
            records.push(Value::Object(record));
        }
        if kind == "signature" || kind == "translation" {
            let duplicates: Vec<u32> = stt_counts.into_iter().filter_map(|(stt, count)| (count > 1).then_some(stt)).collect();
            return Some(json!({"rows":records,"allocationMax":allocation_max,"duplicateNumbers":duplicates}));
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
            let value = row.get(indexes[i]).cloned().unwrap_or_default();
            record.insert((*key).into(), json!(if *key == "number" { numeric_stt(&value).map(|number| format!("{number:02}")).unwrap_or(value) } else { value }));
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
fn workbook_hash(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("Could not read workbook: {e}"))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}
#[cfg(windows)]
fn zone_identifier(path: &Path) -> Result<Option<Vec<u8>>, String> {
    let stream = PathBuf::from(format!("{}:Zone.Identifier", path.display()));
    match fs::read(stream) { Ok(bytes) => Ok(Some(bytes)), Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None), Err(error) => Err(format!("Could not preserve workbook security provenance: {error}")) }
}
#[cfg(not(windows))]
fn zone_identifier(_: &Path) -> Result<Option<Vec<u8>>, String> { Ok(None) }
fn lock_signature_workbook(path: &Path) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    options.share_mode(1 | 4);
    options.open(path).map_err(|e| format!("Could not lock workbook for saving: {e}"))
}
fn save_error_code(message: &str) -> &'static str {
    if message.contains("(os error 5)") || message.contains("(os error 65)") { "signatureSaveAccessDenied" }
    else if message.contains("(os error 32)") || message.contains("(os error 33)") { "signatureSaveSharingViolation" }
    else if ["(os error 53)", "(os error 59)", "(os error 64)", "(os error 67)", "(os error 1219)", "(os error 1231)", "(os error 1232)", "(os error 1236)"].iter().any(|code| message.contains(code)) { "signatureSaveNetwork" }
    else { "signatureWorkbookIo" }
}
struct RegisterSaveLock {
    #[cfg(windows)]
    file: File,
    #[cfg(windows)]
    overlapped: windows_sys::Win32::System::IO::OVERLAPPED,
    #[cfg(not(windows))]
    _directory: File,
}
#[cfg(windows)]
impl Drop for RegisterSaveLock {
    fn drop(&mut self) {
        unsafe {
            use std::os::windows::io::AsRawHandle;
            use windows_sys::Win32::Storage::FileSystem::UnlockFileEx;
            let _ = UnlockFileEx(self.file.as_raw_handle(), 0, 1, 0, &mut self.overlapped);
        }
    }
}
fn lock_register_save(path: &Path) -> Result<RegisterSaveLock, String> {
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Storage::FileSystem::{LOCKFILE_EXCLUSIVE_LOCK, LOCKFILE_FAIL_IMMEDIATELY, LockFileEx};
        let mut options = OpenOptions::new();
        options.read(true);
        options.share_mode(1 | 4);
        let file = options.open(path).map_err(|error| format!("Could not open workbook for save coordination: {error}"))?;
        let mut overlapped = windows_sys::Win32::System::IO::OVERLAPPED::default();
        // Keep the SMB coordination byte beyond practical workbook sizes so other clients can still read the file.
        overlapped.Anonymous.Anonymous = windows_sys::Win32::System::IO::OVERLAPPED_0_0 { Offset: u32::MAX, OffsetHigh: u32::MAX - 1 };
        let locked = unsafe { LockFileEx(file.as_raw_handle(), LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &mut overlapped) };
        if locked == 0 {
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() == Some(33) { return Err("Another B6H save is active.".into()); }
            return Err(format!("Could not coordinate workbook save: {error}"));
        }
        Ok(RegisterSaveLock { file, overlapped })
    }
    #[cfg(not(windows))]
    {
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        let directory = File::open(parent).map_err(|error| format!("Could not coordinate workbook save: {error}"))?;
        directory.try_lock().map_err(|error| format!("Another B6H save is active or could not be coordinated: {error}"))?;
        Ok(RegisterSaveLock { _directory: directory })
    }
}
#[cfg(windows)]
fn replace_workbook(temp: &Path, file: &Path) -> Result<(), std::io::Error> {
    use std::{os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::Storage::FileSystem::ReplaceFileW;
    let file: Vec<u16> = file.as_os_str().encode_wide().chain(Some(0)).collect();
    let temp: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
    let replaced = unsafe { ReplaceFileW(file.as_ptr(), temp.as_ptr(), ptr::null(), 0, ptr::null(), ptr::null()) };
    if replaced == 0 { Err(std::io::Error::last_os_error()) } else { Ok(()) }
}
#[cfg(not(windows))]
fn replace_workbook(temp: &Path, file: &Path) -> Result<(), std::io::Error> {
    fs::rename(temp, file)
}
pub fn import(state: &State, kind: &str, file: &str, settings: &Value) -> Result<Value, String> {
    let path = resolve_import_file(file)?;
    let path = fs::canonicalize(path).map_err(|e| e.to_string())?;
    let source_zone = zone_identifier(&path)?.map(|bytes| BASE64.encode(bytes));
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
            if let Some(zone) = &source_zone { register.insert("sourceZoneIdentifier".into(), json!(zone)); }
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
        .insert(path.clone(), (kind.into(), source_map, workbook_hash(&path)?));
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
        let max_number = rows.iter().filter_map(|row| numeric_stt(&string(row, "number"))).max().unwrap_or(0);
        let reserved_number = if kind == "translation" { let boundary: u32 = register.get("allocationMax").and_then(Value::as_u64).unwrap_or(0).try_into().map_err(|_| "Invalid STT allocation boundary")?; if boundary > 100_499 { return Err("Invalid STT allocation boundary".into()); } (boundary > max_number).then_some(boundary) } else { None };
        let mut widths: Vec<f64> = vec![14.0; headers.len()];
        for (row_index, record) in rows.iter().enumerate() {
            for (i, key) in keys.iter().enumerate() {
                let value = if *key == "number" {
                    if kind == "translation" {
                        let raw = string(record, key);
                        let parsed = if raw.is_empty() { return Err("Translation records require a user-verified STT.".into()); } else { numeric_stt(&raw).ok_or("Invalid STT")? };
                        format!("{parsed:02}")
                    } else if kind == "signature" {
                        let raw = string(record, key);
                        let parsed = if raw.is_empty() { row_index as u32 + 1 } else { numeric_stt(&raw).ok_or("Invalid STT")? };
                        format!("{parsed:02}")
                    } else {
                        format!("{:02}", row_index + 1)
                    }
                } else if *key == "date" {
                    date_serial(&string(record, key)).unwrap_or_else(|| string(record, key))
                } else if kind == "translation" && *key == "languages" {
                    concise_translation_language_pair(&string(record, key))
                } else if kind == "signature" && (*key == "certifier" || *key == "document") {
                    string(record, key).to_uppercase()
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
        if let Some(number) = reserved_number { let value = format!("{number:02}"); set_cell(sheet, 1, rows.len() as u32 + 2, &value, false); widths[0] = widths[0].max(value.len() as f64 + 2.0); }
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
        let last = (rows.len() + 1 + usize::from(reserved_number.is_some())) as u32;
        decorate(sheet, last, headers.len(), &widths, false);
        for (i, key) in keys.iter().enumerate() {
            let format = match *key {
                "number" if kind == "translation" => Some("00"),
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

    fn signature_fixture(file: &Path, partial_slot: bool) {
        let mut book = xlsx::new_file_empty_worksheet();
        book.new_sheet("Cover").unwrap().get_cell_mut("A1").set_value("Keep this sheet");
        let sheet = book.new_sheet("Register").unwrap();
        let settings = json!({});
        for (index, header) in header_candidates("signature", &settings, "EN").iter().enumerate() {
            set_cell(sheet, index as u32 + 1, 3, header, false);
        }
        set_cell(sheet, 1, 7, "750", true);
        sheet.get_style_mut((1, 7)).get_number_format_mut().set_format_code("0000");
        if partial_slot { set_cell(sheet, 8, 7, "partial data", false); }
        set_cell(sheet, 1, 8, "800", true);
        set_cell(sheet, 2, 8, "2026-11-16", false);
        set_cell(sheet, 3, 8, "Existing person", false);
        sheet.get_cell_mut("J2").set_formula("SUM(1,1)").set_formula_result_default("2");
        xlsx::writer::xlsx::write(&book, file).unwrap();
    }
    fn signature_duplicate_fixture(file: &Path, duplicate_count: usize) {
        let mut book = xlsx::new_file_empty_worksheet();
        book.new_sheet("Cover").unwrap().get_cell_mut("A1").set_value("Keep this sheet");
        let sheet = book.new_sheet("Register").unwrap();
        for (index, header) in header_candidates("signature", &json!({}), "EN").iter().enumerate() { set_cell(sheet, index as u32 + 1, 3, header, false); }
        for index in 0..duplicate_count {
            let row = 7 + index as u32;
            set_cell(sheet, 1, row, "01", false);
            set_cell(sheet, 2, row, "2026-11-16", false);
            set_cell(sheet, 3, row, &format!("Record {}", char::from(b'A' + index as u8)), false);
        }
        let next = 7 + duplicate_count as u32;
        set_cell(sheet, 1, next, "02", false);
        set_cell(sheet, 2, next, "2026-11-16", false);
        set_cell(sheet, 3, next, "Record 02", false);
        set_cell(sheet, 1, next + 1, "03", false);
        set_cell(sheet, 3, next + 1, "Record 03", false);
        sheet.get_cell_mut("J2").set_formula("SUM(1,1)").set_formula_result_default("2");
        xlsx::writer::xlsx::write(&book, file).unwrap();
    }
    fn signature_multi_group_fixture(file: &Path) {
        let mut book = xlsx::new_file_empty_worksheet(); let sheet = book.new_sheet("Register").unwrap();
        for (index, header) in header_candidates("signature", &json!({}), "EN").iter().enumerate() { set_cell(sheet, index as u32 + 1, 3, header, false); }
        for (row, number, person) in [(7, "01", "One A"), (8, "01", "One B"), (9, "02", "Two A"), (10, "02", "Two B"), (11, "03", "Three")] {
            set_cell(sheet, 1, row, number, false); set_cell(sheet, 3, row, person, false);
        }
        sheet.get_cell_mut("K12").set_formula("A11");
        xlsx::writer::xlsx::write(&book, file).unwrap();
    }
    fn new_signature_record(number: &str, id: &str) -> Value {
        json!({"id":id,"number":number,"date":"2026-11-16","person":"New person","document":"","certifier":"","copies":"1","fee":"","notes":""})
    }
    fn apply_row_locators(input: &mut Value, result: &Value) {
        let locators = result["rowLocators"].as_object().unwrap();
        let ends = result["rowLocatorEnds"].as_object();
        for sheet in input["sheets"].as_array_mut().unwrap() {
            for row in sheet["rows"].as_array_mut().unwrap() {
                let id = string(row, "id");
                if let Some(locator) = locators.get(&id) { row["workbookRow"] = locator.clone(); }
                if let Some(locator) = ends.and_then(|ends| ends.get(&id)) { row["workbookRowEnd"] = locator.clone(); }
            }
        }
    }
    fn delete_signature_record_at(input: &mut Value, row: u32) {
        input["sheets"][0]["rows"].as_array_mut().unwrap().retain(|record| record["workbookRow"].as_u64() != Some(row as u64));
    }

    #[test]
    fn translation_excel_rules_uppercase_text_and_highlight_duplicate_stt_rows() {
        let root = std::env::temp_dir().join(format!("b6h-translation-excel-rules-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("translation.xlsx");
        let mut book = xlsx::new_file_empty_worksheet();
        let sheet = book.new_sheet("2026").unwrap();
        set_cell(sheet, 1, 1, "Serial number", false);
        set_cell(sheet, 2, 1, "Person", false);
        set_cell(sheet, 1, 2, "01", false);
        set_cell(sheet, 2, 2, "Mixed Case", false);
        set_cell(sheet, 1, 3, "1", false);
        set_cell(sheet, 2, 3, "Second Record", false);
        set_cell(sheet, 1, 4, "2", false);
        set_cell(sheet, 2, 4, "Keep This", false);
        sheet.get_cell_mut("C4").set_value_number(42);
        sheet.get_cell_mut("D4").set_formula("SUM(1,1)").set_formula_result_default("2");
        let original_style = sheet.get_style("B2").clone();
        apply_translation_excel_rules(sheet, 1, 1, 2);
        assert_eq!(sheet.get_value("B2"), "MIXED CASE");
        assert_eq!(sheet.get_value("B4"), "KEEP THIS");
        assert_eq!(sheet.get_value("C4"), "42");
        assert_eq!(sheet.get_cell("D4").unwrap().get_formula(), "SUM(1,1)");
        assert_eq!(sheet.get_style("B2"), &original_style);
        let generated = sheet.get_conditional_formatting_collection().iter().find(|format| format.get_conditional_collection().iter().any(|rule| rule.get_formula().is_some_and(|formula| formula.get_address_str() == DUPLICATE_STT_FORMAT_MARKER))).unwrap();
        assert_eq!(generated.get_sequence_of_references().get_sqref(), "A2:B2 A3:B3");
        apply_translation_excel_rules(sheet, 1, 1, 2);
        let rules = sheet.get_conditional_formatting_collection().iter().flat_map(|format| format.get_conditional_collection()).filter(|rule| rule.get_formula().is_some_and(|formula| formula.get_address_str() == DUPLICATE_STT_FORMAT_MARKER)).collect::<Vec<_>>();
        assert_eq!(rules.len(), 1);
        assert_eq!(*rules[0].get_style().unwrap().get_background_color().unwrap().get_indexed(), 5);
        xlsx::writer::xlsx::write(&book, &file).unwrap();
        let reopened = load(&file).unwrap();
        let sheet = reopened.get_sheet_by_name("2026").unwrap();
        assert_eq!(sheet.get_value("B2"), "MIXED CASE");
        assert_eq!(sheet.get_conditional_formatting_collection().iter().flat_map(|format| format.get_conditional_collection()).filter(|rule| rule.get_formula().is_some_and(|formula| formula.get_address_str() == DUPLICATE_STT_FORMAT_MARKER)).count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

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
    fn signature_import_preserves_stts_and_reports_prefilled_high_water() {
        let root = std::env::temp_dir().join(format!("b6h-signature-stt-import-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx");
        signature_fixture(&file, false);
        let imported = import(&State::default(), "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let register = &imported["sheets"][0];
        assert_eq!(register["allocationMax"], 800);
        assert_eq!(register["rows"].as_array().unwrap().len(), 1);
        assert_eq!(register["rows"][0]["number"], "800");
        assert_eq!(register["rows"][0]["workbookRow"], 8);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn signature_sparse_register_through_800_keeps_auto_high_water_after_gap_fill() {
        let root = std::env::temp_dir().join(format!("b6h-signature-stt-800-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx");
        let mut book = xlsx::new_file_empty_worksheet();
        let sheet = book.new_sheet("Register").unwrap();
        let settings = json!({});
        for (index, header) in header_candidates("signature", &settings, "EN").iter().enumerate() { set_cell(sheet, index as u32 + 1, 3, header, false); }
        let mut row = 4;
        for number in 1..=800 {
            if (50..=99).contains(&number) { continue; }
            set_cell(sheet, 1, row, &number.to_string(), true);
            set_cell(sheet, 2, row, "2026-11-16", false);
            set_cell(sheet, 3, row, "Existing person", false);
            row += 1;
        }
        xlsx::writer::xlsx::write(&book, &file).unwrap();
        let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &settings).unwrap();
        assert_eq!(imported["sheets"][0]["rows"].as_array().unwrap().len(), 750);
        assert_eq!(imported["sheets"][0]["allocationMax"], 800);
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        input["sheets"][0]["rows"].as_array_mut().unwrap().push(new_signature_record("50", "manual-50"));
        let gap = save_signature(&state, &input, &settings);
        assert_eq!(gap["status"], "success");
        apply_row_locators(&mut input, &gap);
        assert_eq!(input["sheets"][0]["rows"].as_array().unwrap().iter().find(|record| record["id"] == "manual-50").unwrap()["number"], "50");
        assert_eq!(input["sheets"][0]["allocationMax"], 800);
        input["sheets"][0]["rows"].as_array_mut().unwrap().push(new_signature_record("900", "manual-900"));
        let higher = save_signature(&state, &input, &settings);
        assert_eq!(higher["status"], "success");
        let saved = load(&file).unwrap();
        assert_eq!(saved.get_sheet_by_name("Register").unwrap().get_value("A53"), "50");
        assert_eq!(saved.get_sheet_by_name("Register").unwrap().get_value("A755"), "900");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn signature_additions_at_890_boundary_keep_physical_stt_slots_and_refresh_locators() {
        let root = std::env::temp_dir().join(format!("b6h-signature-stt-890-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx");
        let settings = json!({});
        let mut book = xlsx::new_file_empty_worksheet();
        let sheet = book.new_sheet("Register").unwrap();
        for (index, header) in header_candidates("signature", &settings, "EN").iter().enumerate() { set_cell(sheet, index as u32 + 1, 3, header, false); }
        for number in 1..=890 {
            set_cell(sheet, 1, number + 3, &format!("{number:02}"), false);
            if ![1, 750, 789].contains(&number) {
                set_cell(sheet, 2, number + 3, "2026-11-16", false);
                set_cell(sheet, 3, number + 3, &format!("Existing {number}"), false);
            }
        }
        xlsx::writer::xlsx::write(&book, &file).unwrap();

        let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &settings).unwrap();
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        for (number, id, person, confirmed) in [("1", "manual-01", "New 01", false), ("01", "duplicate-01", "Duplicate 01", true), ("789", "manual-789", "New 789", false), ("750", "manual-750", "New 750", false), ("891", "auto-891", "New 891", false), ("900", "manual-900", "New 900", false)] {
            let mut record = new_signature_record(number, id);
            record["person"] = json!(person);
            if confirmed { record["duplicateConfirmed"] = json!(true); }
            input["sheets"][0]["rows"].as_array_mut().unwrap().push(record);
        }
        let saved = save_signature(&state, &input, &settings);
        assert_eq!(saved["status"], "success", "{saved}");
        assert_eq!(saved["allocationMaxes"][string(&input["sheets"][0], "id")], 900);
        let duplicate_row = saved["rowLocators"]["duplicate-01"].as_u64().unwrap() as u32;
        let row_01 = saved["rowLocators"]["manual-01"].as_u64().unwrap() as u32;
        let row_750 = saved["rowLocators"]["manual-750"].as_u64().unwrap() as u32;
        let row_789 = saved["rowLocators"]["manual-789"].as_u64().unwrap() as u32;
        let row_891 = saved["rowLocators"]["auto-891"].as_u64().unwrap() as u32;
        let row_900 = saved["rowLocators"]["manual-900"].as_u64().unwrap() as u32;
        assert_eq!(row_01, 4);
        assert_eq!(duplicate_row, row_01 + 1);
        assert_eq!(row_750, 754);
        assert_eq!(row_789, 793);
        assert!(row_750 < row_789 && row_789 < row_891 && row_891 < row_900);

        let reopened = load(&file).unwrap();
        let sheet = reopened.get_sheet_by_name("Register").unwrap();
        assert_eq!(cell(sheet, 1, row_01), "01");
        assert_eq!(sheet.get_style((1, duplicate_row)).get_number_format().map(|format| format.get_format_code()), Some("00"));
        for (row, expected_number, expected_person) in [
            (row_01, "01", "New 01"), (duplicate_row, "01", "Duplicate 01"),
            (row_750, "750", "New 750"), (row_789, "789", "New 789"),
            (row_891, "891", "New 891"), (row_900, "900", "New 900"),
        ] {
            assert_eq!(numeric_stt(&cell(sheet, 1, row)), numeric_stt(expected_number), "wrong STT at physical row {row}");
            assert_eq!(cell(sheet, 3, row), expected_person, "wrong record at physical row {row}");
        }
        assert_eq!(cell(sheet, 1, row_750 - 1), "749");
        assert_eq!(cell(sheet, 1, row_750 + 1), "751");
        assert_eq!(cell(sheet, 1, row_789 - 1), "788");
        assert_eq!(cell(sheet, 1, row_789 + 1), "790");
        let refreshed = import(&state, "signature", &file.to_string_lossy(), &settings).unwrap();
        for (person, row) in [("New 01", row_01), ("Duplicate 01", duplicate_row), ("New 750", row_750), ("New 789", row_789), ("New 891", row_891), ("New 900", row_900)] {
            assert_eq!(refreshed["sheets"][0]["rows"].as_array().unwrap().iter().find(|record| record["person"] == person).map(|record| record["workbookRow"].as_u64().unwrap() as u32), Some(row));
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn signature_save_fills_prefilled_gap_without_rebuilding_rows() {
        let root = std::env::temp_dir().join(format!("b6h-signature-stt-save-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx");
        signature_fixture(&file, false);
        let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        input["sheets"][0]["rows"].as_array_mut().unwrap().push(new_signature_record("750", "manual-750"));
        let first = save_signature(&state, &input, &json!({}));
        assert_eq!(first["status"], "success");
        assert_eq!(first["rowLocators"]["manual-750"], 7);
        apply_row_locators(&mut input, &first);
        input["sheets"][0]["rows"].as_array_mut().unwrap().push(new_signature_record("750", "duplicate-750"));
        let duplicate = save_signature(&state, &input, &json!({}));
        assert_eq!(duplicate["status"], "duplicate");
        assert_eq!(duplicate["number"], 750);
        assert_eq!(duplicate["row"], 7);
        input["sheets"][0]["rows"].as_array_mut().unwrap().pop();
        input["sheets"][0]["rows"].as_array_mut().unwrap().push(new_signature_record("900", "manual-900"));
        let second = save_signature(&state, &input, &json!({}));
        assert_eq!(second["status"], "success");
        apply_row_locators(&mut input, &second);
        input["sheets"][0]["rows"].as_array_mut().unwrap().push(new_signature_record("850", "manual-850"));
        let third = save_signature(&state, &input, &json!({}));
        assert_eq!(third["status"], "success");
        let saved = load(&file).unwrap();
        let sheet = saved.get_sheet_by_name("Register").unwrap();
        assert_eq!(sheet.get_value("A7"), "750");
        assert_eq!(sheet.get_value("C7"), "New person");
        assert_eq!(sheet.get_value("A8"), "800");
        assert_eq!(sheet.get_value("A9"), "850");
        assert_eq!(sheet.get_value("A10"), "900");
        assert_eq!(sheet.get_value("J2"), "2");
        assert_eq!(sheet.get_cell("J2").unwrap().get_formula(), "SUM(1,1)");
        assert_eq!(sheet.get_style("A7").get_number_format().unwrap().get_format_code(), "0000");
        assert_eq!(saved.get_sheet_by_name("Cover").unwrap().get_value("A1"), "Keep this sheet");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn d01_delete_extra_removes_the_physical_row_and_keeps_the_canonical_record() {
        let root = std::env::temp_dir().join(format!("b6h-signature-d01-{}", Uuid::new_v4())); fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx"); signature_duplicate_fixture(&file, 2); let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]}); delete_signature_record_at(&mut input, 8);
        assert_eq!(save_signature(&state, &input, &json!({}))["status"], "success");
        let saved = load(&file).unwrap(); let sheet = saved.get_sheet_by_name("Register").unwrap();
        assert_eq!(sheet.get_value("A7"), "01"); assert_eq!(sheet.get_value("C7"), "Record A");
        assert_eq!(sheet.get_value("A8"), "02"); assert_eq!(sheet.get_value("A9"), "03"); assert_eq!(sheet.get_highest_row(), 9);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn d02_delete_base_promotes_the_first_survivor_to_the_original_slot() {
        let root = std::env::temp_dir().join(format!("b6h-signature-d02-{}", Uuid::new_v4())); fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx"); signature_duplicate_fixture(&file, 2); let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]}); delete_signature_record_at(&mut input, 7);
        let result = save_signature(&state, &input, &json!({})); assert_eq!(result["status"], "success");
        let saved = load(&file).unwrap(); let sheet = saved.get_sheet_by_name("Register").unwrap();
        assert_eq!(result["rowLocators"][input["sheets"][0]["rows"][0]["id"].as_str().unwrap()], 7);
        assert_eq!(sheet.get_value("A7"), "01"); assert_eq!(sheet.get_value("C7"), "Record B");
        assert_eq!(sheet.get_value("A8"), "02"); assert_eq!(sheet.get_value("C8"), "Record 02");
        assert_eq!(sheet.get_highest_row(), 9); fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn d03_delete_last_record_keeps_stt_and_preserves_template_formula() {
        let root = std::env::temp_dir().join(format!("b6h-signature-d03-{}", Uuid::new_v4())); fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx"); signature_duplicate_fixture(&file, 1); let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]}); delete_signature_record_at(&mut input, 7);
        assert_eq!(save_signature(&state, &input, &json!({}))["status"], "success");
        let saved = load(&file).unwrap(); let sheet = saved.get_sheet_by_name("Register").unwrap();
        assert_eq!(sheet.get_value("A7"), "01"); assert!(sheet.get_value("C7").trim().is_empty());
        assert_eq!(sheet.get_value("A8"), "02"); assert_eq!(sheet.get_cell("J2").unwrap().get_formula(), "SUM(1,1)");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn d04_d05_delete_all_duplicates_in_either_order_keeps_one_empty_slot() {
        for reverse in [false, true] {
            let root = std::env::temp_dir().join(format!("b6h-signature-d04-{reverse}-{}", Uuid::new_v4())); fs::create_dir(&root).unwrap();
            let file = root.join("signature.xlsx"); signature_duplicate_fixture(&file, 2); let state = State::default();
            let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
            let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
            if reverse { input["sheets"][0]["rows"].as_array_mut().unwrap().reverse(); }
            input["sheets"][0]["rows"].as_array_mut().unwrap().retain(|record| record["number"] != "01");
            assert_eq!(save_signature(&state, &input, &json!({}))["status"], "success");
            let sheet = load(&file).unwrap(); let sheet = sheet.get_sheet_by_name("Register").unwrap();
            assert_eq!(sheet.get_value("A7"), "01"); assert!(sheet.get_value("C7").trim().is_empty());
            assert_eq!(sheet.get_value("A8"), "02"); assert_eq!(sheet.get_value("A9"), "03"); assert_eq!(sheet.get_highest_row(), 9);
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn d06_d07_multiple_duplicate_survivors_are_preserved_once() {
        for deleted in [7u32, 8] {
            let root = std::env::temp_dir().join(format!("b6h-signature-d06-{deleted}-{}", Uuid::new_v4())); fs::create_dir(&root).unwrap();
            let file = root.join("signature.xlsx"); signature_duplicate_fixture(&file, 3); let state = State::default();
            let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
            let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]}); delete_signature_record_at(&mut input, deleted);
            assert_eq!(save_signature(&state, &input, &json!({}))["status"], "success");
            let saved = load(&file).unwrap(); let sheet = saved.get_sheet_by_name("Register").unwrap();
            if deleted == 7 { assert_eq!(sheet.get_value("C7"), "Record B"); assert_eq!(sheet.get_value("C8"), "Record C"); }
            else { assert_eq!(sheet.get_value("C7"), "Record A"); assert_eq!(sheet.get_value("C8"), "Record C"); }
            assert_eq!(sheet.get_value("A9"), "02"); assert_eq!(sheet.get_value("A10"), "03");
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn d09_deleting_highest_keeps_the_empty_slot_and_boundary_after_reopen() {
        let root = std::env::temp_dir().join(format!("b6h-signature-d09-{}", Uuid::new_v4())); fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx"); signature_duplicate_fixture(&file, 1); let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        let highest = input["sheets"][0]["rows"].as_array().unwrap().iter().find(|row| row["number"] == "03").unwrap()["workbookRow"].as_u64().unwrap() as u32;
        delete_signature_record_at(&mut input, highest);
        assert_eq!(save_signature(&state, &input, &json!({}))["status"], "success");
        let reopened = import(&State::default(), "signature", &file.to_string_lossy(), &json!({})).unwrap();
        assert_eq!(reopened["sheets"][0]["allocationMax"], 3);
        assert_eq!(reopened["sheets"][0]["allocationMax"].as_u64().unwrap() + 1, 4);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn d08_delete_extra_preserves_a_genuine_missing_slot() {
        let root = std::env::temp_dir().join(format!("b6h-signature-d08-{}", Uuid::new_v4())); fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx"); let mut book = xlsx::new_file_empty_worksheet(); let sheet = book.new_sheet("Register").unwrap();
        for (index, header) in header_candidates("signature", &json!({}), "EN").iter().enumerate() { set_cell(sheet, index as u32 + 1, 3, header, false); }
        for (row, number, person) in [(7, "749", "749"), (8, "750", ""), (9, "751", "751 A"), (10, "751", "751 B"), (11, "752", "752")] {
            set_cell(sheet, 1, row, number, false); if !person.is_empty() { set_cell(sheet, 3, row, person, false); }
        }
        xlsx::writer::xlsx::write(&book, &file).unwrap(); let state = State::default(); let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]}); delete_signature_record_at(&mut input, 10);
        assert_eq!(save_signature(&state, &input, &json!({}))["status"], "success");
        let saved = load(&file).unwrap(); let sheet = saved.get_sheet_by_name("Register").unwrap();
        assert_eq!(sheet.get_value("A8"), "750"); assert!(sheet.get_value("C8").trim().is_empty());
        assert_eq!(sheet.get_value("A9"), "751"); assert_eq!(sheet.get_value("A10"), "752");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn d14_multiple_stt_groups_delete_offset_safely() {
        let root = std::env::temp_dir().join(format!("b6h-signature-d14-{}", Uuid::new_v4())); fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx"); signature_multi_group_fixture(&file); let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        delete_signature_record_at(&mut input, 8); delete_signature_record_at(&mut input, 9);
        assert_eq!(save_signature(&state, &input, &json!({}))["status"], "success");
        let saved = load(&file).unwrap(); let sheet = saved.get_sheet_by_name("Register").unwrap();
        assert_eq!(sheet.get_value("A7"), "01"); assert_eq!(sheet.get_value("C7"), "One A");
        assert_eq!(sheet.get_value("A8"), "02"); assert_eq!(sheet.get_value("C8"), "Two B");
        assert_eq!(sheet.get_value("A9"), "03"); assert_eq!(sheet.get_highest_row(), 10);
        assert_eq!(sheet.get_cell("K10").unwrap().get_formula(), "A9");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn m15_invalid_stt_values_do_not_modify_the_workbook() {
        for number in ["0", "-1", "1.5", "1e2", "abc", "100500"] {
            let root = std::env::temp_dir().join(format!("b6h-signature-m15-{}-{}", number, Uuid::new_v4())); fs::create_dir(&root).unwrap();
            let file = root.join("signature.xlsx"); signature_duplicate_fixture(&file, 1); let state = State::default();
            let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
            let original = workbook_hash(&file).unwrap(); let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
            input["sheets"][0]["rows"].as_array_mut().unwrap().push(new_signature_record(number, "invalid-stt"));
            assert_eq!(save_signature(&state, &input, &json!({}))["status"], "invalid", "{number}");
            assert_eq!(workbook_hash(&file).unwrap(), original, "{number}"); fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn d15_m17_repeated_save_and_readd_reuse_the_canonical_slot() {
        let root = std::env::temp_dir().join(format!("b6h-signature-d15-{}", Uuid::new_v4())); fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx"); signature_duplicate_fixture(&file, 1); let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]}); delete_signature_record_at(&mut input, 7);
        let result = save_signature(&state, &input, &json!({})); assert_eq!(result["status"], "success"); apply_row_locators(&mut input, &result);
        assert_eq!(save_signature(&state, &input, &json!({}))["status"], "success");
        let reopened_state = State::default(); let reopened = import(&reopened_state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let mut readd = json!({"file":reopened["file"],"sourceMap":reopened["sourceMap"],"sheets":reopened["sheets"]});
        readd["sheets"][0]["rows"].as_array_mut().unwrap().push(new_signature_record("1", "readded-01"));
        let saved = save_signature(&reopened_state, &readd, &json!({}));
        assert_eq!(saved["status"], "success"); assert_eq!(saved["rowLocators"]["readded-01"], 7);
        let book = load(&file).unwrap(); let sheet = book.get_sheet_by_name("Register").unwrap();
        assert_eq!(sheet.get_value("A7"), "01"); assert_eq!(sheet.get_value("C7"), "New person");
        assert_eq!(sheet.get_value("A8"), "02"); assert_eq!(sheet.get_highest_row(), 9);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn m01_m03_numeric_stt_slots_keep_excel_type_and_display_minimum_two_digits() {
        let root = std::env::temp_dir().join(format!("b6h-signature-m01-{}", Uuid::new_v4())); fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx"); let mut book = xlsx::new_file_empty_worksheet(); let sheet = book.new_sheet("Register").unwrap();
        for (index, header) in header_candidates("signature", &json!({}), "EN").iter().enumerate() { set_cell(sheet, index as u32 + 1, 3, header, false); }
        for (row, number) in [(7, 1), (8, 9), (9, 10), (10, 750), (11, 1000)] { set_cell(sheet, 1, row, &number.to_string(), true); }
        xlsx::writer::xlsx::write(&book, &file).unwrap(); let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        for (number, id) in [("001", "m01"), ("9", "m09"), ("10", "m10"), ("750", "m750"), ("1000", "m1000")] { input["sheets"][0]["rows"].as_array_mut().unwrap().push(new_signature_record(number, id)); }
        assert_eq!(save_signature(&state, &input, &json!({}))["status"], "success");
        let saved = load(&file).unwrap(); let sheet = saved.get_sheet_by_name("Register").unwrap();
        assert_eq!(sheet.get_cell("A7").unwrap().get_value(), "1"); assert_eq!(sheet.get_style("A7").get_number_format().unwrap().get_format_code(), "00");
        assert_eq!(sheet.get_cell("A8").unwrap().get_value(), "9"); assert_eq!(sheet.get_style("A8").get_number_format().unwrap().get_format_code(), "00");
        assert_eq!(sheet.get_value("A9"), "10"); assert_eq!(sheet.get_value("A10"), "750"); assert_eq!(sheet.get_value("A11"), "1000");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn d18_ambiguous_business_row_without_stt_is_rejected_without_writing() {
        let root = std::env::temp_dir().join(format!("b6h-signature-d18-{}", Uuid::new_v4())); fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx"); signature_duplicate_fixture(&file, 1); let mut book = load(&file).unwrap();
        set_cell(book.get_sheet_by_name_mut("Register").unwrap(), 3, 10, "Unowned continuation", false); xlsx::writer::xlsx::write(&book, &file).unwrap();
        let state = State::default(); let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        let result = save_signature(&state, &input, &json!({}));
        assert_eq!(result["status"], "stale"); assert!(result["message"].as_str().unwrap().contains("no STT"));
        assert_eq!(load(&file).unwrap().get_sheet_by_name("Register").unwrap().get_value("C10"), "Unowned continuation");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn signature_save_rejects_partially_occupied_manual_stt() {
        let root = std::env::temp_dir().join(format!("b6h-signature-stt-duplicate-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx");
        signature_fixture(&file, true);
        let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        input["sheets"][0]["rows"].as_array_mut().unwrap().push(new_signature_record("750", "duplicate-750"));
        let result = save_signature(&state, &input, &json!({}));
        assert_eq!(result["status"], "duplicate");
        assert_eq!(result["number"], 750);
        assert_eq!(result["row"], 7);
        assert_eq!(load(&file).unwrap().get_sheet_by_name("Register").unwrap().get_value("H7"), "partial data");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn signature_import_reports_and_save_preserves_existing_duplicate_stts() {
        let root = std::env::temp_dir().join(format!("b6h-signature-stt-existing-duplicate-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx");
        signature_fixture(&file, false);
        let mut book = load(&file).unwrap();
        let sheet = book.get_sheet_by_name_mut("Register").unwrap();
        set_cell(sheet, 1, 9, "800", true);
        set_cell(sheet, 3, 9, "Second person", false);
        xlsx::writer::xlsx::write(&book, &file).unwrap();
        let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        assert_eq!(imported["sheets"][0]["duplicateNumbers"][0], 800);
        let input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        let result = save_signature(&state, &input, &json!({}));
        assert_eq!(result["status"], "success");
        let saved = load(&file).unwrap();
        let saved_sheet = saved.get_sheet_by_name("Register").unwrap();
        assert_eq!(saved_sheet.get_value("A8"), "800");
        assert_eq!(saved_sheet.get_value("A9"), "800");
        assert_eq!(saved_sheet.get_value("C8"), "Existing person");
        assert_eq!(saved_sheet.get_value("C9"), "Second person");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn signature_save_inserts_confirmed_duplicates_below_matching_stt() {
        let root = std::env::temp_dir().join(format!("b6h-signature-confirmed-duplicate-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx");
        signature_fixture(&file, false);
        let mut book = load(&file).unwrap();
        let sheet = book.get_sheet_by_name_mut("Register").unwrap();
        set_cell(sheet, 3, 8, "Existing person", false);
        sheet.add_merge_cells("A8:A9");
        sheet.add_merge_cells("C8:C9");
        xlsx::writer::xlsx::write(&book, &file).unwrap();
        let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        let existing_id = input["sheets"][0]["rows"].as_array().unwrap().iter().find(|row| row["number"] == "800").unwrap()["id"].as_str().unwrap().to_string();
        input["sheets"][0]["rows"].as_array_mut().unwrap().push(new_signature_record("750", "first-750"));
        let mut duplicate = new_signature_record("750", "confirmed-750");
        duplicate["duplicateConfirmed"] = json!(true);
        input["sheets"][0]["rows"].as_array_mut().unwrap().push(duplicate);
        let mut second_duplicate = new_signature_record("750", "confirmed-750-second");
        second_duplicate["duplicateConfirmed"] = json!(true);
        input["sheets"][0]["rows"].as_array_mut().unwrap().push(second_duplicate);
        let result = save_signature(&state, &input, &json!({}));
        assert_eq!(result["status"], "success", "{result}");
        assert_eq!(result["rowLocators"]["first-750"], 7);
        assert_eq!(result["rowLocators"]["confirmed-750"], 8);
        assert_eq!(result["rowLocators"]["confirmed-750-second"], 9);
        assert_eq!(result["rowLocators"][&existing_id], 10);
        assert_eq!(result["rowLocatorEnds"][&existing_id], 11);
        let saved = load(&file).unwrap();
        let sheet = saved.get_sheet_by_name("Register").unwrap();
        assert_eq!(sheet.get_value("A7"), "750");
        assert_eq!(sheet.get_value("A8"), "750");
        assert_eq!(sheet.get_value("A9"), "750");
        assert_eq!(sheet.get_value("A10"), "800");
        assert_eq!(sheet.get_value("C7"), "New person");
        assert_eq!(sheet.get_value("C8"), "New person");
        assert_eq!(sheet.get_value("C9"), "New person");
        assert_eq!(sheet.get_value("C10"), "Existing person");
        assert_eq!(merged_span(sheet, 3, 11), Some((3, 10, 3, 11)));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn signature_save_rejects_external_workbook_changes() {
        let root = std::env::temp_dir().join(format!("b6h-signature-stt-stale-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx");
        signature_fixture(&file, false);
        let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        let mut external = load(&file).unwrap();
        external.get_sheet_by_name_mut("Cover").unwrap().get_cell_mut("A1").set_value("External change");
        xlsx::writer::xlsx::write(&external, &file).unwrap();
        let result = save_signature(&state, &input, &json!({}));
        assert_eq!(result["status"], "stale");
        assert_eq!(load(&file).unwrap().get_sheet_by_name("Cover").unwrap().get_value("A1"), "External change");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn signature_save_rejects_stt_beyond_supported_capacity() {
        let root = std::env::temp_dir().join(format!("b6h-signature-stt-capacity-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx");
        signature_fixture(&file, false);
        let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        input["sheets"][0]["rows"].as_array_mut().unwrap().push(new_signature_record("100500", "too-large"));
        let result = save_signature(&state, &input, &json!({}));
        assert_eq!(result["status"], "invalid");
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn signature_save_does_not_replace_a_workbook_locked_without_delete_access() {
        let root = std::env::temp_dir().join(format!("b6h-signature-stt-locked-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx");
        signature_fixture(&file, false);
        let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        let _lock = OpenOptions::new().read(true).share_mode(1).open(&file).unwrap();
        let result = save_signature(&state, &input, &json!({}));
        assert_eq!(result["status"], "io");
        drop(_lock);
        assert_eq!(load(&file).unwrap().get_sheet_by_name("Cover").unwrap().get_value("A1"), "Keep this sheet");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn signature_save_replaces_atomically_without_sidecar_files() {
        let root = std::env::temp_dir().join(format!("b6h-register-backup-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx");
        signature_fixture(&file, false);
        let state = State::default();
        let mut imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        imported["sheets"][0]["rows"][0]["person"] = json!("Updated signer");
        let input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        for _ in 0..20 { assert_eq!(save_signature(&state, &input, &json!({}))["status"], "success"); }
        assert_eq!(cell(load(&file).unwrap().get_sheet_by_name("Register").unwrap(), 3, 8), "Updated signer");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn register_save_file_lock_serializes_handles_without_sidecars() {
        let root = std::env::temp_dir().join(format!("b6h-save-lock-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("workbook.xlsx");
        fs::write(&file, b"test").unwrap();
        let first = lock_register_save(&file).unwrap();
        assert!(lock_register_save(&file).is_err());
        drop(first);
        assert!(lock_register_save(&file).is_ok());
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn workbook_lock_preserves_the_original_and_allows_retry_without_sidecars() {
        let root = std::env::temp_dir().join(format!("b6h-register-lock-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx");
        signature_fixture(&file, false);
        let original_hash = workbook_hash(&file).unwrap();
        let state = Arc::new(State::default());
        let mut imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        imported["sheets"][0]["rows"][0]["person"] = json!("Pending signer");
        let input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        let lock = lock_register_save(&file).unwrap();
        let state_for_thread = Arc::clone(&state);
        let input_for_thread = input.clone();
        let result = std::thread::spawn(move || save_signature(&state_for_thread, &input_for_thread, &json!({})))
            .join().unwrap();
        assert_eq!(result["status"], "io");
        assert_eq!(workbook_hash(&file).unwrap(), original_hash);
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        drop(lock);
        assert_eq!(save_signature(&state, &input, &json!({}))["status"], "success");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "manual audit against the user's representative Signature workbook"]
    fn signature_real_workbook_roundtrip_preserves_merged_records_and_original() {
        let source = PathBuf::from(std::env::var("B6H_SIGNATURE_TEST_WORKBOOK").expect("set B6H_SIGNATURE_TEST_WORKBOOK to the supplied workbook"));
        let before = workbook_hash(&source).unwrap();
        let root = std::env::temp_dir().join(format!("b6h-signature-real-audit-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature-copy.xlsx");
        fs::copy(&source, &file).unwrap();
        let state = State::default();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        let register = &imported["sheets"][0];
        assert_eq!(register["name"], "2026");
        assert_eq!(register["allocationMax"], 1232);
        assert_eq!(register["rows"].as_array().unwrap().len(), 562);
        assert!(register["duplicateNumbers"].as_array().unwrap().is_empty());
        let merged = register["rows"].as_array().unwrap().iter().find(|row| row["number"] == "36").unwrap();
        assert_eq!(merged["workbookRow"], 41);
        assert_eq!(merged["workbookRowEnd"], 41);
        assert!(string(merged, "person").contains('\n'));
        let before_book = load(&file).unwrap();
        let before_sheets: Vec<_> = before_book.get_sheet_collection().iter().map(|s| s.get_name().to_string()).collect();
        let before_merges = before_book.get_sheet_by_name("2026").unwrap().get_merge_cells().len();
        let before_formula = before_book.get_sheet_by_name("Sheet4").unwrap().get_cell("A1").unwrap().get_formula().to_string();
        let input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        let result = save_signature(&state, &input, &json!({}));
        assert_eq!(result["status"], "success", "{result}");
        let after_book = load(&file).unwrap();
        assert_eq!(after_book.get_sheet_collection().iter().map(|s| s.get_name().to_string()).collect::<Vec<_>>(), before_sheets);
        assert_eq!(after_book.get_sheet_by_name("2026").unwrap().get_merge_cells().len(), before_merges);
        assert_eq!(after_book.get_sheet_by_name("Sheet4").unwrap().get_cell("A1").unwrap().get_formula(), before_formula);
        assert_eq!(after_book.get_sheet_by_name("2026").unwrap().get_value("C41"), before_book.get_sheet_by_name("2026").unwrap().get_value("C41"));
        let reopened = import(&State::default(), "signature", &file.to_string_lossy(), &json!({})).unwrap();
        assert_eq!(reopened["sheets"][0]["rows"].as_array().unwrap().len(), 562);
        assert!(reopened["sheets"][0]["duplicateNumbers"].as_array().unwrap().is_empty());
        assert_eq!(workbook_hash(&source).unwrap(), before);
        fs::remove_dir_all(root).unwrap();
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
                &json!([{"id":"sheet","name":"Register","rows":[{"id":"row","number":"01","date":"2026-01-04"}]}]),
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
    fn existing_register_saves_format_native_dates_and_preserve_text_dates() {
        let root = std::env::temp_dir().join(format!("b6h-register-date-save-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let dates = ["2026-01-05", "2026-05-01", "2026-11-09", "2026-11-19", "2026-12-31", "2028-02-29"];
        let state = State::default();
        for kind in ["signature", "translation"] {
            let file = root.join(format!("{kind}.xlsx"));
            let mut rows = dates.iter().enumerate().map(|(index, date)| json!({
                "id": format!("{kind}-{index}"), "number": format!("{:02}", index + 1), "date": date,
                "person": format!("Person {index}"), "document": "Record", "languages": "EN - VI",
                "certifier": "Signer", "copies": "1", "fee": "", "notes": ""
            })).collect::<Vec<_>>();
            rows.push(json!({"id":format!("{kind}-text"),"number":"07","date":"2026-01-05","person":"Text date","document":"Record","languages":"EN - VI","certifier":"Signer","copies":"1","fee":"","notes":""}));
            rows.push(json!({"id":format!("{kind}-empty"),"number":"08","date":"","person":"Empty date","document":"Record","languages":"EN - VI","certifier":"Signer","copies":"1","fee":"","notes":""}));
            rows.push(json!({"id":format!("{kind}-text-empty"),"number":"09","date":"","person":"Text date schema","document":"Record","languages":"EN - VI","certifier":"Signer","copies":"1","fee":"","notes":""}));
            create(&state, kind, &file.to_string_lossy(), &json!([{"id":"register","name":"Register","rows":rows}]), &json!({}), "EN").unwrap();

            let mut book = load(&file).unwrap();
            let stt_before = {
                let sheet = book.get_sheet_by_name_mut("Register").unwrap();
                for row in 2..=10 { sheet.get_style_mut((2, row)).get_number_format_mut().set_format_code("m/d/yyyy"); }
                sheet.get_cell_mut("B8").set_value_string("05/01/2026");
                sheet.get_style_mut("B8").get_number_format_mut().set_format_code("@");
                sheet.get_cell_mut("B9").set_value_string("");
                sheet.get_cell_mut("B10").set_value_string("");
                sheet.get_style_mut("B10").get_number_format_mut().set_format_code("@");
                (2..=10).map(|row| cell(sheet, 1, row)).collect::<Vec<_>>()
            };
            let cover = book.new_sheet("Cover").unwrap();
            cover.get_cell_mut("A1").set_formula("SUM(1,1)").set_formula_result_default("2");
            cover.get_style_mut("B1").get_number_format_mut().set_format_code("0.000");
            xlsx::writer::xlsx::write(&book, &file).unwrap();

            let imported = import(&state, kind, &file.to_string_lossy(), &json!({})).unwrap();
            assert_eq!(imported["sheets"][0]["rows"][0]["date"], dates[0]);
            assert_eq!(imported["sheets"][0]["rows"][1]["date"], dates[1]);
            assert_eq!(imported["sheets"][0]["rows"][6]["date"], dates[0]);
            assert_eq!(imported["sheets"][0]["rows"][7]["date"], "");
            assert_eq!(imported["sheets"][0]["rows"][8]["date"], "");
            let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
            input["sheets"][0]["rows"][1]["date"] = json!("2026-06-01");
            input["sheets"][0]["rows"][6]["date"] = json!("2026-11-19");
            input["sheets"][0]["rows"][8]["date"] = json!("2026-05-01");
            for _ in 0..2 { assert_eq!(save_register(&state, &input, &json!({}), kind)["status"], "success"); }

            let saved = load(&file).unwrap();
            let sheet = saved.get_sheet_by_name("Register").unwrap();
            for (index, record) in input["sheets"][0]["rows"].as_array().unwrap().iter().take(6).enumerate() {
                let row = index as u32 + 2;
                let expected = date_serial(record["date"].as_str().unwrap()).unwrap();
                let date_cell = sheet.get_cell((2, row)).unwrap();
                assert_eq!(date_cell.get_data_type(), "n", "{kind} row {row}");
                assert_eq!(date_cell.get_value().to_string(), expected, "{kind} row {row}");
                assert_eq!(sheet.get_style((2, row)).get_number_format().unwrap().get_format_code(), "dd/mm/yyyy", "{kind} row {row}");
                assert_eq!(input["sheets"][0]["rows"][index]["workbookRow"], row);
            }
            assert_eq!(sheet.get_cell("B8").unwrap().get_data_type(), "s");
            assert_eq!(sheet.get_value("B8"), "19/11/2026");
            assert_eq!(sheet.get_style("B8").get_number_format().unwrap().get_format_code(), "@");
            assert_eq!(sheet.get_value("B9"), "");
            assert_eq!(sheet.get_cell("B10").unwrap().get_data_type(), "s");
            assert_eq!(sheet.get_value("B10"), "01/05/2026");
            assert_eq!(sheet.get_style("B10").get_number_format().unwrap().get_format_code(), "@");
            assert_eq!(cell(sheet, 1, 2), stt_before[0]);
            assert_eq!(cell(sheet, 1, 9), stt_before[7]);
            assert_eq!(saved.get_sheet_by_name("Cover").unwrap().get_cell("A1").unwrap().get_formula(), "SUM(1,1)");
            assert_eq!(saved.get_sheet_by_name("Cover").unwrap().get_style("B1").get_number_format().unwrap().get_format_code(), "0.000");
            let reopened = import(&state, kind, &file.to_string_lossy(), &json!({})).unwrap();
            assert_eq!(reopened["sheets"][0]["rows"][0]["date"], dates[0]);
            assert_eq!(reopened["sheets"][0]["rows"][1]["date"], "2026-06-01");
            assert_eq!(reopened["sheets"][0]["rows"][6]["date"], "2026-11-19");
            assert_eq!(reopened["sheets"][0]["rows"][7]["date"], "");
            assert_eq!(reopened["sheets"][0]["rows"][8]["date"], "2026-05-01");
            let reopened_input = json!({"file":reopened["file"],"sourceMap":reopened["sourceMap"],"sheets":reopened["sheets"]});
            let second_save = save_register(&state, &reopened_input, &json!({}), kind);
            for (index, record) in reopened_input["sheets"][0]["rows"].as_array().unwrap().iter().enumerate() {
                assert_eq!(record["workbookRow"], index as u32 + 2);
                assert_eq!(second_save["rowLocators"][record["id"].as_str().unwrap()], index as u32 + 2);
            }
        }
        assert_eq!(fs::read_dir(&root).unwrap().count(), 2);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn signature_create_and_save_write_document_and_certifier_uppercase_at_14_points() {
        let root = std::env::temp_dir().join(format!("b6h-signature-certifier-case-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("signature.xlsx");
        let state = State::default();
        create(&state, "signature", &file.to_string_lossy(), &json!([
            {"id":"sheet","name":"Register","rows":[{"id":"row","number":"1","date":"2026-11-16","document":"Sơ yếu lý lịch","certifier":"Công chứng viên Nguyễn Thị Xuân"}]}
        ]), &json!({}), "VI").unwrap();
        let created = load(&file).unwrap();
        assert_eq!(created.get_sheet_by_name("Register").unwrap().get_value("D2"), "SƠ YẾU LÝ LỊCH");
        assert_eq!(created.get_sheet_by_name("Register").unwrap().get_value("E2"), "CÔNG CHỨNG VIÊN NGUYỄN THỊ XUÂN");
        assert_eq!(*created.get_sheet_by_name("Register").unwrap().get_style((4, 2)).get_font().unwrap().get_size(), 14.0);
        assert_eq!(*created.get_sheet_by_name("Register").unwrap().get_style((1, 1)).get_font().unwrap().get_size(), 14.0);

        let mut lowercase = created;
        set_cell(lowercase.get_sheet_by_name_mut("Register").unwrap(), 4, 2, "Sơ yếu lý lịch", false);
        set_cell(lowercase.get_sheet_by_name_mut("Register").unwrap(), 5, 2, "Công chứng viên Nguyễn Thị Xuân", false);
        xlsx::writer::xlsx::write(&lowercase, &file).unwrap();
        let imported = import(&state, "signature", &file.to_string_lossy(), &json!({})).unwrap();
        assert_eq!(imported["sheets"][0]["rows"][0]["document"], "SƠ YẾU LÝ LỊCH");
        let mut input = json!({"file":imported["file"],"sourceMap":imported["sourceMap"],"sheets":imported["sheets"]});
        input["sheets"][0]["rows"][0]["document"] = json!("Sơ yếu lý lịch");
        input["sheets"][0]["rows"][0]["certifier"] = json!("Công chứng viên Nguyễn Thị Xuân");
        assert_eq!(save_signature(&state, &input, &json!({}))["status"], "success");
        let saved = load(&file).unwrap();
        let sheet = saved.get_sheet_by_name("Register").unwrap();
        assert_eq!(sheet.get_value("D2"), "SƠ YẾU LÝ LỊCH");
        assert_eq!(sheet.get_value("E2"), "CÔNG CHỨNG VIÊN NGUYỄN THỊ XUÂN");
        assert_eq!(*sheet.get_style((4, 2)).get_font().unwrap().get_size(), 14.0);
        assert_eq!(*sheet.get_style((1, 1)).get_font().unwrap().get_size(), 14.0);
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
        assert_eq!(register.get_value("C2"), "SECOND PERSON");
        assert_eq!(
            register.get_value("I2"),
            "FIRST LINE\nSECOND LINE\nTHIRD LINE"
        );
        assert!(*register.get_row_dimension(&2).unwrap().get_height() >= 56.0);
        assert!(*register.get_column_dimension("C").unwrap().get_width() > 32.0);
        assert!(register.get_tables().is_empty());
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
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
    #[test]
    fn translation_save_places_manual_gaps_by_stt_and_returns_locators() {
        let root = std::env::temp_dir().join(format!("b6h-translation-stt-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("translation.xlsx");
        let mut book = xlsx::new_file_empty_worksheet();
        let sheet = book.new_sheet("Register").unwrap();
        for (index, header) in header_candidates("translation", &json!({}), "EN").iter().enumerate() { set_cell(sheet, index as u32 + 1, 1, header, false); }
        set_cell(sheet, 1, 2, "01", false); set_cell(sheet, 3, 2, "First", false);
        set_cell(sheet, 1, 4, "03", false); set_cell(sheet, 3, 4, "Third", false);
        xlsx::writer::xlsx::write(&book, &file).unwrap();
        let state = State::default();
        let mut input = import(&state, "translation", &file.to_string_lossy(), &json!({})).unwrap();
        input["sheets"][0]["rows"].as_array_mut().unwrap().push(json!({"id":"manual-02","number":"02","date":"2026-11-16","person":"Second","document":"","languages":"EN - VI","certifier":"","copies":"1","fee":"","notes":""}));
        let result = save_translation(&state, &input, &json!({}));
        assert_eq!(result["status"], "success");
        let row = result["rowLocators"]["manual-02"].as_u64().unwrap() as u32;
        let saved = load(&file).unwrap();
        let sheet = saved.get_sheet_by_name("Register").unwrap();
        assert_eq!(numeric_stt(&cell(sheet, 1, row)), Some(2));
        assert_eq!(cell(sheet, 3, row), "SECOND");
        assert_eq!(numeric_stt(&cell(sheet, 1, row + 1)), Some(3));
        assert_eq!(result["allocationMaxes"][input["sheets"][0]["id"].as_str().unwrap()], 3);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn translation_missing_stt_reports_physical_row_and_reconcile_requires_explicit_assignment() {
        let root = std::env::temp_dir().join(format!("b6h-translation-missing-stt-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("translation.xlsx");
        let mut book = xlsx::new_file_empty_worksheet();
        let sheet = book.new_sheet("2026").unwrap();
        for (index, header) in header_candidates("translation", &json!({}), "EN").iter().enumerate() { set_cell(sheet, index as u32 + 1, 1, header, false); }
        for (row, number, document) in [(477, "476", "Earlier"), (479, "477", "Following"), (480, "478", "Later")] {
            set_cell(sheet, 1, row, number, false);
            set_cell(sheet, 2, row, "15/08/2026", false);
            set_cell(sheet, 3, row, "Same person", false);
            set_cell(sheet, 4, row, document, false);
            set_cell(sheet, 5, row, "Vietnamese - English", false);
            set_cell(sheet, 6, row, "Certifier", false);
            set_cell(sheet, 7, row, "1", false);
            set_cell(sheet, 8, row, "10000", false);
        }
        for (col, value) in [(2, "15/08/2026"), (3, "Same person"), (4, "Graduation certificate"), (5, "Vietnamese - English"), (6, "Certifier"), (7, "1"), (8, "10000")] { set_cell(sheet, col, 478, value, false); }
        set_cell(sheet, 1, 547, "545", false);
        xlsx::writer::xlsx::write(&book, &file).unwrap();
        let state = State::default();
        let mut imported = import(&state, "translation", &file.to_string_lossy(), &json!({})).unwrap();
        assert_eq!(imported["sheets"][0]["rows"].as_array().unwrap().len(), 4);
        let missing = imported["sheets"][0]["rows"].as_array().unwrap().iter().find(|row| row["workbookRow"] == 478).unwrap();
        assert_eq!(missing["number"], "");
        assert_eq!(missing["document"], "Graduation certificate");
        let original_hash = workbook_hash(&file).unwrap();
        let rejected = save_translation(&state, &imported, &json!({}));
        assert_eq!(rejected["status"], "missing_stt");
        assert_eq!(rejected["sheetName"], "2026");
        assert_eq!(rejected["row"], 478);
        assert_eq!(workbook_hash(&file).unwrap(), original_hash);
        let mut dropped = imported.clone();
        dropped["sheets"][0]["rows"].as_array_mut().unwrap().retain(|row| row["workbookRow"] != 478);
        let blocked_delete = save_translation(&state, &dropped, &json!({}));
        assert_eq!(blocked_delete["status"], "missing_stt");
        assert_eq!(blocked_delete["row"], 478);
        assert_eq!(workbook_hash(&file).unwrap(), original_hash);
        let original_bytes = fs::read(&file).unwrap();
        let mut externally_changed = load(&file).unwrap();
        externally_changed.get_sheet_by_name_mut("2026").unwrap().get_cell_mut("J1").set_value("external");
        xlsx::writer::xlsx::write(&externally_changed, &file).unwrap();
        let mut attempted = imported.clone();
        let attempted_row = attempted["sheets"][0]["rows"].as_array_mut().unwrap().iter_mut().find(|row| row["workbookRow"] == 478).unwrap();
        attempted_row.as_object_mut().unwrap().remove("workbookRow");
        attempted_row.as_object_mut().unwrap().remove("workbookRowEnd");
        attempted_row["reconcileFromRow"] = json!(478);
        attempted_row["number"] = json!("479");
        assert_eq!(save_translation(&state, &attempted, &json!({}))["status"], "stale");
        fs::write(&file, original_bytes).unwrap();
        let mut changed_source = imported.clone();
        let changed = changed_source["sheets"][0]["rows"].as_array_mut().unwrap().iter_mut().find(|row| row["workbookRow"] == 478).unwrap();
        changed.as_object_mut().unwrap().remove("workbookRow");
        changed.as_object_mut().unwrap().remove("workbookRowEnd");
        changed["reconcileFromRow"] = json!(478);
        changed["number"] = json!("479");
        changed["person"] = json!("Different person");
        let stale_reconcile = save_translation(&state, &changed_source, &json!({}));
        assert_eq!(stale_reconcile["status"], "stale");
        assert_eq!(workbook_hash(&file).unwrap(), original_hash);
        let mut extra_row = imported.clone();
        let source = extra_row["sheets"][0]["rows"].as_array_mut().unwrap().iter_mut().find(|row| row["workbookRow"] == 478).unwrap();
        source.as_object_mut().unwrap().remove("workbookRow"); source.as_object_mut().unwrap().remove("workbookRowEnd"); source["reconcileFromRow"] = json!(478); source["number"] = json!("900");
        extra_row["sheets"][0]["rows"].as_array_mut().unwrap().push(json!({"id":"unmapped-545","number":"545","date":"2026-06-17","person":"Unrelated addition","document":"Unrelated","languages":"Vietnamese - English","certifier":"Certifier","copies":"2","fee":"","notes":""}));
        let extra_row = save_translation(&state, &extra_row, &json!({}));
        assert_eq!(extra_row["status"], "invalid");
        assert_eq!(workbook_hash(&file).unwrap(), original_hash);

        let rows = imported["sheets"][0]["rows"].as_array_mut().unwrap();
        let index = rows.iter().position(|row| row["workbookRow"] == 478).unwrap();
        let mut reconciled = rows.remove(index);
        let record = reconciled.as_object_mut().unwrap();
        record.remove("workbookRow");
        record.remove("workbookRowEnd");
        record.insert("reconcileFromRow".into(), json!(478));
        record.insert("number".into(), json!("477"));
        let duplicate_index = rows.iter().rposition(|row| numeric_stt(&string(row, "number")) == Some(477)).unwrap() + 1;
        rows.insert(duplicate_index, reconciled);
        let reconciled_id = string(&rows[duplicate_index], "id");
        assert_eq!(save_translation(&state, &imported, &json!({}))["status"], "duplicate");
        assert_eq!(workbook_hash(&file).unwrap(), original_hash);
        imported["sheets"][0]["rows"][duplicate_index]["duplicateConfirmed"] = json!(true);
        let saved = save_translation(&state, &imported, &json!({}));
        assert_eq!(saved["status"], "success");
        let destination = saved["rowLocators"][&reconciled_id].as_u64().unwrap() as u32;
        assert_eq!(destination, 480);
        let reopened = load(&file).unwrap();
        let sheet = reopened.get_sheet_by_name("2026").unwrap();
        assert_eq!(cell(sheet, 4, 478), "");
        assert_eq!(numeric_stt(&cell(sheet, 1, 479)), Some(477));
        assert_eq!(numeric_stt(&cell(sheet, 1, 480)), Some(477));
        assert_eq!(cell(sheet, 4, 480), "GRADUATION CERTIFICATE");
        assert_eq!(numeric_stt(&cell(sheet, 1, 481)), Some(478));
        assert_eq!(numeric_stt(&cell(sheet, 1, 548)), Some(545));
        assert_eq!(cell(sheet, 3, 548), "");
        let refreshed = import(&State::default(), "translation", &file.to_string_lossy(), &json!({})).unwrap();
        assert_eq!(refreshed["sheets"][0]["rows"].as_array().unwrap().len(), 4);
        assert!(refreshed["sheets"][0]["rows"].as_array().unwrap().iter().all(|row| row["workbookRow"] != 478));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn translation_language_pairs_normalize_edits_and_uppercase_saved_workbook_text() {
        for (input, expected) in [
            ("Tiếng Việt - Tiếng Anh", "Việt - Anh"),
            ("English -> Vietnamese", "Anh - Việt"),
            ("Chinese - Vietnamese", "Hoa - Việt"),
            ("Tiếng Việt - Tiếng Nhật", "Việt - Nhật"),
            ("Korean - French", "Hàn - Pháp"),
            ("Tiếng tiếng Việt - Tiếng Tiếng Anh", "Việt - Anh"),
        ] { assert_eq!(concise_translation_language_pair(input), expected); }
        let root = std::env::temp_dir().join(format!("b6h-translation-language-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("translation-language.xlsx");
        let mut book = xlsx::new_file_empty_worksheet();
        let sheet = book.new_sheet("2026").unwrap();
        for (index, header) in header_candidates("translation", &json!({}), "EN").iter().enumerate() { set_cell(sheet, index as u32 + 1, 1, header, false); }
        set_cell(sheet, 1, 2, "01", false); set_cell(sheet, 3, 2, "Historical", false); set_cell(sheet, 5, 2, "Tiếng Việt - Tiếng Anh", false);
        xlsx::writer::xlsx::write(&book, &file).unwrap();
        let state = State::default();
        let mut imported = import(&state, "translation", &file.to_string_lossy(), &json!({})).unwrap();
        assert_eq!(save_translation(&state, &imported, &json!({}))["status"], "success");
        assert_eq!(cell(load(&file).unwrap().get_sheet_by_name("2026").unwrap(), 5, 2), "TIẾNG VIỆT - TIẾNG ANH");
        imported["sheets"][0]["rows"][0]["languages"] = json!("Vietnamese - Japanese");
        imported["sheets"][0]["rows"].as_array_mut().unwrap().push(json!({"id":"new-language","number":"02","date":"2026-11-23","person":"New","document":"","languages":"English -> Vietnamese","certifier":"","copies":"1","fee":"","notes":""}));
        assert_eq!(save_translation(&state, &imported, &json!({}))["status"], "success");
        let saved = load(&file).unwrap(); let sheet = saved.get_sheet_by_name("2026").unwrap();
        assert_eq!(cell(sheet, 5, 2), "VIỆT - NHẬT");
        let row = saved.get_sheet_by_name("2026").unwrap().get_highest_row();
        assert_eq!(cell(sheet, 5, row), "ANH - VIỆT");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn translation_new_workbook_rejects_blank_stt_instead_of_using_display_order() {
        let root = std::env::temp_dir().join(format!("b6h-translation-no-reindex-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("translation.xlsx");
        let result = create(&State::default(), "translation", &file.to_string_lossy(), &json!([{"id":"sheet","name":"2026","rows":[{"id":"missing","number":"","date":"2026-08-15","person":"Person","document":"Document","languages":"Vietnamese - English","certifier":"Certifier","copies":"1","fee":"10000","notes":""}]}]), &json!({}), "EN");
        assert!(result.unwrap_err().contains("user-verified STT"));
        assert!(!file.exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn translation_duplicate_group_save_and_delete_preserve_canonical_slot() {
        let root = std::env::temp_dir().join(format!("b6h-translation-duplicate-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("translation.xlsx");
        let mut book = xlsx::new_file_empty_worksheet();
        let sheet = book.new_sheet("Register").unwrap();
        for (index, header) in header_candidates("translation", &json!({}), "EN").iter().enumerate() { set_cell(sheet, index as u32 + 1, 1, header, false); }
        set_cell(sheet, 1, 2, "01", false); set_cell(sheet, 3, 2, "Original", false);
        set_cell(sheet, 1, 3, "02", false); set_cell(sheet, 3, 3, "Next", false);
        xlsx::writer::xlsx::write(&book, &file).unwrap();
        let state = State::default();
        let mut input = import(&state, "translation", &file.to_string_lossy(), &json!({})).unwrap();
        input["sheets"][0]["rows"].as_array_mut().unwrap().push(json!({"id":"duplicate-01","number":"01","date":"2026-11-16","person":"Duplicate","document":"","languages":"EN - VI","certifier":"","copies":"1","fee":"","notes":"","duplicateConfirmed":true}));
        let inserted = save_translation(&state, &input, &json!({}));
        assert_eq!(inserted["status"], "success");
        apply_row_locators(&mut input, &inserted);
        let duplicate_row = inserted["rowLocators"]["duplicate-01"].as_u64().unwrap() as u32;
        assert_eq!(duplicate_row, 3);
        let sheet = load(&file).unwrap();
        let sheet = sheet.get_sheet_by_name("Register").unwrap();
        assert_eq!(cell(sheet, 3, 2), "ORIGINAL");
        assert_eq!(cell(sheet, 3, 3), "DUPLICATE");
        assert_eq!(numeric_stt(&cell(sheet, 1, 4)), Some(2));
        let base_id = string(&input["sheets"][0]["rows"][0], "id");
        input["sheets"][0]["rows"].as_array_mut().unwrap().retain(|row| string(row, "id") != base_id);
        let promoted = save_translation(&state, &input, &json!({}));
        assert_eq!(promoted["status"], "success");
        assert_eq!(promoted["rowLocators"]["duplicate-01"], 2);
        let reopened = load(&file).unwrap();
        let sheet = reopened.get_sheet_by_name("Register").unwrap();
        assert_eq!(cell(sheet, 3, 2), "DUPLICATE");
        let refreshed = import(&state, "translation", &file.to_string_lossy(), &json!({})).unwrap();
        let mut delete_last = refreshed.clone();
        delete_last["sheets"][0]["rows"].as_array_mut().unwrap().clear();
        let deleted = save_translation(&state, &delete_last, &json!({}));
        assert_eq!(deleted["status"], "success");
        let emptied = load(&file).unwrap();
        let sheet = emptied.get_sheet_by_name("Register").unwrap();
        assert_eq!(numeric_stt(&cell(sheet, 1, 2)), Some(1));
        assert_eq!(cell(sheet, 3, 2), "");
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn translation_save_and_export_preserve_mark_of_the_web_but_local_creation_does_not_add_it() {
        let root = std::env::temp_dir().join(format!("b6h-zone-translation-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let source = root.join("source.xlsx");
        let mut book = xlsx::new_file_empty_worksheet();
        let sheet = book.new_sheet("Register").unwrap();
        for (index, header) in header_candidates("translation", &json!({}), "EN").iter().enumerate() { set_cell(sheet, index as u32 + 1, 1, header, false); }
        set_cell(sheet, 1, 2, "01", false); set_cell(sheet, 3, 2, "Imported", false);
        xlsx::writer::xlsx::write(&book, &source).unwrap();
        let zone = b"[ZoneTransfer]\r\nZoneId=3\r\n";
        fs::write(PathBuf::from(format!("{}:Zone.Identifier", source.display())), zone).unwrap();
        let state = State::default();
        let mut imported = import(&state, "translation", &source.to_string_lossy(), &json!({})).unwrap();
        assert!(imported["sheets"][0]["sourceZoneIdentifier"].is_string());
        imported["sheets"][0]["rows"][0]["person"] = json!("Edited");
        assert_eq!(save_translation(&state, &imported, &json!({}))["status"], "success");
        assert_eq!(zone_identifier(&source).unwrap().unwrap(), zone);
        let encoded = BASE64.encode(fs::read(&source).unwrap());
        let derived = root.join("derived.xlsx");
        export_translation(&derived.to_string_lossy(), &encoded, &imported["sheets"]).unwrap();
        assert_eq!(zone_identifier(&derived).unwrap().unwrap(), zone);
        let trusted = root.join("trusted.xlsx");
        create(&state, "translation", &trusted.to_string_lossy(), &json!([{"id":"new","name":"New","rows":[]}]), &json!({}), "EN").unwrap();
        assert!(zone_identifier(&trusted).unwrap().is_none());
        fs::remove_dir_all(root).unwrap();
    }
}
fn write_checked(book: &xlsx::structs::Spreadsheet, file: &Path, expected_hash: &str) -> Result<(), String> {
    let zone = zone_identifier(file)?;
    let temp = file.with_extension(format!("{}.tmp.xlsx", Uuid::new_v4()));
    if let Err(error) = xlsx::writer::xlsx::write(book, &temp) { let _ = fs::remove_file(&temp); return Err(error.to_string()); }
    #[cfg(windows)]
    if let Some(zone) = zone { if let Err(error) = fs::write(PathBuf::from(format!("{}:Zone.Identifier", temp.display())), zone) { let _ = fs::remove_file(&temp); return Err(format!("Could not preserve workbook security provenance: {error}")); } }
    let candidate_file = match OpenOptions::new().write(true).open(&temp) { Ok(file) => file, Err(error) => { let _ = fs::remove_file(&temp); return Err(format!("Could not reopen the temporary workbook for durable save: {error}")); } };
    if let Err(error) = candidate_file.sync_all() { drop(candidate_file); let _ = fs::remove_file(&temp); return Err(format!("Could not flush the temporary workbook: {error}")); }
    drop(candidate_file);
    let reopened = match load(&temp) { Ok(book) => book, Err(error) => { let _ = fs::remove_file(&temp); return Err(format!("The saved workbook failed validation: {error}")); } };
    let expected_sheets = book.get_sheet_collection().iter().map(|sheet| sheet.get_name()).collect::<Vec<_>>();
    let saved_sheets = reopened.get_sheet_collection().iter().map(|sheet| sheet.get_name()).collect::<Vec<_>>();
    if expected_sheets != saved_sheets { let _ = fs::remove_file(&temp); return Err("The saved workbook failed sheet integrity validation.".into()); }
    let _save_lock = match lock_register_save(file) { Ok(lock) => lock, Err(error) => { let _ = fs::remove_file(&temp); return Err(format!("Could not coordinate workbook save: {error}")); } };
    let candidate_hash = match workbook_hash(&temp) { Ok(hash) => hash, Err(error) => { let _ = fs::remove_file(&temp); return Err(error); } };
    let current_hash = match workbook_hash(file) { Ok(hash) => hash, Err(error) => { let _ = fs::remove_file(&temp); return Err(error); } };
    if current_hash != expected_hash {
        let _ = fs::remove_file(&temp);
        return Err("The workbook changed outside B6H. Refresh it before saving.".into());
    }
    if let Err(error) = replace_workbook(&temp, file) {
        if !workbook_hash(file).is_ok_and(|hash| hash == candidate_hash) {
            let _ = fs::remove_file(&temp);
            return Err(format!("Could not replace the workbook: {error}"));
        }
    }
    let _ = fs::remove_file(&temp);
    let committed = load(file).map_err(|error| format!("The workbook was replaced but could not be reopened. {error}"))?;
    let committed_sheets = committed.get_sheet_collection().iter().map(|sheet| sheet.get_name()).collect::<Vec<_>>();
    if expected_sheets != committed_sheets || !workbook_hash(file).is_ok_and(|hash| hash == candidate_hash) {
        return Err("The workbook was replaced but failed post-commit verification.".into());
    }
    Ok(())
}
fn write_new(book: &xlsx::structs::Spreadsheet, file: &Path, zone: Option<&[u8]>) -> Result<(), String> {
    let temp = file.with_extension(format!("{}.tmp.xlsx", Uuid::new_v4()));
    xlsx::writer::xlsx::write(book, &temp).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    if let Some(zone) = zone { if let Err(error) = fs::write(PathBuf::from(format!("{}:Zone.Identifier", temp.display())), zone) { let _ = fs::remove_file(&temp); return Err(format!("Could not preserve workbook security provenance: {error}")); } }
    let result = fs::hard_link(&temp, file).map_err(|e| e.to_string());
    let _ = fs::remove_file(temp);
    result
}
pub fn export_translation(file: &str, encoded: &str, sheets: &Value) -> Result<String, String> {
    let path = valid_file(file)?;
    if path.exists() { return Err("A file already exists at that location.".into()); }
    let bytes = BASE64.decode(encoded).map_err(|_| "Invalid workbook export data.".to_string())?;
    if bytes.len() > 100_000_000 { return Err("The workbook export exceeds the supported size.".into()); }
    let zone = sheets.as_array().into_iter().flatten().find_map(|sheet| sheet.get("sourceZoneIdentifier").and_then(Value::as_str)).map(|value| BASE64.decode(value).map_err(|_| "Invalid source workbook security provenance.".to_string())).transpose()?;
    let temp = path.with_extension(format!("{}.tmp.xlsx", Uuid::new_v4()));
    let result = (|| {
        let mut output = OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|e| e.to_string())?;
        output.write_all(&bytes).map_err(|e| e.to_string())?;
        drop(output);
        load(&temp)?;
        #[cfg(windows)]
        if let Some(zone) = zone { fs::write(PathBuf::from(format!("{}:Zone.Identifier", temp.display())), zone).map_err(|e| format!("Could not preserve workbook security provenance: {e}"))?; }
        fs::hard_link(&temp, &path).map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().into_owned())
    })();
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
    let zone = sheets.iter().find_map(|sheet| sheet.get("sourceZoneIdentifier").and_then(Value::as_str)).map(|value| BASE64.decode(value).map_err(|_| "Invalid source workbook security provenance.".to_string())).transpose()?;
    write_new(&book, &path, zone.as_deref())?;
    let source: Map<String, Value> = sheets
        .iter()
        .map(|s| (string(s, "id"), json!(string(s, "name"))))
        .collect();
    let revision = workbook_hash(&path)?;
    state.imported.lock().map_err(|e| e.to_string())?.insert(
        fs::canonicalize(&path).map_err(|e| e.to_string())?,
        (
            kind.into(),
            source
                .iter()
                .map(|(key, value)| (key.clone(), value.as_str().unwrap_or("").into()))
                .collect(),
            revision,
        ),
    );
    let row_locators: Map<String, Value> = if kind == "signature" || kind == "translation" { sheets.iter().flat_map(|sheet| sheet.get("rows").and_then(Value::as_array).into_iter().flatten().enumerate().map(|(index, row)| (string(row, "id"), json!(index + 2)))).collect() } else { Map::new() };
    Ok(json!({"file":file,"sourceMap":source,"rowLocators":row_locators}))
}
fn register_columns(sheet: &Worksheet, kind: &str, settings: &Value) -> Option<(u32, Vec<usize>, Vec<(String, Option<usize>)>)> {
    for (row, values) in indexed_rows(sheet) {
        let Some(columns) = matching_register(kind, &values, settings) else { continue };
        let custom_columns = custom(settings).into_iter().map(|(id, name)| (id, values.iter().position(|value| normalize(value) == normalize(&name)))).collect();
        return Some((row, columns, custom_columns));
    }
    None
}
fn signature_occupied(sheet: &Worksheet, row: u32, columns: &[usize], custom_columns: &[(String, Option<usize>)]) -> bool {
    columns.iter().skip(1).any(|column| has_business_value(sheet, *column, row))
        || custom_columns.iter().any(|(_, column)| column.is_some_and(|column| has_business_value(sheet, column, row)))
}
fn signature_slot_occupied(sheet: &Worksheet, row: u32, number_column: usize) -> bool {
    (0..sheet.get_highest_column().min(220) as usize).any(|column| column != number_column && has_business_value(sheet, column, row))
}
fn register_write_record(sheet: &mut Worksheet, kind: &str, row: u32, row_end: u32, record: &Value, columns: &[usize], custom_columns: &[(String, Option<usize>)]) {
    let keys: &[&str] = if kind == "translation" { &T_KEYS } else { &S_KEYS };
    if kind == "signature" { for target_row in row..=row_end { sheet.get_style_mut((columns[0] as u32 + 1, target_row)).get_font_mut().set_size(14.0); } }
    for (index, key) in keys.iter().enumerate().skip(1) {
        let col = columns[index] as u32 + 1;
        if *key == "date" {
            if sheet.get_cell((col, row)).is_none_or(|cell| cell.get_formula().is_empty()) { write_register_date(sheet, col, row, &string(record, key)); }
            continue;
        }
        let raw_value = string(record, key);
        let value = if kind == "translation" && *key == "languages" && cell(sheet, col, row) != raw_value { concise_translation_language_pair(&raw_value) } else if kind == "signature" && (*key == "certifier" || *key == "document") { raw_value.to_uppercase() } else { raw_value };
        if kind == "signature" { for target_row in row..=row_end { sheet.get_style_mut((col, target_row)).get_font_mut().set_size(14.0); } }
        if kind == "signature" && *key == "person" && row_end > row {
            let old = (row..=row_end).map(|r| cell(sheet, col, r)).filter(|v| !v.trim().is_empty()).collect::<Vec<_>>().join("\n\n");
            if old != value && (row..=row_end).all(|r| sheet.get_cell((col, r)).is_none_or(|cell| cell.get_formula().is_empty())) { set_cell(sheet, col, row, &value, false); for r in row + 1..=row_end { clear_business_cell(sheet, col, r); } }
        } else if sheet.get_cell((col, row)).is_none_or(|cell| cell.get_formula().is_empty()) && cell(sheet, col, row) != value { set_cell(sheet, col, row, &value, ["date", "copies", "fee"].contains(key)); }
    }
    for (id, column) in custom_columns {
        if let Some(column) = column {
            let value = string(record, &format!("custom:{id}"));
            if kind == "signature" { sheet.get_style_mut((*column as u32 + 1, row)).get_font_mut().set_size(14.0); }
            if sheet.get_cell((*column as u32 + 1, row)).is_none_or(|cell| cell.get_formula().is_empty()) && cell(sheet, *column as u32 + 1, row) != value { set_cell(sheet, *column as u32 + 1, row, &value, false); }
        }
    }
}
const DUPLICATE_STT_FORMAT_MARKER: &str = "N(\"B6H_DUPLICATE_STT\")=0";
fn apply_translation_excel_rules(sheet: &mut Worksheet, number_column: u32, header_row: u32, last_column: u32) {
    for cell in sheet.get_cell_collection_mut() {
        if !cell.get_formula().is_empty() { continue; }
        let raw = cell.get_cell_value().get_raw_value();
        match raw {
            xlsx::CellRawValue::String(value) | xlsx::CellRawValue::Lazy(value) => {
                let uppercase = value.to_uppercase();
                if uppercase != value.as_ref() { cell.set_value_string(uppercase); }
            }
            xlsx::CellRawValue::RichText(_) => {
                let mut rich = cell.get_cell_value().get_raw_value().get_rich_text().unwrap();
                for part in rich.get_rich_text_elements_mut() {
                    let uppercase = part.get_text().to_uppercase();
                    part.set_text(uppercase);
                }
                cell.set_rich_text(rich);
            }
            _ => {}
        }
    }

    let mut formatting = sheet.get_conditional_formatting_collection().to_vec();
    for item in &mut formatting {
        item.get_conditional_collection_mut().retain(|rule| {
            rule.get_formula().is_none_or(|formula| formula.get_address_str() != DUPLICATE_STT_FORMAT_MARKER)
        });
    }
    formatting.retain(|item| !item.get_conditional_collection().is_empty());
    sheet.set_conditional_formatting_collection(formatting);

    let duplicate_rows = indexed_rows(sheet).iter()
        .skip_while(|(row, _)| *row <= header_row)
        .filter(|(row, _)| merged_span(sheet, number_column, *row).is_none_or(|(_, start, _, _)| start == *row))
        .filter_map(|(row, values)| numeric_stt(values.get((number_column - 1) as usize).map(String::as_str).unwrap_or("")).map(|number| (number, *row)))
        .fold(HashMap::<u32, Vec<u32>>::new(), |mut groups, (number, row)| { groups.entry(number).or_default().push(row); groups });
    let mut ranges = Vec::new();
    for rows in duplicate_rows.values().filter(|rows| rows.len() > 1) {
        for row in rows {
            let row_end = merged_span(sheet, number_column, *row).map(|(_, _, _, end)| end).unwrap_or(*row);
            ranges.push(format!("{}{}:{}{}", xlsx::helper::coordinate::string_from_column_index(&1), row, xlsx::helper::coordinate::string_from_column_index(&last_column), row_end));
        }
    }
    if ranges.is_empty() { return; }

    let mut conditional = xlsx::ConditionalFormatting::default();
    conditional.get_sequence_of_references_mut().set_sqref(ranges.join(" "));
    let mut style = xlsx::Style::default();
    style.set_background_color_solid(xlsx::Color::COLOR_YELLOW);
    let mut formula = xlsx::Formula::default();
    formula.set_string_value(DUPLICATE_STT_FORMAT_MARKER);
    let mut rule = xlsx::ConditionalFormattingRule::default();
    rule.set_type(xlsx::ConditionalFormatValues::Expression).set_formula(formula).set_style(style);
    conditional.add_conditional_collection(rule);
    sheet.add_conditional_formatting_collection(conditional);
}
fn apply_translation_rules_to_sheets(book: &mut xlsx::structs::Spreadsheet, sheets: &[Value], settings: &Value) {
    for register in sheets {
        let name = string(register, "name");
        let Some((header_row, columns, custom_columns)) = book.get_sheet_by_name(&name).and_then(|sheet| register_columns(sheet, "translation", settings)) else { continue };
        let last_column = columns.iter().chain(custom_columns.iter().filter_map(|(_, column)| column.as_ref())).map(|column| *column as u32 + 1).max().unwrap_or(1);
        if let Some(sheet) = book.get_sheet_by_name_mut(&name) {
            apply_translation_excel_rules(sheet, columns[0] as u32 + 1, header_row, last_column);
        }
    }
}
fn save_register_inner(state: &State, input: &Value, settings: &Value, kind: &str) -> Result<Value, (String, String)> {
    let file = string(input, "file");
    let path = fs::canonicalize(valid_file(&file).map_err(|e| ("invalid".into(), e))?).map_err(|e| ("stale".into(), format!("The imported workbook is no longer available: {e}")))?;
    let sheets = input.get("sheets").and_then(Value::as_array).ok_or_else(|| ("invalid".into(), "Invalid register sheets".into()))?;
    let source = input.get("sourceMap").and_then(Value::as_object).ok_or_else(|| ("invalid".into(), "Invalid source map".into()))?;
    let expected = state.imported.lock().map_err(|e| ("io".into(), e.to_string()))?.get(&path).cloned().ok_or_else(|| ("stale".into(), "Refresh the workbook before saving.".into()))?;
    let given: HashMap<String, String> = source.iter().filter_map(|(key, value)| Some((key.clone(), value.as_str()?.to_string()))).collect();
    if expected.0 != kind || expected.1 != given { return Err(("stale".into(), "Refresh the workbook before saving.".into())); }
    let _file_lock = lock_signature_workbook(&path).map_err(|e| ("io".into(), e))?;
    if workbook_hash(&path).map_err(|e| ("io".into(), e))? != expected.2 { return Err(("stale".into(), "The workbook changed outside B6H. Refresh it before saving.".into())); }
    let mut book = load(&path).map_err(|e| ("io".into(), e))?;
    let originals: HashSet<&str> = given.values().map(String::as_str).collect();
    let protected: HashSet<String> = book.get_sheet_collection().iter().filter(|sheet| !originals.contains(sheet.get_name())).map(|sheet| sheet.get_name().to_lowercase()).collect();
    if sheets.iter().any(|sheet| protected.contains(&string(sheet, "name").to_lowercase())) { return Err(("invalid".into(), "A sheet name conflicts with an unrelated sheet in the workbook.".into())); }
    let mut all_locators = Map::new();
    let mut all_locator_ends = Map::new();
    let mut allocation_maxes = Map::new();
    let mut new_sheets = Vec::new();
    let mut removed = Vec::new();
    for (id, name) in &given { if !sheets.iter().any(|sheet| string(sheet, "id") == *id) { removed.push(name.clone()); } }
    for sheet_value in sheets {
        let id = string(sheet_value, "id");
        let name = string(sheet_value, "name");
        let Some(old_name) = given.get(&id) else { new_sheets.push(sheet_value.clone()); continue };
        let sheet = book.get_sheet_by_name_mut(old_name).ok_or_else(|| ("stale".into(), "A register sheet changed. Refresh the workbook before saving.".into()))?;
        if old_name != &name { sheet.set_name(&name); }
        let (header_row, columns, custom_columns) = register_columns(sheet, kind, settings).ok_or_else(|| ("stale".into(), "The register layout changed. Refresh the workbook before saving.".into()))?;
        if kind == "signature" { for column in columns.iter().chain(custom_columns.iter().flat_map(|(_, column)| column.iter())) { sheet.get_style_mut((*column as u32 + 1, header_row)).get_font_mut().set_size(14.0); } }
        let records = sheet_value.get("rows").and_then(Value::as_array).ok_or_else(|| ("invalid".into(), "Invalid register rows".into()))?;
        if records.len() > 100_000 { return Err(("invalid".into(), "The workbook row capacity was exceeded.".into())); }
        if kind == "translation" && records.iter().any(|record| record.get("reconcileFromRow").is_some()) {
            let imported_rows: HashSet<u32> = parse_register(kind, sheet, settings)
                .and_then(|register| register.get("rows").and_then(Value::as_array).cloned())
                .unwrap_or_default().iter().filter_map(|record| record.get("workbookRow").and_then(Value::as_u64).map(|row| row as u32)).collect();
            let submitted_rows: HashSet<u32> = records.iter().filter_map(|record| record.get("workbookRow").or_else(|| record.get("reconcileFromRow")).and_then(Value::as_u64).map(|row| row as u32)).collect();
            if records.len() != imported_rows.len() || submitted_rows != imported_rows {
                return Err(("invalid".into(), "Reconciliation requires the complete imported row set. Save or discard other Translation additions and deletions, then retry.".into()));
            }
        }
        let mut counts = indexed_rows(sheet).iter().skip_while(|(row, _)| *row <= header_row).filter(|(row, _)| merged_span(sheet, columns[0] as u32 + 1, *row).is_none_or(|(_, start, _, _)| start == *row)).filter_map(|(row, values)| numeric_stt(values.get(columns[0]).map(String::as_str).unwrap_or("")).map(|number| (number, *row))).fold(HashMap::<u32, Vec<u32>>::new(), |mut map, (number, row)| { map.entry(number).or_default().push(row); map });
        let original_numbers: HashSet<u32> = counts.keys().copied().collect();
        let mut row_locations: HashMap<String, (u32, u32)> = records.iter().filter_map(|record| {
            let row = record.get("workbookRow")?.as_u64()? as u32;
            let row_end = record.get("workbookRowEnd").and_then(Value::as_u64).map(|end| end as u32).unwrap_or(row);
            Some((string(record, "id"), (row, row_end)))
        }).collect();
        let mut reconciled_sources: Vec<(String, u32)> = Vec::new();
        let requested_rows: HashSet<u32> = row_locations.values().map(|(row, _)| *row).collect();
        let pending_removed_numbers: HashSet<u32> = counts.iter().filter_map(|(number, rows)| {
            (rows.iter().all(|row| !requested_rows.contains(row)) && rows.iter().any(|row| signature_occupied(sheet, *row, &columns, &custom_columns))).then_some(*number)
        }).collect();
        let mut targets = Vec::new();
        let mut reserved_numbers = HashMap::<u32, u32>::new();
        let mut used_rows = HashSet::new();
        if kind == "translation" {
            let reconciled_rows: HashSet<u32> = records.iter().filter_map(|record| record.get("reconcileFromRow").and_then(Value::as_u64).map(|row| row as u32)).collect();
            for (row, values) in indexed_rows(sheet).iter().skip_while(|(row, _)| *row <= header_row) {
                if merged_span(sheet, columns[0] as u32 + 1, *row).is_some_and(|(_, start, _, _)| start != *row) { continue; }
                let number = values.get(columns[0]).map(String::as_str).unwrap_or("");
                if number.trim().is_empty() && signature_occupied(sheet, *row, &columns, &custom_columns) && !reconciled_rows.contains(row) {
                    return Err(("missing_stt".into(), format!("{}|{}|{}", id, name, row)));
                }
            }
        }
        for (record_index, record) in records.iter().enumerate() {
            let reconcile_row = record.get("reconcileFromRow").and_then(Value::as_u64).map(|row| row as u32);
            if let Some(source_row) = reconcile_row {
                let source_number = cell(sheet, columns[0] as u32 + 1, source_row);
                let source_span = merged_span(sheet, columns[0] as u32 + 1, source_row);
                let source_is_anchor = source_span.is_none_or(|(_, start, _, _)| start == source_row);
                let source_fields_match = T_KEYS.iter().enumerate().skip(1).all(|(index, key)| {
                    let actual = cell(sheet, columns[index] as u32 + 1, source_row);
                    let expected = string(record, key);
                    if *key == "date" { date_text(&actual) == expected } else { actual == expected }
                }) && custom_columns.iter().all(|(field_id, column)| column.is_none_or(|column| cell(sheet, column as u32 + 1, source_row) == string(record, &format!("custom:{field_id}"))));
                if kind != "translation" || record.get("workbookRow").is_some() || source_row <= header_row || !source_is_anchor || !source_number.trim().is_empty() || !signature_occupied(sheet, source_row, &columns, &custom_columns) || !source_fields_match {
                    return Err(("stale".into(), format!("The Translation row {source_row} changed. Refresh the workbook before reconciling.")));
                }
                reconciled_sources.push((string(record, "id"), source_row));
            }
            let number = numeric_stt(&string(record, "number")).ok_or_else(|| {
                if let Some((row, _)) = row_locations.get(&string(record, "id")) {
                    if kind == "translation" {
                        ("missing_stt".into(), format!("{}|{}|{}", id, name, row))
                    } else {
                        ("stale".into(), format!("A Signature row at Excel row {row} has business data but no STT. Refresh and resolve its ownership before saving."))
                    }
                } else {
                    ("invalid".into(), "Enter a supported positive whole-number STT.".into())
                }
            })?;
            if let Some((row, row_end)) = row_locations.get(&string(record, "id")).copied() {
                if numeric_stt(&cell(sheet, columns[0] as u32 + 1, row)) != Some(number) { return Err(("stale".into(), "A register row changed. Refresh the workbook before saving.".into())); }
                if row_end < row || merged_span(sheet, columns[0] as u32 + 1, row).map(|(_, _, _, end)| end).unwrap_or(row) != row_end { return Err(("stale".into(), "A register row changed. Refresh the workbook before saving.".into())); }
                if (row..=row_end).any(|target| !used_rows.insert(target)) { return Err(("stale".into(), "A register row is assigned more than once. Refresh the workbook before saving.".into())); }
                targets.push((record, row, row_end, number));
            } else {
                let previous_duplicate = (record.get("duplicateConfirmed").and_then(Value::as_bool) == Some(true)).then(|| records[..record_index].iter().rev().find_map(|previous| {
                    (numeric_stt(&string(previous, "number")) == Some(number)).then(|| row_locations.get(&string(previous, "id")).copied()).flatten()
                })).flatten();
                if let Some((_, previous_end)) = previous_duplicate {
                    let row = previous_end.saturating_add(1);
                    if row > 100_500 { return Err(("invalid".into(), "The workbook row capacity was exceeded.".into())); }
                    sheet.insert_new_row(&row, &1);
                    for (_, start, end, _) in targets.iter_mut() { if *start >= row { *start += 1; } if *end >= row { *end += 1; } }
                    used_rows = used_rows.iter().map(|existing_row| if *existing_row >= row { *existing_row + 1 } else { *existing_row }).collect();
                    for (start, end) in row_locations.values_mut() { if *start >= row { *start += 1; } if *end >= row { *end += 1; } }
                    for (_, source_row) in &mut reconciled_sources { if *source_row >= row { *source_row += 1; } }
                    for rows in counts.values_mut() { for existing_row in rows { if *existing_row >= row { *existing_row += 1; } } }
                    let last_col = sheet.get_highest_column().max(columns.iter().max().copied().unwrap_or(0) as u32 + 1);
                    sheet.copy_row_styling(&previous_end, &row, Some(&1), Some(&last_col));
                    write_signature_stt(sheet, columns[0] as u32 + 1, row, number);
                    row_locations.insert(string(record, "id"), (row, row));
                    counts.entry(number).or_default().push(row);
                    if !used_rows.insert(row) { return Err(("stale".into(), "A register row is assigned more than once. Refresh the workbook before saving.".into())); }
                    reserved_numbers.entry(number).or_insert(row);
                    targets.push((record, row, row, number));
                    continue;
                }
                let existing = counts.get(&number);
                let empty_slot = existing.filter(|rows| pending_removed_numbers.contains(&number) || rows.len() == 1 && !signature_slot_occupied(sheet, rows[0], columns[0])).and_then(|rows| rows.first().copied());
                let conflict_row = reserved_numbers.get(&number).copied().or_else(|| existing.and_then(|rows| rows.first().copied()));
                let duplicate = !pending_removed_numbers.contains(&number) && (reserved_numbers.contains_key(&number) || existing.is_some() && empty_slot.is_none());
                if duplicate && record.get("duplicateConfirmed").and_then(Value::as_bool) != Some(true) {
                    return Err(("duplicate".into(), format!("{id}|{number}|{}", conflict_row.unwrap_or(0))));
                }
                let row = if duplicate || empty_slot.is_none() {
                    let next_group_row = if duplicate { None } else { counts.iter().filter(|(existing_number, _)| **existing_number > number).flat_map(|(_, rows)| rows.iter().copied()).min() };
                    let indexed = indexed_rows(sheet);
                    let last_register_row = indexed.iter().skip_while(|(row, _)| *row <= header_row).filter(|(row, values)| numeric_stt(values.get(columns[0]).map(String::as_str).unwrap_or("")).is_some() || signature_occupied(sheet, *row, &columns, &custom_columns)).map(|(row, _)| *row).max().unwrap_or(header_row);
                    let row = next_group_row.unwrap_or_else(|| last_register_row.saturating_add(1));
                    if row > 100_500 { return Err(("invalid".into(), "The workbook row capacity was exceeded.".into())); }
                    let style_row = if next_group_row.is_some() { row + 1 } else if last_register_row > header_row { last_register_row } else { header_row + 1 };
                    let last_col = sheet.get_highest_column().max(columns.iter().max().copied().unwrap_or(0) as u32 + 1);
                    if next_group_row.is_some() {
                        sheet.insert_new_row(&row, &1);
                        for (_, start, end, _) in targets.iter_mut() { if *start >= row { *start += 1; } if *end >= row { *end += 1; } }
                        used_rows = used_rows.iter().map(|existing_row| if *existing_row >= row { *existing_row + 1 } else { *existing_row }).collect();
                        for (start, end) in row_locations.values_mut() { if *start >= row { *start += 1; } if *end >= row { *end += 1; } }
                        for (_, source_row) in &mut reconciled_sources { if *source_row >= row { *source_row += 1; } }
                        for rows in counts.values_mut() { for existing_row in rows { if *existing_row >= row { *existing_row += 1; } } }
                    }
                    sheet.copy_row_styling(&style_row, &row, Some(&1), Some(&last_col));
                    write_signature_stt(sheet, columns[0] as u32 + 1, row, number);
                    counts.entry(number).or_default().push(row);
                    row
                } else { empty_slot.unwrap() };
                if !used_rows.insert(row) { return Err(("stale".into(), "A register row is assigned more than once. Refresh the workbook before saving.".into())); }
                row_locations.insert(string(record, "id"), (row, row));
                reserved_numbers.entry(number).or_insert(row);
                targets.push((record, row, row, number));
            }
        }
        let mut remove_ranges = Vec::<(u32, u32)>::new();
        let mut clear_canonical = HashSet::<u32>::new();
        for number in &original_numbers {
            let Some(mut group_rows) = counts.get(number).cloned() else { continue };
            group_rows.sort_unstable();
            let Some(&canonical) = group_rows.first() else { continue };
            let live = targets.iter().filter(|(_, row, _, stt)| stt == number && group_rows.contains(row)).map(|(_, row, _, _)| *row).collect::<HashSet<_>>();
            let base_survives = live.contains(&canonical);
            if !base_survives {
                if let Some(promote_row) = live.iter().copied().filter(|row| *row != canonical).min() {
                    if let Some((_, row, row_end, _)) = targets.iter_mut().find(|(_, row, _, stt)| stt == number && *row == promote_row) {
                        *row = canonical;
                        *row_end = merged_span(sheet, columns[0] as u32 + 1, canonical).map(|(_, _, _, end)| end).unwrap_or(canonical);
                    }
                    let end = merged_span(sheet, columns[0] as u32 + 1, promote_row).map(|(_, _, _, end)| end).unwrap_or(promote_row);
                    remove_ranges.push((promote_row, end));
                } else {
                    clear_canonical.insert(canonical);
                }
            }
            for extra in group_rows.into_iter().skip(1) {
                if !live.contains(&extra) || (!base_survives && live.iter().filter(|row| **row != canonical).min() == Some(&extra)) {
                    let end = merged_span(sheet, columns[0] as u32 + 1, extra).map(|(_, _, _, end)| end).unwrap_or(extra);
                    for row in extra..=end {
                        if (0..sheet.get_highest_column().min(220) as usize).any(|column| !columns.contains(&column) && !custom_columns.iter().any(|(_, allowed)| *allowed == Some(column)) && has_cell_content(sheet, column, row)) {
                            return Err(("stale".into(), "An extra STT row contains data outside the Signature register. Refresh and resolve the row before deleting it.".into()));
                        }
                    }
                    remove_ranges.push((extra, end));
                }
            }
        }
        remove_ranges.sort_unstable_by_key(|(start, _)| std::cmp::Reverse(*start));
        remove_ranges.dedup();
        for (start, end) in &remove_ranges { sheet.remove_row(start, &(end - start + 1)); }
        let adjust_row = |row: u32| row - remove_ranges.iter().filter(|(_, end)| *end < row).map(|(start, end)| end - start + 1).sum::<u32>();
        for row in clear_canonical {
            let row = adjust_row(row);
            let end = merged_span(sheet, columns[0] as u32 + 1, row).map(|(_, _, _, end)| end).unwrap_or(row);
            for target_row in row..=end {
                for column in columns.iter().skip(1) { clear_business_cell(sheet, *column as u32 + 1, target_row); }
                for (_, column) in &custom_columns { if let Some(column) = column { clear_business_cell(sheet, *column as u32 + 1, target_row); } }
            }
        }
        for (record, row, row_end, number) in targets {
            let row = adjust_row(row);
            let row_end = adjust_row(row_end);
            normalize_signature_stt(sheet, columns[0] as u32 + 1, row, number);
            register_write_record(sheet, kind, row, row_end, record, &columns, &custom_columns);
            all_locators.insert(string(record, "id"), json!(row));
            all_locator_ends.insert(string(record, "id"), json!(row_end));
        }
        for (record_id, source_row) in reconciled_sources {
            let source_row = adjust_row(source_row);
            if !all_locators.contains_key(&record_id) { return Err(("stale".into(), "The reconciled Translation record was not written. Refresh the workbook before saving.".into())); }
            for column in columns.iter().skip(1) { clear_business_cell(sheet, *column as u32 + 1, source_row); }
            for (_, column) in &custom_columns { if let Some(column) = column { clear_business_cell(sheet, *column as u32 + 1, source_row); } }
        }
        let allocation_max = indexed_rows(sheet).iter().skip_while(|(row, _)| *row <= header_row).filter_map(|(_, values)| numeric_stt(values.get(columns[0]).map(String::as_str).unwrap_or(""))).max().unwrap_or(0);
        allocation_maxes.insert(id, json!(allocation_max));
    }
    for name in removed { let _ = book.remove_sheet_by_name(&name); }
    if !new_sheets.is_empty() { append_register(&mut book, kind, &new_sheets, settings, "VI").map_err(|e| ("invalid".into(), e))?; for register in &new_sheets { if let Some(records) = register.get("rows").and_then(Value::as_array) { for (index, record) in records.iter().enumerate() { all_locators.insert(string(record, "id"), json!(index + 2)); all_locator_ends.insert(string(record, "id"), json!(index + 2)); } } } }
    if kind == "translation" { apply_translation_rules_to_sheets(&mut book, sheets, settings); }
    write_checked(&book, &path, &expected.2).map_err(|e| if e.contains("changed outside") { ("stale".into(), e) } else { ("io".into(), e) })?;
    let revision = workbook_hash(&path).map_err(|e| ("io".into(), e))?;
    let updated_source: HashMap<String, String> = sheets.iter().map(|sheet| (string(sheet, "id"), string(sheet, "name"))).collect();
    state.imported.lock().map_err(|e| ("io".into(), e.to_string()))?.insert(path, (kind.into(), updated_source, revision));
    Ok(json!({"status":"success","rowLocators":all_locators,"rowLocatorEnds":all_locator_ends,"allocationMaxes":allocation_maxes}))
}
pub fn save_signature(state: &State, input: &Value, settings: &Value) -> Value {
    save_register(state, input, settings, "signature")
}
pub fn save_translation(state: &State, input: &Value, settings: &Value) -> Value {
    save_register(state, input, settings, "translation")
}
fn save_register(state: &State, input: &Value, settings: &Value, kind: &str) -> Value {
    match save_register_inner(state, input, settings, kind) {
        Ok(result) => result,
        Err((status, message)) if status == "duplicate" => {
            let mut fields = message.split('|');
            let sheet_id = fields.next().unwrap_or_default();
            let number = fields.next().unwrap_or("0");
            let row = fields.next().unwrap_or("0");
            json!({"status":"duplicate","sheetId":sheet_id,"number":number.parse::<u32>().unwrap_or(0),"row":row.parse::<u32>().unwrap_or(0)})
        }
        Err((status, message)) if status == "missing_stt" => {
            let mut fields = message.splitn(3, '|');
            json!({"status":"missing_stt","sheetId":fields.next().unwrap_or_default(),"sheetName":fields.next().unwrap_or_default(),"row":fields.next().and_then(|row| row.parse::<u32>().ok()),"message":"This Translation row contains business data but has no STT. Verify its ownership before reconciling."})
        }
        Err((status, message)) => {
            let error_code = if status == "io" { save_error_code(&message) } else if status == "stale" { "signatureWorkbookStale" } else { "signatureSttInvalid" };
            json!({"status":status,"message":message,"errorCode":error_code})
        }
    }
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
    let _file_lock = lock_signature_workbook(&path)?;
    if workbook_hash(&path)? != expected.2 { return Err("The workbook changed outside B6H. Refresh it before saving.".into()); }
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
    if kind == "translation" { apply_translation_rules_to_sheets(&mut book, sheets, settings); }
    write_checked(&book, &path, &expected.2)?;
    let revision = workbook_hash(&path)?;
    state.imported.lock().map_err(|e| e.to_string())?.insert(
        path,
        (
            kind.into(),
            sheets
                .iter()
                .map(|s| (string(s, "id"), string(s, "name")))
                .collect(),
            revision,
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


