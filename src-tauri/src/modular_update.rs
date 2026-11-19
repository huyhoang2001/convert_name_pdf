use base64::{Engine, engine::general_purpose::STANDARD};
use ring::signature::{ED25519, UnparsedPublicKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Component, Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::{AppHandle, Emitter, Manager};
use zip::ZipArchive;

const PRODUCT: &str = "com.safe-pdf-rename.desktop";
#[cfg(feature = "update-test-keys")]
const CORE_VERSION: &str = match option_env!("B6H_TEST_CORE_VERSION") {
    Some(version) => version,
    None => env!("CARGO_PKG_VERSION"),
};
#[cfg(not(feature = "update-test-keys"))]
const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");
const MAX_ARCHIVE: u64 = 256 * 1024 * 1024;
const MAX_EXPANDED: u64 = 512 * 1024 * 1024;
const MAX_FILES: usize = 10_000;
const MAX_MANIFEST: usize = 1024 * 1024;
#[cfg(any(debug_assertions, feature = "update-test-keys"))]
const TEST_KEY_ID: &str = "local-test-only";
#[cfg(any(debug_assertions, feature = "update-test-keys"))]
const TEST_PUBLIC_KEY: &[u8; 32] = &[
    0xae, 0x0e, 0x54, 0xc0, 0x09, 0xc0, 0x7d, 0x5c, 0x26, 0x15, 0x0d, 0x1f, 0x4c, 0x91, 0x0a, 0x5c,
    0xb5, 0x0c, 0x9b, 0xcb, 0x71, 0x4f, 0x40, 0xb3, 0x08, 0xae, 0xc0, 0x40, 0xba, 0x1a, 0xcc, 0xbf,
];

static UPDATE_LOCK: Mutex<()> = Mutex::new(());
static CANCEL_IMPORT: AtomicBool = AtomicBool::new(false);
static STARTUP_NOTICE: Mutex<Option<UpdateNotice>> = Mutex::new(None);

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema_version: u8,
    product_id: String,
    platform: String,
    arch: String,
    channel: String,
    release_id: String,
    sequence: u64,
    component: String,
    version: String,
    requires: Requirements,
    key_id: String,
    payload_bytes: u64,
    files: Vec<ManifestFile>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct Requirements {
    pub core: String,
    pub ipc_contract: u32,
    pub wordcraft_bridge: u32,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ManifestFile {
    path: String,
    bytes: u64,
    sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageInfo {
    pub component: String,
    pub version: String,
    pub release_id: String,
    pub files: usize,
    pub bytes: u64,
    pub staged_at: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSelection {
    frontend: Option<String>,
    wordcraft: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActivationJournal {
    phase: String,
    action: String,
    previous: RuntimeSelection,
    candidate: RuntimeSelection,
    process_id: u32,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SequenceState {
    components: BTreeMap<String, ComponentSequence>,
    releases: BTreeMap<String, String>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ComponentSequence {
    highest_sequence: u64,
    highest_version: String,
}

#[derive(Debug, Serialize)]
pub struct RuntimeAsset {
    pub bytes: Vec<u8>,
    pub mime_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub core_version: String,
    pub active_frontend: Option<String>,
    pub active_wordcraft: Option<String>,
    pub can_rollback: bool,
    pub can_rollback_core: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNotice {
    pub component: String,
    pub version: Option<String>,
    pub success: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogPackage {
    pub component: String,
    pub version: String,
    pub release_id: String,
    pub sequence: u64,
    pub url: String,
    pub archive_bytes: u64,
    pub sha256: String,
    pub requires: Requirements,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Catalog {
    schema_version: u8,
    product_id: String,
    platform: String,
    arch: String,
    channel: String,
    sequence: u64,
    key_id: String,
    packages: Vec<CatalogPackage>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateHistoryEntry {
    pub at: String,
    pub action: String,
    pub component: String,
    pub version: String,
    pub release_id: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogSequence {
    highest: u64,
    sha256: String,
}

fn validate_catalog(bytes: &[u8], signature: &[u8]) -> Result<Vec<CatalogPackage>, String> {
    let catalog: Catalog =
        serde_json::from_slice(bytes).map_err(|_| "The update catalog is invalid.")?;
    let key = key_for(&catalog.key_id)?;
    UnparsedPublicKey::new(&ED25519, &key)
        .verify(bytes, signature)
        .map_err(|_| "Update catalog signature verification failed.")?;
    if catalog.schema_version != 1
        || catalog.product_id != PRODUCT
        || catalog.platform != "windows"
        || catalog.arch != "x86_64"
        || catalog.channel != "stable"
        || catalog.sequence == 0
        || catalog.packages.len() > 32
    {
        return Err("The update catalog is incompatible with this installation.".into());
    }
    for package in &catalog.packages {
        let url =
            reqwest::Url::parse(&package.url).map_err(|_| "Catalog package URL is invalid.")?;
        if !approved_url(&url)
            || !matches!(
                package.component.as_str(),
                "frontend" | "wordcraft" | "core"
            )
            || version_cmp(&package.version, "0.0.0").is_none()
            || package.release_id.is_empty()
            || package.release_id.len() > 100
            || package
                .release_id
                .chars()
                .any(|c| !(c.is_ascii_alphanumeric() || "-._".contains(c)))
            || package.archive_bytes == 0
            || package.archive_bytes > MAX_ARCHIVE
            || package.sha256.len() != 64
            || !package.sha256.bytes().all(|b| b.is_ascii_hexdigit())
            || package.sequence == 0
            || !core_satisfies(CORE_VERSION, &package.requires.core)
            || package.requires.ipc_contract != 1
            || package.requires.wordcraft_bridge != 1
        {
            return Err("The update catalog contains an incompatible package.".into());
        }
    }
    Ok(catalog.packages)
}

fn core_satisfies(current: &str, minimum: &str) -> bool {
    version_cmp(current, minimum).is_some_and(|order| order != std::cmp::Ordering::Less)
}

fn approved_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && (matches!(
            url.host_str(),
            Some(
                "api.github.com"
                    | "github.com"
                    | "release-assets.githubusercontent.com"
                    | "objects.githubusercontent.com"
            )
        ) || (cfg!(feature = "update-test-keys")
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))))
}

fn update_client(timeout: std::time::Duration) -> Result<reqwest::Client, String> {
    #[allow(unused_mut)]
    let mut builder = reqwest::Client::builder()
        .user_agent(concat!("B6H/", env!("CARGO_PKG_VERSION")))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if approved_url(attempt.url()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .timeout(timeout);
    #[cfg(feature = "update-test-keys")]
    if let Some(path) = std::env::var_os("B6H_UPDATE_TEST_CA") {
        let pem = fs::read(path).map_err(|e| format!("Local test CA unavailable: {e}"))?;
        let certificate =
            reqwest::Certificate::from_pem(&pem).map_err(|_| "Local test CA is invalid.")?;
        builder = builder.add_root_certificate(certificate);
    }
    builder.build().map_err(|e| e.to_string())
}

async fn github_release() -> Result<(GitHubRelease, reqwest::Client), String> {
    let client = update_client(std::time::Duration::from_secs(45))?;
    #[cfg(feature = "update-test-keys")]
    let api = std::env::var("B6H_UPDATE_TEST_ENDPOINT").unwrap_or_else(|_| {
        "https://api.github.com/repos/huyhoang2001/convert_name_pdf/releases/latest".into()
    });
    #[cfg(not(feature = "update-test-keys"))]
    let api = "https://api.github.com/repos/huyhoang2001/convert_name_pdf/releases/latest";
    let release = client
        .get(api)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json::<GitHubRelease>()
        .await
        .map_err(|_| "GitHub release metadata is invalid.")?;
    Ok((release, client))
}

pub async fn discover_online_updates() -> Result<Vec<CatalogPackage>, String> {
    let (release, client) = github_release().await?;
    let asset = |name: &str| {
        release
            .assets
            .iter()
            .find(|a| a.name == name)
            .map(|a| a.browser_download_url.as_str())
            .ok_or("Signed update catalog is not attached to this release.")
    };
    let bytes = client
        .get(asset("catalog.json")?)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    if bytes.len() > MAX_MANIFEST {
        return Err("Update catalog exceeds the size limit.".into());
    }
    let sig = client
        .get(asset("catalog.sig")?)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    let signature_text = std::str::from_utf8(&sig)
        .map_err(|_| "Update catalog signature is invalid.")?
        .trim();
    let signature = STANDARD
        .decode(signature_text)
        .map_err(|_| "Update catalog signature is invalid.")?;
    let packages = validate_catalog(&bytes, &signature)?;
    let catalog: Catalog =
        serde_json::from_slice(&bytes).map_err(|_| "The update catalog is invalid.")?;
    let state_path = updates_dir()?.join("catalog-sequence.json");
    let digest = hex::encode(Sha256::digest(&bytes));
    let current = read_json::<CatalogSequence>(&state_path)?.unwrap_or(CatalogSequence {
        highest: 0,
        sha256: String::new(),
    });
    if catalog.sequence < current.highest
        || (catalog.sequence == current.highest
            && !current.sha256.is_empty()
            && digest != current.sha256)
    {
        return Err(
            "The signed update catalog is older than one already seen or reuses its sequence."
                .into(),
        );
    }
    if catalog.sequence > current.highest {
        write_json(
            &state_path,
            &CatalogSequence {
                highest: catalog.sequence,
                sha256: digest,
            },
        )?;
    }
    let active = runtime_status()?;
    Ok(packages.into_iter().filter(|package| is_newer_than_active(&package.component, &package.version, &active)).collect())
}

fn is_newer_than_active(component: &str, version: &str, active: &RuntimeStatus) -> bool {
    let current = match component {
        "core" => Some(active.core_version.as_str()),
        "frontend" => active.active_frontend.as_deref().or(Some(CORE_VERSION)),
        "wordcraft" => active.active_wordcraft.as_deref(),
        _ => return false,
    };
    current.is_none_or(|current| version_cmp(version, current) == Some(std::cmp::Ordering::Greater))
}

pub async fn download_online_update(
    app: AppHandle,
    component: String,
    release_id: String,
) -> Result<PackageInfo, String> {
    let package = discover_online_updates()
        .await?
        .into_iter()
        .find(|p| p.component == component && p.release_id == release_id)
        .ok_or("This package is not present in the verified update catalog.")?;
    let client = update_client(std::time::Duration::from_secs(300))?;
    let mut response = client
        .get(&package.url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    if !approved_url(response.url())
        || response
            .content_length()
            .is_some_and(|n| n != package.archive_bytes)
    {
        return Err("Downloaded update source or size does not match the signed catalog.".into());
    }
    let root = updates_dir()?;
    fs::create_dir_all(root.join("staging")).map_err(|e| e.to_string())?;
    let path = root
        .join("staging")
        .join(format!("{}.b6hupdate", uuid::Uuid::new_v4()));
    CANCEL_IMPORT.store(false, Ordering::Release);
    let result = async {
        let mut file = OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e| format!("Could not create the staged update download: {e}"))?;
        let mut hash = Sha256::new();
        let mut total = 0u64;
        let _ = app.emit("update-progress", serde_json::json!({"phase":"download","component":package.component,"bytesProcessed":0,"totalBytes":package.archive_bytes}));
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            if CANCEL_IMPORT.load(Ordering::Acquire) { return Err("Update download cancelled.".into()); }
            total = total.checked_add(chunk.len() as u64).ok_or("Download size overflow.")?;
            if total > package.archive_bytes || total > MAX_ARCHIVE { return Err("Update download exceeds its signed size limit.".into()); }
            hash.update(&chunk); file.write_all(&chunk).map_err(|e| e.to_string())?;
            let _ = app.emit("update-progress", serde_json::json!({"phase":"download","component":package.component,"bytesProcessed":total,"totalBytes":package.archive_bytes}));
        }
        file.sync_all().map_err(|e| e.to_string())?;
        if total != package.archive_bytes || hex::encode(hash.finalize()) != package.sha256 { return Err("Update download SHA-256 does not match the signed catalog.".into()); }
        drop(file);
        let downloaded = path.clone();
        tauri::async_runtime::spawn_blocking(move || import_package(app, &downloaded.to_string_lossy())).await.map_err(|e| e.to_string())?
    }.await;
    let _ = fs::remove_file(path);
    result
}

fn key_for(key_id: &str) -> Result<Vec<u8>, String> {
    #[cfg(any(debug_assertions, feature = "update-test-keys"))]
    if key_id == TEST_KEY_ID {
        return Ok(TEST_PUBLIC_KEY.to_vec());
    }
    let roots = option_env!("B6H_UPDATE_TRUST_ROOTS")
        .ok_or("This build has no production update trust roots configured.")?;
    let roots: serde_json::Value =
        serde_json::from_str(roots).map_err(|_| "Production update trust roots are invalid.")?;
    let encoded = roots
        .get(key_id)
        .and_then(serde_json::Value::as_str)
        .ok_or("This package signing key is not trusted.")?;
    let key = hex::decode(encoded).map_err(|_| "Production update trust root is invalid.")?;
    if key.len() != 32 {
        return Err("Production update trust root has an invalid length.".into());
    }
    Ok(key)
}

fn safe_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 240
        && !value.contains(['\\', ':', '\0'])
        && !value.chars().any(char::is_control)
        && Path::new(value)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
        && value.split('/').all(|part| {
            let base = part.split('.').next().unwrap_or("").to_ascii_lowercase();
            let reserved = matches!(
                base.as_str(),
                "con" | "prn" | "aux" | "nul" | "conin$" | "conout$" | "clock$"
            );
            let numbered = base
                .strip_prefix("com")
                .or_else(|| base.strip_prefix("lpt"))
                .is_some_and(|n| n.len() == 1 && matches!(n.as_bytes()[0], b'1'..=b'9'));
            !part.is_empty() && !part.ends_with(['.', ' ']) && !reserved && !numbered
        })
}

fn validate_manifest(manifest: &Manifest) -> Result<(), String> {
    if manifest.schema_version != 1
        || manifest.product_id != PRODUCT
        || manifest.platform != "windows"
        || manifest.arch != "x86_64"
        || !matches!(
            manifest.component.as_str(),
            "frontend" | "wordcraft" | "core"
        )
        || !core_satisfies(CORE_VERSION, &manifest.requires.core)
        || manifest.requires.ipc_contract != 1
        || manifest.requires.wordcraft_bridge != 1
        || manifest.release_id.is_empty()
        || manifest.release_id.len() > 100
        || manifest
            .release_id
            .chars()
            .any(|c| !(c.is_ascii_alphanumeric() || "-._".contains(c)))
        || version_cmp(&manifest.version, "0.0.0").is_none()
        || manifest.sequence == 0
        || manifest.files.is_empty()
        || manifest.files.len() > MAX_FILES
        || manifest.payload_bytes > MAX_EXPANDED
    {
        return Err("The package is incompatible with this B6H installation.".into());
    }
    let mut paths = HashSet::new();
    let mut total = 0u64;
    for file in &manifest.files {
        if !safe_path(&file.path)
            || matches!(
                file.path.to_ascii_lowercase().as_str(),
                "manifest.json" | "manifest.sig"
            )
            || !file
                .sha256
                .bytes()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
            || file.sha256.len() != 64
            || !paths.insert(file.path.to_ascii_lowercase())
        {
            return Err("The package contains an invalid or duplicate file entry.".into());
        }
        total = total
            .checked_add(file.bytes)
            .ok_or("The package is too large.")?;
        if total > MAX_EXPANDED {
            return Err("The package exceeds the expanded size limit.".into());
        }
    }
    if total != manifest.payload_bytes {
        return Err("The package size does not match its signed manifest.".into());
    }
    if manifest.component == "core"
        && (manifest.files.len() != 1
            || !manifest.files[0]
                .path
                .to_ascii_lowercase()
                .ends_with(".exe")
            || version_cmp(&manifest.version, CORE_VERSION) != Some(std::cmp::Ordering::Greater))
    {
        return Err("Core updates must contain one newer Windows installer.".into());
    }
    Ok(())
}

fn verify_core_setup(path: &Path, expected_version: &str) -> Result<(), String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut header = [0u8; 64];
    file.read_exact(&mut header)
        .map_err(|_| "Core installer is not a valid PE file.")?;
    if &header[..2] != b"MZ" {
        return Err("Core installer is not a Windows executable.".into());
    }
    let pe_offset = u32::from_le_bytes(header[0x3c..0x40].try_into().unwrap()) as u64;
    file.seek(SeekFrom::Start(pe_offset))
        .map_err(|e| e.to_string())?;
    let mut pe = [0u8; 6];
    file.read_exact(&mut pe)
        .map_err(|_| "Core installer PE header is invalid.")?;
    let machine = u16::from_le_bytes([pe[4], pe[5]]);
    // NSIS uses an x86 bootstrap stub for x64 packages; the signed manifest pins the payload architecture.
    if &pe[..4] != b"PE\0\0" || !matches!(machine, 0x014c | 0x8664) {
        return Err("Core package must contain a supported Windows installer.".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
        };
        let name: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let size = unsafe { GetFileVersionInfoSizeW(name.as_ptr(), std::ptr::null_mut()) };
        if size == 0 {
            return Err("Core installer version information is missing.".into());
        }
        let mut bytes = vec![0u8; size as usize];
        if unsafe { GetFileVersionInfoW(name.as_ptr(), 0, size, bytes.as_mut_ptr().cast()) } == 0 {
            return Err("Core installer version information could not be read.".into());
        }
        #[repr(C)]
        struct FixedVersion {
            signature: u32,
            structure: u32,
            file_ms: u32,
            file_ls: u32,
            product_ms: u32,
            product_ls: u32,
            flags_mask: u32,
            flags: u32,
            os: u32,
            file_type: u32,
            subtype: u32,
            date_ms: u32,
            date_ls: u32,
        }
        let root: [u16; 2] = [92, 0];
        let mut pointer = std::ptr::null_mut();
        let mut length = 0u32;
        if unsafe {
            VerQueryValueW(
                bytes.as_ptr().cast(),
                root.as_ptr(),
                &mut pointer,
                &mut length,
            )
        } == 0
            || length < std::mem::size_of::<FixedVersion>() as u32
        {
            return Err("Core installer fixed version is invalid.".into());
        }
        let version = unsafe { &*pointer.cast::<FixedVersion>() };
        let actual = format!(
            "{}.{}.{}",
            version.file_ms >> 16,
            version.file_ms & 0xffff,
            version.file_ls >> 16
        );
        if actual != expected_version {
            return Err("Core installer version does not match its signed manifest.".into());
        }
    }
    Ok(())
}

fn updates_dir() -> Result<PathBuf, String> {
    Ok(crate::storage::user_dir()?.join("updates"))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Update state path is invalid.")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name().and_then(|v| v.to_str()).unwrap_or("state"),
        uuid::Uuid::new_v4()
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        replace_state(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result?;
    Ok(())
}

#[cfg(windows)]
fn replace_state(from: &Path, to: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };
    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    let moved = unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        Err(std::io::Error::last_os_error().to_string())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_state(from: &Path, to: &Path) -> Result<(), String> {
    fs::rename(from, to).map_err(|e| e.to_string())
}

fn process_lock() -> Result<File, String> {
    let root = updates_dir()?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(root.join(".update.lock"))
        .map_err(|e| e.to_string())?;
    lock.lock()
        .map_err(|_| "Another B6H instance is managing updates.".to_string())?;
    Ok(lock)
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    atomic_write(path, &serde_json::to_vec(value).map_err(|e| e.to_string())?)
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<Option<T>, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|_| "Update state file is invalid.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn append_history(
    root: &Path,
    action: &str,
    component: &str,
    version: &str,
    release_id: &str,
) -> Result<(), String> {
    let path = root.join("history.json");
    let mut history = read_json::<Vec<UpdateHistoryEntry>>(&path)?.unwrap_or_default();
    history.push(UpdateHistoryEntry {
        at: chrono::Utc::now().to_rfc3339(),
        action: action.into(),
        component: component.into(),
        version: version.into(),
        release_id: release_id.into(),
    });
    if history.len() > 100 {
        history.drain(..history.len() - 100);
    }
    write_json(&path, &history)
}

fn signed_generation(generation: &Path) -> Result<Manifest, String> {
    let manifest_bytes = fs::read(generation.join("manifest.json")).map_err(|e| e.to_string())?;
    if manifest_bytes.len() > MAX_MANIFEST {
        return Err("Runtime manifest exceeds the size limit.".into());
    }
    let manifest: Manifest =
        serde_json::from_slice(&manifest_bytes).map_err(|_| "Runtime manifest is invalid.")?;
    let signature_text =
        fs::read_to_string(generation.join("manifest.sig")).map_err(|e| e.to_string())?;
    let signature = STANDARD
        .decode(signature_text.trim())
        .map_err(|_| "Runtime signature is invalid.")?;
    let public_key = key_for(&manifest.key_id)?;
    UnparsedPublicKey::new(&ED25519, &public_key)
        .verify(&manifest_bytes, &signature)
        .map_err(|_| "Runtime signature verification failed.")?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

fn checked_runtime_file(generation: &Path, entry: &ManifestFile) -> Result<Vec<u8>, String> {
    let root = fs::canonicalize(generation).map_err(|e| e.to_string())?;
    let path = generation.join(&entry.path);
    let mut checked = generation.to_path_buf();
    for part in Path::new(&entry.path).components() {
        checked.push(part.as_os_str());
        if fs::symlink_metadata(&checked)
            .map_err(|_| "Runtime file is missing.")?
            .file_type()
            .is_symlink()
        {
            return Err("Runtime contains a reparse point.".into());
        }
    }
    let metadata = fs::symlink_metadata(&path).map_err(|_| "Runtime file is missing.")?;
    if !metadata.is_file() || metadata.len() != entry.bytes {
        return Err("Runtime file type or size is invalid.".into());
    }
    let canonical = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    if !canonical.starts_with(&root) {
        return Err("Runtime path escaped its generation.".into());
    }
    let file = File::open(canonical).map_err(|e| e.to_string())?;
    let mut bytes =
        Vec::with_capacity(usize::try_from(entry.bytes).map_err(|_| "Runtime file is too large.")?);
    file.take(entry.bytes.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 != entry.bytes || hex::encode(Sha256::digest(&bytes)) != entry.sha256 {
        return Err("Runtime integrity verification failed.".into());
    }
    Ok(bytes)
}

fn verify_generation(root: &Path, component: &str, folder: &str) -> Result<Manifest, String> {
    if !safe_path(folder) || folder.contains('/') {
        return Err("Runtime generation path is invalid.".into());
    }
    let generation = root.join("generations").join(component).join(folder);
    let manifest = signed_generation(&generation)?;
    if manifest.component != component {
        return Err("Runtime component does not match its generation.".into());
    }
    let mut total = 0u64;
    for entry in &manifest.files {
        total = total
            .checked_add(entry.bytes)
            .ok_or("Runtime size overflow.")?;
        if total > MAX_EXPANDED {
            return Err("Runtime exceeds its size limit.".into());
        }
        checked_runtime_file(&generation, entry)?;
    }
    if total != manifest.payload_bytes {
        return Err("Runtime size does not match its manifest.".into());
    }
    Ok(manifest)
}

fn write_selection(root: &Path, selection: &RuntimeSelection) -> Result<(), String> {
    write_json(&root.join("active.json"), selection)
}

fn verify_selection(root: &Path, selection: &RuntimeSelection) -> Result<(), String> {
    for (component, folder) in [
        ("frontend", &selection.frontend),
        ("wordcraft", &selection.wordcraft),
    ] {
        if let Some(folder) = folder {
            verify_generation(root, component, folder)?;
        }
    }
    Ok(())
}

fn restore_previous(root: &Path, previous: &RuntimeSelection) -> Result<(), String> {
    if verify_selection(root, previous).is_ok() {
        write_selection(root, previous)
    } else {
        write_selection(root, &RuntimeSelection::default())
    }
}

fn prune_generations(
    root: &Path,
    active: &RuntimeSelection,
    rollback: &RuntimeSelection,
) -> Result<(), String> {
    for component in ["frontend", "wordcraft"] {
        let directory = root.join("generations").join(component);
        let mut keep: HashSet<String> = [
            if component == "frontend" {
                active.frontend.as_deref()
            } else {
                active.wordcraft.as_deref()
            },
            if component == "frontend" {
                rollback.frontend.as_deref()
            } else {
                rollback.wordcraft.as_deref()
            },
        ]
        .into_iter()
        .flatten()
        .map(str::to_owned)
        .collect();
        let Ok(entries) = fs::read_dir(&directory) else {
            continue;
        };
        let mut newest_staged: Option<(u64, String)> = None;
        for entry in fs::read_dir(&directory).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if keep.contains(name) {
                continue;
            }
            if let Ok(manifest) = signed_generation(&path)
                && newest_staged
                    .as_ref()
                    .is_none_or(|(sequence, _)| manifest.sequence > *sequence)
            {
                newest_staged = Some((manifest.sequence, name.to_owned()));
            }
        }
        if let Some((_, name)) = newest_staged {
            keep.insert(name);
        }
        for entry in entries {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| keep.contains(name))
            {
                continue;
            }
            if fs::symlink_metadata(&path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            } else {
                fs::remove_dir_all(path).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

fn clear_staging(root: &Path) -> Result<(), String> {
    let directory = root.join("staging");
    let Ok(entries) = fs::read_dir(&directory) else {
        return Ok(());
    };
    for entry in entries {
        let path = entry.map_err(|e| e.to_string())?.path();
        if fs::symlink_metadata(&path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        } else {
            fs::remove_dir_all(path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn queue_recovery_notice(root: &Path, failed: &RuntimeSelection, previous: &RuntimeSelection) {
    for (component, failed_folder, previous_folder) in [
        ("frontend", &failed.frontend, &previous.frontend),
        ("wordcraft", &failed.wordcraft, &previous.wordcraft),
    ] {
        if failed_folder == previous_folder { continue; }
        let version = failed_folder.as_ref().and_then(|folder| signed_generation(&root.join("generations").join(component).join(folder)).ok()).map(|manifest| manifest.version);
        if let Ok(mut notice) = STARTUP_NOTICE.lock() {
            *notice = Some(UpdateNotice { component: component.into(), version, success: false });
        }
        break;
    }
}

fn recover_activation_at(root: &Path, process_id: u32) -> Result<(), String> {
    let path = root.join("transaction.json");
    let Some(mut journal) = read_json::<ActivationJournal>(&path)? else {
        let active = read_json::<RuntimeSelection>(&root.join("active.json"))?.unwrap_or_default();
        if verify_selection(root, &active).is_ok() {
            return Ok(());
        }
        let rollback =
            read_json::<RuntimeSelection>(&root.join("rollback.json"))?.unwrap_or_default();
        queue_recovery_notice(root, &active, &rollback);
        return restore_previous(root, &rollback);
    };
    match journal.phase.as_str() {
        "prepared" => {
            if verify_selection(root, &journal.candidate).is_err() {
                queue_recovery_notice(root, &journal.candidate, &journal.previous);
                restore_previous(root, &journal.previous)?;
                fs::remove_file(path).map_err(|e| e.to_string())?;
                return Ok(());
            }
            write_selection(root, &journal.candidate)?;
            journal.phase = "activating".into();
            journal.process_id = process_id;
            write_json(&path, &journal)
        }
        "activating" if journal.process_id != process_id => {
            queue_recovery_notice(root, &journal.candidate, &journal.previous);
            restore_previous(root, &journal.previous)?;
            fs::remove_file(path).map_err(|e| e.to_string())
        }
        "ready" => {
            if verify_selection(root, &journal.candidate).is_ok() {
                write_selection(root, &journal.candidate)?;
                write_json(&root.join("rollback.json"), &journal.previous)?;
                record_activation_history(root, &journal);
            } else {
                restore_previous(root, &journal.previous)?;
                queue_recovery_notice(root, &journal.candidate, &journal.previous);
            }
            let active =
                read_json::<RuntimeSelection>(&root.join("active.json"))?.unwrap_or_default();
            let rollback =
                read_json::<RuntimeSelection>(&root.join("rollback.json"))?.unwrap_or_default();
            prune_generations(root, &active, &rollback)?;
            fs::remove_file(path).map_err(|e| e.to_string())
        }
        "activating" => Ok(()),
        _ => Err("Update activation journal has an unsupported state.".into()),
    }
}

pub fn recover_activation() -> Result<(), String> {
    let _guard = UPDATE_LOCK.lock().map_err(|_| "Update manager is busy.")?;
    let _process = process_lock()?;
    let root = updates_dir()?;
    recover_activation_at(&root, std::process::id())?;
    clear_staging(&root)
}

fn schedule_selection(
    root: &Path,
    candidate: RuntimeSelection,
    action: &str,
) -> Result<(), String> {
    if root.join("transaction.json").exists() {
        return Err("An update transaction is already pending.".into());
    }
    for (component, folder) in [
        ("frontend", &candidate.frontend),
        ("wordcraft", &candidate.wordcraft),
    ] {
        if let Some(folder) = folder {
            verify_generation(root, component, folder)?;
        }
    }
    let previous = read_json::<RuntimeSelection>(&root.join("active.json"))?.unwrap_or_default();
    write_json(
        &root.join("transaction.json"),
        &ActivationJournal {
            phase: "prepared".into(),
            action: action.into(),
            previous,
            candidate,
            process_id: 0,
        },
    )
}

pub fn schedule_package(component: &str, release_id: &str) -> Result<(), String> {
    let _guard = UPDATE_LOCK.lock().map_err(|_| "Update manager is busy.")?;
    let _process = process_lock()?;
    if !matches!(component, "frontend" | "wordcraft" | "core") {
        return Err("Unknown update component.".into());
    }
    let root = updates_dir()?;
    if component == "core" && root.join("core-transaction.json").exists() {
        return Err("A previous Core transaction must be recovered before another update.".into());
    }
    let generations = root.join("generations").join(component);
    for entry in fs::read_dir(&generations).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let Ok(manifest) = signed_generation(&path) else {
            continue;
        };
        if manifest.release_id == release_id {
            if !is_newer_than_active(component, &manifest.version, &runtime_status()?) {
                return Err("This update version is already active or is not newer than the active version.".into());
            }
            let folder = path
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or("Runtime generation name is invalid.")?;
            if component == "core" {
                let pending = serde_json::json!({"generation":folder,"version":manifest.version,"releaseId":manifest.release_id});
                return write_json(&root.join("core-pending.json"), &pending);
            }
            let mut candidate =
                read_json::<RuntimeSelection>(&root.join("active.json"))?.unwrap_or_default();
            if component == "frontend" {
                candidate.frontend = Some(folder.to_string());
            } else {
                candidate.wordcraft = Some(folder.to_string());
            }
            return schedule_selection(&root, candidate, "activate");
        }
    }
    Err("The selected verified update is not staged.".into())
}

pub fn start_core_update(app: AppHandle) -> Result<(), String> {
    let root = updates_dir()?;
    if root.join("core-transaction.json").exists() {
        return Err("A previous Core transaction must be recovered before another update.".into());
    }
    let pending = read_json::<serde_json::Value>(&root.join("core-pending.json"))?
        .ok_or("No verified Core update is staged.")?;
    let generation = pending["generation"]
        .as_str()
        .ok_or("Core update state is invalid.")?;
    let version = pending["version"]
        .as_str()
        .ok_or("Core update state is invalid.")?;
    let path = root.join("generations/core").join(generation);
    let manifest = signed_generation(&path)?;
    if manifest.component != "core" || manifest.version != version {
        return Err("Staged Core installer no longer matches its signed metadata.".into());
    }
    verify_core_setup(&path.join(&manifest.files[0].path), version)?;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let install = exe.parent().ok_or("B6H installation path is invalid.")?;
    let bundled_runner = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("b6h-update-runner.exe");
    if !bundled_runner.is_file() {
        return Err("The Core update runner is missing from this installation.".into());
    }
    let runner = root.join("core-update-runner.exe");
    fs::copy(&bundled_runner, &runner)
        .map_err(|e| format!("Could not prepare the Core update runner: {e}"))?;
    let nonce = uuid::Uuid::new_v4().to_string();
    write_json(
        &root.join("core-transaction.json"),
        &serde_json::json!({
            "phase":"prepared","action":"upgrade","version":version,"previousVersion":CORE_VERSION,"nonce":nonce,
            "installDir":install,"backup":"core-next","generation":generation,
            "rollbackSnapshotExisted":root.join("core-rollback").is_dir()
        }),
    )?;
    std::process::Command::new(runner)
        .args([
            "apply",
            &root.to_string_lossy(),
            generation,
            &install.to_string_lossy(),
            &exe.to_string_lossy(),
            &std::process::id().to_string(),
            &nonce,
            version,
            "--confirmed",
        ])
        .spawn()
        .map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

pub fn start_core_rollback(app: AppHandle) -> Result<(), String> {
    let root = updates_dir()?;
    if root.join("core-transaction.json").exists() {
        return Err(
            "A previous Core transaction must be recovered before another rollback.".into(),
        );
    }
    if !root.join("core-rollback").is_dir() {
        return Err("No previous Core installation is available.".into());
    }
    let version = fs::read_to_string(root.join("core-rollback-version"))
        .map_err(|_| "Previous Core version metadata is missing.")?;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let install = exe.parent().ok_or("B6H installation path is invalid.")?;
    let bundled_runner = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("b6h-update-runner.exe");
    if !bundled_runner.is_file() {
        return Err("The Core update runner is missing from this installation.".into());
    }
    let runner = root.join("core-update-runner.exe");
    fs::copy(&bundled_runner, &runner)
        .map_err(|e| format!("Could not prepare the Core update runner: {e}"))?;
    let nonce = uuid::Uuid::new_v4().to_string();
    write_json(
        &root.join("core-transaction.json"),
        &serde_json::json!({
            "phase":"prepared","action":"rollback","version":version,"previousVersion":CORE_VERSION,"nonce":nonce,
            "installDir":install,"backup":"core-next","rollbackSnapshotExisted":true
        }),
    )?;
    std::process::Command::new(runner)
        .args([
            "rollback",
            &root.to_string_lossy(),
            &install.to_string_lossy(),
            &exe.to_string_lossy(),
            &std::process::id().to_string(),
            &nonce,
            "--confirmed",
        ])
        .spawn()
        .map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

pub fn schedule_rollback() -> Result<(), String> {
    let _guard = UPDATE_LOCK.lock().map_err(|_| "Update manager is busy.")?;
    let _process = process_lock()?;
    let root = updates_dir()?;
    let rollback = read_json::<RuntimeSelection>(&root.join("rollback.json"))?
        .ok_or("No rollback generation is available.")?;
    schedule_selection(&root, rollback, "rollback")
}

fn mark_ready_at(root: &Path, process_id: u32) -> Result<Option<UpdateNotice>, String> {
    let path = root.join("transaction.json");
    let Some(mut journal) = read_json::<ActivationJournal>(&path)? else {
        return Ok(None);
    };
    if journal.phase != "activating" || journal.process_id != process_id {
        return Ok(None);
    }
    for (component, folder) in [
        ("frontend", &journal.candidate.frontend),
        ("wordcraft", &journal.candidate.wordcraft),
    ] {
        if let Some(folder) = folder {
            verify_generation(root, component, folder)?;
        }
    }
    journal.phase = "ready".into();
    write_json(&path, &journal)?;
    write_json(&root.join("rollback.json"), &journal.previous)?;
    record_activation_history(root, &journal);
    let notice = if journal.action == "activate" {
        [
            ("frontend", &journal.previous.frontend, &journal.candidate.frontend),
            ("wordcraft", &journal.previous.wordcraft, &journal.candidate.wordcraft),
        ]
        .into_iter()
        .find_map(|(component, before, after)| {
            if before == after { return None; }
            let folder = after.as_ref()?;
            let manifest = signed_generation(&root.join("generations").join(component).join(folder)).ok()?;
            Some(UpdateNotice { component: component.into(), version: Some(manifest.version), success: true })
        })
    } else { None };
    let active = read_json::<RuntimeSelection>(&root.join("active.json"))?.unwrap_or_default();
    let rollback = read_json::<RuntimeSelection>(&root.join("rollback.json"))?.unwrap_or_default();
    prune_generations(root, &active, &rollback)?;
    fs::remove_file(path).map_err(|e| e.to_string())?;
    Ok(notice)
}

fn record_activation_history(root: &Path, journal: &ActivationJournal) {
    for component in ["frontend", "wordcraft"] {
        let (before, after) = if component == "frontend" {
            (&journal.previous.frontend, &journal.candidate.frontend)
        } else {
            (&journal.previous.wordcraft, &journal.candidate.wordcraft)
        };
        if before == after {
            continue;
        }
        if let Some(folder) = after {
            if let Ok(manifest) =
                signed_generation(&root.join("generations").join(component).join(folder))
            {
                let _ = append_history(
                    root,
                    &journal.action,
                    component,
                    &manifest.version,
                    &manifest.release_id,
                );
                continue;
            }
        }
        let _ = append_history(
            root,
            &journal.action,
            component,
            "bundled",
            "embedded-recovery",
        );
    }
}

pub fn mark_runtime_ready() -> Result<Option<UpdateNotice>, String> {
    let _guard = UPDATE_LOCK.lock().map_err(|_| "Update manager is busy.")?;
    let _process = process_lock()?;
    let root = updates_dir()?;
    let mut notice = mark_ready_at(&root, std::process::id())?;
    if notice.is_none() {
        notice = STARTUP_NOTICE.lock().map_err(|_| "Update manager is busy.")?.take();
    }
    if let Some(tx) = read_json::<serde_json::Value>(&root.join("core-transaction.json"))?
        && let Some(nonce) = readiness_nonce(&tx, CORE_VERSION)
    {
        atomic_write(
            &root.join(format!("core-ready-{nonce}")),
            CORE_VERSION.as_bytes(),
        )?;
        if let Some(version) = tx["version"].as_str() {
            notice = Some(UpdateNotice { component: "core".into(), version: Some(version.into()), success: true });
        }
    }
    Ok(notice)
}

fn readiness_nonce<'a>(transaction: &'a serde_json::Value, version: &str) -> Option<&'a str> {
    let nonce = transaction["nonce"].as_str()?;
    (transaction["phase"] == "awaiting-ready"
        && matches!(transaction["action"].as_str(), Some("upgrade" | "rollback"))
        && transaction["version"].as_str() == Some(version)
        && uuid::Uuid::parse_str(nonce).is_ok())
    .then_some(nonce)
}

pub fn update_history() -> Result<Vec<UpdateHistoryEntry>, String> {
    Ok(read_json(&updates_dir()?.join("history.json"))?.unwrap_or_default())
}

pub fn active_asset(path: &str) -> Result<Option<RuntimeAsset>, String> {
    active_asset_at(&updates_dir()?, path)
}

fn active_asset_at(root: &Path, path: &str) -> Result<Option<RuntimeAsset>, String> {
    let selection = read_json::<RuntimeSelection>(&root.join("active.json"))?.unwrap_or_default();
    let (component, folder, relative) = if let Some(relative) = path.strip_prefix("wordcraft/") {
        let Some(folder) = selection.wordcraft.clone() else {
            return Ok(None);
        };
        ("wordcraft", folder, relative)
    } else {
        let Some(folder) = selection.frontend.clone() else {
            return Ok(None);
        };
        ("frontend", folder, path)
    };
    if !safe_path(relative) || !safe_path(&folder) || folder.contains('/') {
        return Err("Runtime request path is invalid.".into());
    }
    let generation = root.join("generations").join(component).join(&folder);
    let manifest = signed_generation(&generation)?;
    let entry = manifest
        .files
        .iter()
        .find(|entry| entry.path == relative)
        .ok_or("Active runtime requested a file outside its signed inventory.")?;
    let bytes = checked_runtime_file(&generation, entry)?;
    let mime_type = match Path::new(relative)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "application/javascript",
        "css" => "text/css",
        "json" => "application/json",
        "wasm" => "application/wasm",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    };
    Ok(Some(RuntimeAsset {
        bytes,
        mime_type: mime_type.into(),
    }))
}

fn read_manifest(archive: &mut ZipArchive<File>) -> Result<(Vec<u8>, String, Manifest), String> {
    let mut bytes = Vec::new();
    archive
        .by_name("manifest.json")
        .map_err(|_| "Package manifest is missing.")?
        .take((MAX_MANIFEST + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > MAX_MANIFEST {
        return Err("Package manifest exceeds the size limit.".into());
    }
    let manifest: Manifest =
        serde_json::from_slice(&bytes).map_err(|_| "Package manifest is invalid.")?;
    let mut signature_text = String::new();
    archive
        .by_name("manifest.sig")
        .map_err(|_| "Package signature is missing.")?
        .take(4097)
        .read_to_string(&mut signature_text)
        .map_err(|e| e.to_string())?;
    let signature_text = signature_text.trim().to_string();
    let signature = STANDARD
        .decode(&signature_text)
        .map_err(|_| "Package signature is invalid.")?;
    let public_key = key_for(&manifest.key_id)?;
    UnparsedPublicKey::new(&ED25519, &public_key)
        .verify(&bytes, &signature)
        .map_err(|_| "Package signature verification failed.")?;
    validate_manifest(&manifest)?;
    Ok((bytes, signature_text, manifest))
}

fn stage_package(path: &Path, app: &AppHandle) -> Result<PackageInfo, String> {
    stage_package_in(path, &updates_dir()?, Some(app))
}

fn stage_package_in(
    path: &Path,
    root: &Path,
    app: Option<&AppHandle>,
) -> Result<PackageInfo, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let length = file.metadata().map_err(|e| e.to_string())?.len();
    if length == 0 || length > MAX_ARCHIVE {
        return Err("The update package is empty or exceeds the archive size limit.".into());
    }
    let mut archive =
        ZipArchive::new(file).map_err(|_| "The update package is not a valid archive.")?;
    if archive.len() > MAX_FILES + 2 {
        return Err("The package contains too many entries.".into());
    }
    let (manifest_bytes, signature_text, manifest) = read_manifest(&mut archive)?;
    let manifest_hash = hex::encode(Sha256::digest(&manifest_bytes));
    let mut expected = HashSet::from(["manifest.json".to_string(), "manifest.sig".to_string()]);
    let mut actual = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|e| e.to_string())?;
        let name =
            std::str::from_utf8(entry.name_raw()).map_err(|_| "Package entry name is invalid.")?;
        if entry.is_dir()
            || entry
                .unix_mode()
                .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("Directories and links are not allowed in update packages.".into());
        }
        if !safe_path(name) || !actual.insert(name.to_ascii_lowercase()) {
            return Err("The package contains an unsafe or duplicate path.".into());
        }
    }
    for entry in &manifest.files {
        expected.insert(format!("payload/{}", entry.path));
    }
    for name in &expected {
        if !actual.contains(&name.to_ascii_lowercase()) {
            return Err("Package entries do not match the signed manifest.".into());
        }
    }
    if expected.len() != actual.len() {
        return Err("Package contains files not declared in its signed manifest.".into());
    }

    let staging_root = root.join("staging");
    let generations = root.join("generations").join(&manifest.component);
    fs::create_dir_all(&staging_root).map_err(|e| e.to_string())?;
    fs::create_dir_all(&generations).map_err(|e| e.to_string())?;
    let folder = format!("{}-{}", manifest.version, manifest.release_id);
    let final_path = generations.join(&folder);
    if final_path.exists() {
        if fs::read(final_path.join("manifest.json")).ok().as_deref()
            == Some(manifest_bytes.as_slice())
        {
            return Ok(PackageInfo {
                component: manifest.component,
                version: manifest.version,
                release_id: manifest.release_id,
                files: manifest.files.len(),
                bytes: manifest.payload_bytes,
                staged_at: "already-staged".into(),
            });
        }
        return Err("This release ID is already used for different content.".into());
    }
    let sequence_path = root.join("sequence-state.json");
    let mut sequence_state = read_json::<SequenceState>(&sequence_path)?.unwrap_or_default();
    if let Some(existing) = sequence_state.releases.get(&manifest.release_id) {
        if existing != &manifest_hash {
            return Err("This release ID is already used for different content.".into());
        }
    }
    let component_key = format!("{}:{}", manifest.component, manifest.channel);
    let previous_sequence = sequence_state.components.get(&component_key);
    if previous_sequence.is_some_and(|previous| {
        manifest.sequence <= previous.highest_sequence
            || version_cmp(&manifest.version, &previous.highest_version)
                .is_some_and(|order| order == std::cmp::Ordering::Less)
    }) {
        return Err("This update is older than a previously imported release.".into());
    }
    for entry in fs::read_dir(&generations).map_err(|e| e.to_string())? {
        let manifest_path = entry
            .map_err(|e| e.to_string())?
            .path()
            .join("manifest.json");
        let Ok(bytes) = fs::read(&manifest_path) else {
            continue;
        };
        let Ok(previous) = serde_json::from_slice::<Manifest>(&bytes) else {
            continue;
        };
        if previous.release_id == manifest.release_id && bytes != manifest_bytes {
            return Err("This release ID is already used for different content.".into());
        }
        if previous.channel == manifest.channel
            && (previous.sequence >= manifest.sequence
                || version_cmp(&previous.version, &manifest.version)
                    .is_some_and(|order| order == std::cmp::Ordering::Greater))
        {
            return Err("This update is older than a previously staged release.".into());
        }
    }
    let stage = staging_root.join(uuid::Uuid::new_v4().to_string());
    fs::create_dir(&stage)
        .map_err(|e| format!("Could not create the update extraction directory: {e}"))?;
    let result = (|| {
        let file = File::open(path).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
        let mut expanded = 0u64;
        let mut last_report = 0u64;
        for entry in &manifest.files {
            if CANCEL_IMPORT.load(Ordering::Acquire) {
                return Err("Update import cancelled.".into());
            }
            let archive_name = format!("payload/{}", entry.path);
            let mut source = archive
                .by_name(&archive_name)
                .map_err(|_| "A declared payload file is missing.")?;
            let output = stage.join(&entry.path);
            let parent = output.parent().ok_or("Invalid payload path.")?;
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Could not create update payload folder {}: {e}",
                    parent.display()
                )
            })?;
            let mut destination = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&output)
                .map_err(|e| format!("Could not write update payload {}: {e}", output.display()))?;
            let mut hasher = Sha256::new();
            let mut copied = 0u64;
            let mut buffer = [0; 64 * 1024];
            loop {
                if CANCEL_IMPORT.load(Ordering::Acquire) {
                    return Err("Update import cancelled.".into());
                }
                let count = source.read(&mut buffer).map_err(|e| e.to_string())?;
                if count == 0 {
                    break;
                }
                copied = copied
                    .checked_add(count as u64)
                    .ok_or("Payload size overflow.")?;
                expanded = expanded
                    .checked_add(count as u64)
                    .ok_or("Payload size overflow.")?;
                if copied > entry.bytes || expanded > MAX_EXPANDED {
                    return Err("The package exceeds its declared or expanded size limit.".into());
                }
                hasher.update(&buffer[..count]);
                destination
                    .write_all(&buffer[..count])
                    .map_err(|e| e.to_string())?;
                if expanded - last_report >= 1024 * 1024 || expanded == manifest.payload_bytes {
                    if let Some(app) = app {
                        let _ = app.emit("update-progress", serde_json::json!({"phase":"import","component":manifest.component,"bytesProcessed":expanded,"totalBytes":manifest.payload_bytes}));
                    }
                    last_report = expanded;
                }
            }
            destination.sync_all().map_err(|e| e.to_string())?;
            if copied != entry.bytes || hex::encode(hasher.finalize()) != entry.sha256 {
                return Err(format!("Payload integrity check failed: {}", entry.path));
            }
        }
        if expanded != manifest.payload_bytes {
            return Err("Expanded package size does not match its manifest.".into());
        }
        if manifest.component == "core" {
            verify_core_setup(&stage.join(&manifest.files[0].path), &manifest.version)?;
        }
        fs::write(stage.join("manifest.json"), &manifest_bytes).map_err(|e| e.to_string())?;
        fs::write(stage.join("manifest.sig"), signature_text.as_bytes())
            .map_err(|e| e.to_string())?;
        fs::rename(&stage, &final_path).map_err(|e| e.to_string())?;
        sequence_state.components.insert(
            component_key,
            ComponentSequence {
                highest_sequence: manifest.sequence,
                highest_version: manifest.version.clone(),
            },
        );
        sequence_state
            .releases
            .insert(manifest.release_id.clone(), manifest_hash);
        if let Err(error) = write_json(&sequence_path, &sequence_state) {
            let _ = fs::remove_dir_all(&final_path);
            return Err(error);
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&stage);
    }
    result?;
    let _ = File::open(&final_path).and_then(|f| f.sync_all());
    Ok(PackageInfo {
        component: manifest.component,
        version: manifest.version,
        release_id: manifest.release_id,
        files: manifest.files.len(),
        bytes: manifest.payload_bytes,
        staged_at: chrono::Utc::now().to_rfc3339(),
    })
}

pub fn import_package(app: AppHandle, path: &str) -> Result<PackageInfo, String> {
    let _guard = UPDATE_LOCK.lock().map_err(|_| "Update manager is busy.")?;
    let _process = process_lock()?;
    let source = Path::new(path);
    if !source.is_absolute()
        || !source.is_file()
        || !source
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("b6hupdate"))
    {
        return Err("Choose a valid .b6hupdate package.".into());
    }
    CANCEL_IMPORT.store(false, Ordering::Release);
    let _ = app.emit(
        "update-progress",
        serde_json::json!({"phase":"verifying","bytesProcessed":0,"totalBytes":0}),
    );
    let result = stage_package(source, &app)?;
    if result.staged_at != "already-staged" {
        append_history(
            &updates_dir()?,
            "import",
            &result.component,
            &result.version,
            &result.release_id,
        )?;
    }
    Ok(result)
}

pub fn cancel_import() {
    CANCEL_IMPORT.store(true, Ordering::Release);
}

fn version_cmp(left: &str, right: &str) -> Option<std::cmp::Ordering> {
    let left = semver::Version::parse(left).ok()?;
    let right = semver::Version::parse(right).ok()?;
    Some(left.cmp_precedence(&right))
}

pub fn staged_packages() -> Result<Vec<PackageInfo>, String> {
    let root = updates_dir()?.join("generations");
    let active = runtime_status()?;
    let mut result = Vec::new();
    for component in ["frontend", "wordcraft", "core"] {
        let Ok(entries) = fs::read_dir(root.join(component)) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(manifest) = signed_generation(&path) else {
                continue;
            };
            if !is_newer_than_active(component, &manifest.version, &active) { continue; }
            result.push(PackageInfo {
                component: manifest.component,
                version: manifest.version,
                release_id: manifest.release_id,
                files: manifest.files.len(),
                bytes: manifest.payload_bytes,
                staged_at: entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.created().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|t| t.as_secs().to_string())
                    .unwrap_or_default(),
            });
        }
    }
    result.sort_by(|a, b| {
        a.component
            .cmp(&b.component)
            .then(a.version.cmp(&b.version))
    });
    Ok(result)
}

pub fn runtime_status() -> Result<RuntimeStatus, String> {
    let root = updates_dir()?;
    let active = read_json::<RuntimeSelection>(&root.join("active.json"))?.unwrap_or_default();
    let rollback = read_json::<RuntimeSelection>(&root.join("rollback.json"))?.is_some();
    let version = |component: &str, folder: &Option<String>| -> Result<Option<String>, String> {
        folder
            .as_ref()
            .map(|folder| {
                signed_generation(&root.join("generations").join(component).join(folder))
                    .map(|manifest| manifest.version)
            })
            .transpose()
    };
    Ok(RuntimeStatus {
        core_version: CORE_VERSION.into(),
        active_frontend: version("frontend", &active.frontend)?,
        active_wordcraft: version("wordcraft", &active.wordcraft)?,
        can_rollback: rollback,
        can_rollback_core: root.join("core-rollback").is_dir(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_windows_unsafe_paths() {
        for path in [
            "../escape",
            "C:/absolute",
            "payload\\evil",
            "CON.txt",
            "a.",
            "a:b",
        ] {
            assert!(!safe_path(path), "accepted unsafe path {path}");
        }
        assert!(safe_path("assets/app.js"));
    }

    #[test]
    fn isolated_test_key_is_not_a_production_trust_root() {
        #[cfg(any(debug_assertions, feature = "update-test-keys"))]
        assert!(key_for(TEST_KEY_ID).is_ok());
        #[cfg(all(not(debug_assertions), not(feature = "update-test-keys")))]
        assert!(key_for(TEST_KEY_ID).is_err());
    }

    #[test]
    fn compares_component_versions_without_accepting_malformed_values() {
        assert_eq!(
            version_cmp("3.0.0", "3.0.1"),
            Some(std::cmp::Ordering::Less)
        );
        assert_eq!(
            version_cmp("3.0.1", "3.0.0"),
            Some(std::cmp::Ordering::Greater)
        );
        assert_eq!(version_cmp("3.0", "3.0.1"), None);
        assert_eq!(
            version_cmp("3.0.9", "3.0.10"),
            Some(std::cmp::Ordering::Less)
        );
        assert_eq!(version_cmp("03.0.0", "3.0.0"), None);
        assert_eq!(
            version_cmp("3.0.0-rc.1", "3.0.0"),
            Some(std::cmp::Ordering::Less)
        );
        assert_eq!(
            version_cmp("3.0.0+one", "3.0.0+two"),
            Some(std::cmp::Ordering::Equal)
        );
        assert!(core_satisfies("3.0.1", "3.0.0"));
        assert!(!core_satisfies("3.0.0", "3.0.1"));
        assert!(!core_satisfies("3.0.1", "three"));
    }

    #[test]
    fn only_offers_versions_newer_than_the_active_component() {
        let active = RuntimeStatus { core_version: "3.0.1".into(), active_frontend: Some("3.0.1".into()), active_wordcraft: None, can_rollback: false, can_rollback_core: false };
        assert!(!is_newer_than_active("frontend", "3.0.1", &active));
        assert!(!is_newer_than_active("frontend", "3.0.0", &active));
        assert!(is_newer_than_active("frontend", "3.0.2", &active));
        assert!(!is_newer_than_active("core", "3.0.1", &active));
        assert!(is_newer_than_active("core", "3.0.2", &active));
        assert!(is_newer_than_active("wordcraft", "3.0.1", &active));
        assert!(!is_newer_than_active("invalid", "3.0.2", &active));
        let bundled = RuntimeStatus {
            core_version: "3.0.2".into(),
            active_frontend: None,
            active_wordcraft: None,
            can_rollback: false,
            can_rollback_core: false,
        };
        assert!(!is_newer_than_active("frontend", "3.0.2", &bundled));
        assert!(is_newer_than_active("frontend", "3.0.3", &bundled));
    }

    #[test]
    fn core_readiness_requires_the_active_transaction_identity() {
        let tx = serde_json::json!({
            "phase":"awaiting-ready","action":"upgrade","version":"3.0.1",
            "nonce":"7c179920-ced6-4588-9dc8-714044a8169d"
        });
        assert_eq!(
            readiness_nonce(&tx, "3.0.1"),
            Some("7c179920-ced6-4588-9dc8-714044a8169d")
        );
        assert_eq!(readiness_nonce(&tx, "3.0.0"), None);
        let mut stale = tx.clone();
        stale["phase"] = serde_json::json!("committed");
        assert_eq!(readiness_nonce(&stale, "3.0.1"), None);
        stale = tx.clone();
        stale["nonce"] = serde_json::json!("../../stale");
        assert_eq!(readiness_nonce(&stale, "3.0.1"), None);
    }

    #[test]
    fn signed_catalog_rejects_modified_bytes_and_untrusted_signature() {
        let catalog = serde_json::json!({"schemaVersion":1,"productId":PRODUCT,"platform":"windows","arch":"x86_64","channel":"stable","sequence":1,"keyId":TEST_KEY_ID,"packages":[]});
        let bytes = serde_json::to_vec(&catalog).unwrap();
        assert!(validate_catalog(&bytes, &[0; 64]).is_err());
        assert!(validate_catalog(br#"{"schemaVersion":1}"#, &[0; 64]).is_err());
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../.b6h-state/distribution");
        let catalog = fs::read(root.join("catalog.json"));
        let signature = fs::read_to_string(root.join("catalog.sig"));
        if let (Ok(catalog), Ok(signature)) = (catalog, signature) {
            let signature = STANDARD.decode(signature.trim()).unwrap();
            if let Ok(packages) = validate_catalog(&catalog, &signature) {
                assert_eq!(packages.len(), 3);
                assert!(packages.iter().any(|package| package.component == "core"));
            }
            let mut tampered = catalog;
            tampered[0] ^= 1;
            assert!(validate_catalog(&tampered, &signature).is_err());
        }
    }

    #[test]
    fn rejects_incompatible_core_and_contract_versions() {
        let mut manifest: Manifest = serde_json::from_value(serde_json::json!({
            "schemaVersion":1,"productId":PRODUCT,"platform":"windows","arch":"x86_64",
            "channel":"stable","releaseId":"frontend-test","sequence":1,"component":"frontend",
            "version":"3.0.1","requires":{"core":"3.0.0","ipcContract":1,"wordcraftBridge":1},
            "keyId":TEST_KEY_ID,"payloadBytes":1,"files":[{"path":"index.html","bytes":1,"sha256":"0000000000000000000000000000000000000000000000000000000000000000"}]
        })).unwrap();
        assert!(validate_manifest(&manifest).is_ok());
        manifest.requires.core = "3.0.3".into();
        assert!(validate_manifest(&manifest).is_err());
    }

    #[test]
    fn imports_existing_signed_packages_into_isolated_staging() {
        let source_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../.b6h-state/distribution");
        let root = std::env::temp_dir().join(format!("b6h-update-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        for (name, component) in [
            ("frontend-v3.0.1-test.b6hupdate", "frontend"),
            ("wordcraft-v3.0.1-test.b6hupdate", "wordcraft"),
        ] {
            let package = source_root.join(name);
            if !package.exists() {
                continue;
            }
            let staged = stage_package_in(&package, &root, None).unwrap();
            assert_eq!(staged.component, component);
            assert!(
                root.join("generations")
                    .join(component)
                    .join(format!("{}-{}", staged.version, staged.release_id))
                    .is_dir()
            );
            assert_eq!(
                stage_package_in(&package, &root, None).unwrap().staged_at,
                "already-staged"
            );
        }
        let replay = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../.b6h-state/test-fixtures/frontend-replay.b6hupdate");
        let primary = source_root.join("frontend-v3.0.1-test.b6hupdate");
        if replay.exists() && primary.exists() {
            assert!(stage_package_in(&replay, &root, None).is_err());
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn activation_readiness_and_interrupted_startup_restore_safe_generations() {
        let package = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../.b6h-state/distribution/frontend-v3.0.0-test.b6hupdate");
        if !package.exists() {
            return;
        }
        let root = std::env::temp_dir().join(format!("b6h-runtime-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let info = stage_package_in(&package, &root, None).unwrap();
        let wordcraft_package = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../.b6h-state/distribution/wordcraft-v3.0.0-test.b6hupdate");
        let staged_wordcraft = wordcraft_package
            .exists()
            .then(|| stage_package_in(&wordcraft_package, &root, None).unwrap());
        let mut candidate = RuntimeSelection::default();
        candidate.frontend = Some(format!("{}-{}", info.version, info.release_id));

        schedule_selection(&root, candidate.clone(), "activate").unwrap();
        recover_activation_at(&root, 41).unwrap();
        assert!(active_asset_at(&root, "index.html").unwrap().is_some());
        recover_activation_at(&root, 42).unwrap();
        let notice = STARTUP_NOTICE.lock().unwrap().take().unwrap();
        assert_eq!(notice.component, "frontend");
        assert!(!notice.success);
        assert!(read_json::<Vec<UpdateHistoryEntry>>(&root.join("history.json")).unwrap().unwrap_or_default().is_empty());
        assert!(
            read_json::<RuntimeSelection>(&root.join("active.json"))
                .unwrap()
                .unwrap()
                .frontend
                .is_none()
        );
        assert!(!root.join("transaction.json").exists());

        schedule_selection(&root, candidate, "activate").unwrap();
        recover_activation_at(&root, 43).unwrap();
        mark_ready_at(&root, 43).unwrap();
        if let Some(wordcraft) = staged_wordcraft {
            assert!(
                root.join("generations/wordcraft")
                    .join(format!("{}-{}", wordcraft.version, wordcraft.release_id))
                    .is_dir(),
                "frontend activation removed the staged Wordcraft package"
            );
        }
        assert!(
            read_json::<RuntimeSelection>(&root.join("rollback.json"))
                .unwrap()
                .unwrap()
                .frontend
                .is_none()
        );
        let rollback = read_json::<RuntimeSelection>(&root.join("rollback.json"))
            .unwrap()
            .unwrap();
        schedule_selection(&root, rollback, "rollback").unwrap();
        recover_activation_at(&root, 44).unwrap();
        mark_ready_at(&root, 44).unwrap();
        assert!(
            read_json::<RuntimeSelection>(&root.join("active.json"))
                .unwrap()
                .unwrap()
                .frontend
                .is_none()
        );
        let _ = fs::remove_dir_all(root);
    }
}
