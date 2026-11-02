use num_bigint::BigUint;
use num_traits::One;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    label: String,
    count: usize,
    min: String,
    max: String,
    expected: String,
    missing_count: String,
    missing: Vec<String>,
    truncated: bool,
}
#[derive(Serialize)]
pub struct Scan {
    root: String,
    groups: Vec<Group>,
}
pub fn scan(folder: &str) -> Result<Scan, String> {
    let path = Path::new(folder);
    if !path.is_absolute() {
        return Err("Choose a valid folder.".into());
    }
    let root = fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("The selected path is not a folder.".into());
    }
    let mut groups: HashMap<String, Vec<(BigUint, String, usize)>> = HashMap::new();
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        if name.eq_ignore_ascii_case("thong_ke.txt") {
            continue;
        }
        let stem = Path::new(&name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        let parsed = if !stem.is_empty() && stem.bytes().all(|b| b.is_ascii_digit()) {
            Some(("Number only".to_string(), stem))
        } else if let Some(pos) = stem.rfind('_') {
            let raw = &stem[pos + 1..];
            if !raw.is_empty() && raw.bytes().all(|b| b.is_ascii_digit()) {
                Some((stem[..pos + 1].to_string(), raw))
            } else {
                None
            }
        } else {
            None
        };
        let parsed = parsed
            .or_else(|| {
                let pos = stem.find(|c: char| !c.is_ascii_digit())?;
                if pos > 0
                    && ['-', '_'].contains(&stem[pos..].chars().next()?)
                    && pos + 1 < stem.len()
                {
                    Some((
                        format!("Starts with number · {}", &stem[pos + 1..]),
                        &stem[..pos],
                    ))
                } else {
                    None
                }
            })
            .or_else(|| {
                let pos = stem
                    .rfind(|c: char| !c.is_ascii_digit())
                    .map(|i| i + 1)
                    .unwrap_or(0);
                if pos < stem.len() && stem[pos..].bytes().all(|b| b.is_ascii_digit()) {
                    Some((
                        if pos == 0 {
                            "Other numbered files".into()
                        } else {
                            stem[..pos].into()
                        },
                        &stem[pos..],
                    ))
                } else {
                    None
                }
            });
        let Some((label, raw)) = parsed else { continue };
        let Some(number) = BigUint::parse_bytes(raw.as_bytes(), 10) else {
            continue;
        };
        groups
            .entry(label)
            .or_default()
            .push((number, name.clone(), raw.len()));
    }
    let mut result: Vec<Group> = groups
        .into_iter()
        .map(|(label, mut files)| {
            files.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
            let min = files[0].0.clone();
            let max = files.last().unwrap().0.clone();
            let expected = &max - &min + BigUint::one();
            let present: HashSet<BigUint> = files.iter().map(|f| f.0.clone()).collect();
            let missing_count = &expected - BigUint::from(present.len());
            let width = files.iter().map(|f| f.2).max().unwrap();
            let mut missing = Vec::new();
            let mut n = min.clone();
            while n <= max && missing.len() < 10000 {
                if !present.contains(&n) {
                    missing.push(format!("{:0>width$}", n, width = width))
                }
                n += BigUint::one();
            }
            Group {
                label,
                count: files.len(),
                min: min.to_string(),
                max: max.to_string(),
                expected: expected.to_string(),
                missing_count: missing_count.to_string(),
                truncated: BigUint::from(missing.len()) < missing_count,
                missing,
            }
        })
        .collect();
    result.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(Scan {
        root: root.to_string_lossy().into_owned(),
        groups: result,
    })
}
pub fn report(folder: &str, language: &str) -> Result<String, String> {
    let data = scan(folder)?;
    let vi = language == "VI";
    let label = |en: &str, vn: &str| if vi { vn.to_string() } else { en.to_string() };
    let mut lines = vec![
        label("FILE NUMBER CHECK", "BÁO CÁO KIỂM TRA SỐ"),
        format!("{}: {}", label("Folder", "Thư mục"), data.root),
        String::new(),
    ];
    let mut total = 0;
    let mut missing_total = BigUint::default();
    for g in &data.groups {
        total += g.count;
        missing_total += BigUint::parse_bytes(g.missing_count.as_bytes(), 10).unwrap();
        lines.extend([
            "=".repeat(60),
            format!("{}: {}", label("Group", "Nhóm"), g.label),
            format!("{}: {}", label("Files", "Số tệp"), g.count),
            format!("{}: {}", label("Minimum", "Số nhỏ nhất"), g.min),
            format!("{}: {}", label("Maximum", "Số lớn nhất"), g.max),
            format!("{}: {}", label("Expected", "Số lượng dự kiến"), g.expected),
            format!("{}: {}", label("Missing", "Số còn thiếu"), g.missing_count),
            String::new(),
            label("Missing numbers:", "Các số còn thiếu:"),
        ]);
        if g.missing.is_empty() {
            lines.push(label("None", "Không có"))
        } else {
            lines.extend(g.missing.clone())
        }
        if g.truncated {
            lines.push(label(
                "(List truncated after 10000 values.)",
                "(Danh sách đã giới hạn ở 10.000 số đầu tiên.)",
            ))
        }
        lines.push(String::new())
    }
    lines.extend([
        "=".repeat(60),
        format!("{}: {}", label("Groups", "Số nhóm"), data.groups.len()),
        format!("{}: {}", label("Files", "Tổng số tệp"), total),
        format!(
            "{}: {}",
            label("Missing numbers", "Tổng số còn thiếu"),
            missing_total
        ),
    ]);
    let path = Path::new(&data.root).join("thong_ke.txt");
    fs::write(&path, lines.join("\r\n")).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reports_missing_numbers_in_both_languages() {
        let root = std::env::temp_dir().join(format!("b6h-count-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("A_001.pdf"), b"a").unwrap();
        fs::write(root.join("A_003.PDF"), b"c").unwrap();
        let found = scan(&root.to_string_lossy()).unwrap();
        let groups = serde_json::to_value(&found).unwrap();
        assert_eq!(groups["groups"][0]["missing"], serde_json::json!(["002"]));
        let path = report(&root.to_string_lossy(), "EN").unwrap();
        assert!(
            fs::read_to_string(&path)
                .unwrap()
                .contains("Missing numbers:\r\n002")
        );
        report(&root.to_string_lossy(), "VI").unwrap();
        assert!(
            fs::read_to_string(&path)
                .unwrap()
                .contains("Các số còn thiếu:\r\n002")
        );
        fs::remove_dir_all(root).unwrap();
    }
}
