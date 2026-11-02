use futures_util::StreamExt;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use uuid::Uuid;

static BUSY: AtomicBool = AtomicBool::new(false);
const API: &str = "https://api.github.com/repos/huyhoang2001/convert_name_pdf/releases/latest";
fn version(value: &str) -> Result<[u64; 3], String> {
    let parts: Vec<_> = value
        .trim_start_matches('v')
        .split(['-', '+'])
        .next()
        .unwrap_or("")
        .split('.')
        .map(str::parse::<u64>)
        .collect();
    if parts.len() != 3 || parts.iter().any(Result::is_err) {
        return Err("Invalid version.".into());
    }
    Ok([
        *parts[0].as_ref().unwrap(),
        *parts[1].as_ref().unwrap(),
        *parts[2].as_ref().unwrap(),
    ])
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn compares_release_versions_and_rejects_invalid_executables() {
        assert!(version("v1.2.0").unwrap() > version("1.1.8").unwrap());
        assert!(version("v1.1.8").unwrap() == version("1.1.8").unwrap());
        assert!(version("1.2").is_err());
        let file = std::env::temp_dir().join(format!("b6h-update-{}.exe", Uuid::new_v4()));
        fs::write(&file, b"not executable").unwrap();
        assert!(!is_exe(&file));
        fs::write(&file, b"MZ test").unwrap();
        assert!(is_exe(&file));
        fs::remove_file(file).unwrap();
    }
}
fn target() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Err("Portable executable path is unavailable in development mode.".into());
    }
    std::env::current_exe().map_err(|e| e.to_string())
}
fn is_exe(path: &Path) -> bool {
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let mut magic = [0_u8; 2];
    file.read_exact(&mut magic).is_ok() && magic == [b'M', b'Z']
}
fn text(vi: bool, en: &str, vn: &str) -> String {
    if vi { vn.into() } else { en.into() }
}
fn confirm(app: &AppHandle, vi: bool, en: &str, vn: &str) -> bool {
    app.dialog()
        .message(text(vi, en, vn))
        .title("B6H")
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show()
}
fn message(app: &AppHandle, vi: bool, en: &str, vn: &str) {
    app.dialog()
        .message(text(vi, en, vn))
        .title("B6H")
        .blocking_show();
}
pub fn mark_started() -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Ok(());
    }
    let target = target()?;
    let pending = crate::storage::user_dir()?
        .join("updates")
        .join("pending.json");
    if !pending.exists() {
        return Ok(());
    }
    let data: Value = serde_json::from_slice(&fs::read(&pending).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if data["target"]
        .as_str()
        .is_some_and(|v| v.eq_ignore_ascii_case(&target.to_string_lossy()))
    {
        let _ = fs::remove_file(format!("{}.previous", target.display()));
        fs::remove_file(pending).map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn stage(app: &AppHandle, source: &Path, confirmed: bool) -> Result<(), String> {
    let target = target()?;
    if !is_exe(source) || source == target {
        return Err("Choose a different valid Windows executable.".into());
    }
    let vi = crate::storage::language()? == "VI";
    if !confirmed
        && !confirm(
            app,
            vi,
            "Install the selected portable update after B6H closes?",
            "Cài đặt bản cập nhật di động đã chọn sau khi B6H đóng?",
        )
    {
        return Ok(());
    }
    let dir = crate::storage::user_dir()?.join("updates");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if PathBuf::from(format!("{}.previous", target.display())).exists() {
        return Err("A previous version backup already exists.".into());
    }
    let staged = dir.join("B6H update.exe");
    let helper = dir.join("install-update.vbs");
    let pending = dir.join("pending.json");
    fs::copy(source, &staged).map_err(|e| e.to_string())?;
    fs::write(&helper, include_str!("../update-helper.vbs")).map_err(|e| e.to_string())?;
    fs::write(
        &pending,
        serde_json::to_vec(&json!({"target":target})).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::process::Command::new("wscript.exe")
        .args(["//B", "//NoLogo"])
        .arg(&helper)
        .arg(&target)
        .arg(&staged)
        .arg(std::process::id().to_string())
        .spawn()
        .map_err(|e| e.to_string())?;
    message(
        app,
        vi,
        "The update is staged. B6H will close and reopen.",
        "Bản cập nhật đã sẵn sàng. B6H sẽ đóng và mở lại.",
    );
    app.exit(0);
    Ok(())
}
pub fn install_file(app: &AppHandle, file: &str) -> Result<(), String> {
    let path = Path::new(file);
    if !path.is_absolute()
        || !path.is_file()
        || !path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("exe"))
    {
        return Err("Choose a valid Windows executable.".into());
    }
    stage(app, path, false)
}
pub async fn check(app: AppHandle) -> Result<bool, String> {
    if BUSY.swap(true, Ordering::AcqRel) {
        return Ok(false);
    }
    let result = check_inner(&app).await;
    BUSY.store(false, Ordering::Release);
    result
}
async fn check_inner(app: &AppHandle) -> Result<bool, String> {
    let vi = crate::storage::language()? == "VI";
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let release: Value = client
        .get(API)
        .header("User-Agent", "B6H")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let latest = release["tag_name"]
        .as_str()
        .ok_or("Invalid release version.")?;
    let current = env!("CARGO_PKG_VERSION");
    if version(latest)? <= version(current)? {
        let _=app.emit("update-status",json!({"kind":"latest","version":current,"checkedAt":chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true)}));
        return Ok(true);
    }
    let _ = app.emit("update-status", json!({"kind":"dismiss"}));
    let asset = release["assets"].as_array().and_then(|items| {
        items.iter().find(|item| {
            let name = item["name"].as_str().unwrap_or("");
            name.to_ascii_lowercase().ends_with(".exe")
                && (name.starts_with("B6H-") || name.starts_with("SAFE-PDF-RENAME-"))
        })
    });
    let Some(asset) = asset else {
        message(
            app,
            vi,
            "An update is available. Open the GitHub release page to download it.",
            "Đã có bản cập nhật. Mở trang phát hành GitHub để tải xuống.",
        );
        return Ok(false);
    };
    if cfg!(debug_assertions) {
        message(
            app,
            vi,
            "An update is available. Portable installation requires a packaged build.",
            "Đã có bản cập nhật. Cài đặt di động cần bản đóng gói.",
        );
        return Ok(false);
    }
    if !confirm(
        app,
        vi,
        "A new B6H release is available. Download and install it now?",
        "Đã có bản B6H mới. Tải và cài đặt ngay?",
    ) {
        return Ok(false);
    }
    let url = asset["browser_download_url"]
        .as_str()
        .ok_or("Invalid update URL.")?;
    if !url.starts_with("https://github.com/huyhoang2001/convert_name_pdf/releases/download/") {
        return Err("Invalid update URL.".into());
    }
    let expected = asset["size"].as_u64().ok_or("Invalid update size.")?;
    if expected < 2 || expected > 500 * 1024 * 1024 {
        return Err("Invalid update size.".into());
    }
    let digest = asset["digest"]
        .as_str()
        .and_then(|v| v.strip_prefix("sha256:"))
        .ok_or(
            "Release has no SHA-256 digest; install it manually after verifying the file."
                .to_string(),
        )?;
    let directory = crate::storage::user_dir()?.join("updates");
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let downloaded = directory.join(format!("B6H downloaded update {}.exe", Uuid::new_v4()));
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&downloaded)
        .map_err(|e| e.to_string())?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    let mut hash = Sha256::new();
    let mut size = 0_u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        size += chunk.len() as u64;
        if size > expected {
            return Err("Update download size mismatch.".into());
        }
        hash.update(&chunk);
        output.write_all(&chunk).map_err(|e| e.to_string())?
    }
    drop(output);
    if size != expected
        || hex::encode(hash.finalize()) != digest.to_ascii_lowercase()
        || !is_exe(&downloaded)
    {
        let _ = fs::remove_file(&downloaded);
        return Err("The downloaded update did not pass verification.".into());
    }
    stage(app, &downloaded, true)?;
    Ok(false)
}
