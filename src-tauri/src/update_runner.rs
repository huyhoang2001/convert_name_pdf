#[cfg(windows)]
mod windows {
    use base64::{Engine, engine::general_purpose::STANDARD};
    use ring::signature::{ED25519, UnparsedPublicKey};
    use serde_json::{Value, json};
    use sha2::{Digest, Sha256};
    use std::{
        fs::{self, File, OpenOptions},
        io::{Read, Write},
        path::{Path, PathBuf},
        process::{Command, Stdio},
        thread,
        time::{Duration, Instant},
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, WAIT_OBJECT_0},
        Storage::FileSystem::SYNCHRONIZE,
        System::{
            Registry::{
                HKEY_CURRENT_USER, REG_SZ, RegCloseKey, RegCreateKeyW, RegDeleteValueW,
                RegSetValueExW,
            },
            Threading::{OpenProcess, WaitForSingleObject},
        },
        UI::WindowsAndMessaging::{MB_ICONERROR, MB_OK, MessageBoxW},
    };

    const RUN_ONCE: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce";
    const RUN_ONCE_NAME: &str = "B6HCoreUpdateRecovery";
    #[cfg(feature = "update-test-keys")]
    const TEST_PUBLIC_KEY: &[u8; 32] = &[
        0xae, 0x0e, 0x54, 0xc0, 0x09, 0xc0, 0x7d, 0x5c, 0x26, 0x15, 0x0d, 0x1f, 0x4c, 0x91, 0x0a,
        0x5c, 0xb5, 0x0c, 0x9b, 0xcb, 0x71, 0x4f, 0x40, 0xb3, 0x08, 0xae, 0xc0, 0x40, 0xba, 0x1a,
        0xcc, 0xbf,
    ];

    fn key_for(id: &str) -> Result<Vec<u8>, String> {
        #[cfg(feature = "update-test-keys")]
        if id == "local-test-only" {
            return Ok(TEST_PUBLIC_KEY.to_vec());
        }
        let roots = option_env!("B6H_UPDATE_TRUST_ROOTS")
            .ok_or("No production update trust roots configured.")?;
        let roots: Value =
            serde_json::from_str(roots).map_err(|_| "Production trust roots are invalid.")?;
        let encoded = roots
            .get(id)
            .and_then(Value::as_str)
            .ok_or("Installer signing key is not trusted.")?;
        let key = hex::decode(encoded).map_err(|_| "Production trust root is invalid.")?;
        if key.len() != 32 {
            return Err("Production trust root has an invalid length.".into());
        }
        Ok(key)
    }

    fn verify_installer(state: &Path, generation: &str) -> Result<(PathBuf, String), String> {
        if generation.is_empty() || generation.contains(['/', '\\', ':']) {
            return Err("Invalid Core generation.".into());
        }
        let dir = state.join("generations/core").join(generation);
        let bytes = fs::read(dir.join("manifest.json")).map_err(|e| e.to_string())?;
        if bytes.len() > 1024 * 1024 {
            return Err("Core manifest exceeds size limit.".into());
        }
        let sig = fs::read_to_string(dir.join("manifest.sig")).map_err(|e| e.to_string())?;
        let manifest: Value =
            serde_json::from_slice(&bytes).map_err(|_| "Core manifest is invalid.")?;
        if manifest["component"] != "core"
            || manifest["platform"] != "windows"
            || manifest["arch"] != "x86_64"
            || manifest["files"]
                .as_array()
                .is_none_or(|files| files.len() != 1)
        {
            return Err("Core manifest is incompatible.".into());
        }
        let key = key_for(
            manifest["keyId"]
                .as_str()
                .ok_or("Core signing key ID is missing.")?,
        )?;
        let signature = STANDARD
            .decode(sig.trim())
            .map_err(|_| "Core signature is invalid.")?;
        UnparsedPublicKey::new(&ED25519, &key)
            .verify(&bytes, &signature)
            .map_err(|_| "Core signature verification failed.")?;
        let item = &manifest["files"][0];
        let relative = item["path"]
            .as_str()
            .ok_or("Core installer path is invalid.")?;
        if !relative.to_ascii_lowercase().ends_with(".exe") || relative.contains(['/', '\\', ':']) {
            return Err("Core installer path is unsafe.".into());
        }
        let setup = dir.join(relative);
        let expected = item["sha256"]
            .as_str()
            .ok_or("Core installer hash is missing.")?;
        let mut file = File::open(&setup).map_err(|e| e.to_string())?;
        let mut hash = Sha256::new();
        let mut chunk = [0u8; 64 * 1024];
        loop {
            let n = file.read(&mut chunk).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            hash.update(&chunk[..n]);
        }
        if hex::encode(hash.finalize()) != expected {
            return Err("Core installer SHA-256 verification failed.".into());
        }
        verify_x64_pe(&setup)?;
        let version = manifest["version"]
            .as_str()
            .ok_or("Core version is missing.")?
            .to_owned();
        if file_version(&setup)? != version {
            return Err("Core installer version does not match its signed manifest.".into());
        }
        Ok((setup, version))
    }

    fn verify_x64_pe(path: &Path) -> Result<(), String> {
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        let mut dos = [0u8; 64];
        file.read_exact(&mut dos)
            .map_err(|_| "Installer is not a PE executable.")?;
        if &dos[..2] != b"MZ" {
            return Err("Installer is not a Windows executable.".into());
        }
        use std::io::{Seek, SeekFrom};
        file.seek(SeekFrom::Start(
            u32::from_le_bytes(dos[0x3c..0x40].try_into().unwrap()) as u64,
        ))
        .map_err(|e| e.to_string())?;
        let mut header = [0u8; 6];
        file.read_exact(&mut header)
            .map_err(|_| "Installer PE header is invalid.")?;
        let machine = u16::from_le_bytes([header[4], header[5]]);
        if &header[..4] != b"PE\0\0" || !matches!(machine, 0x014c | 0x8664) {
            return Err("Core package must contain a supported Windows installer.".into());
        }
        Ok(())
    }

    fn file_version(path: &Path) -> Result<String, String> {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
        };
        let name: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let size = unsafe { GetFileVersionInfoSizeW(name.as_ptr(), std::ptr::null_mut()) };
        if size == 0 {
            return Err("Installer version resource is missing.".into());
        }
        let mut bytes = vec![0u8; size as usize];
        if unsafe { GetFileVersionInfoW(name.as_ptr(), 0, size, bytes.as_mut_ptr().cast()) } == 0 {
            return Err("Installer version resource is invalid.".into());
        }
        #[repr(C)]
        struct Fixed {
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
        let root = [92u16, 0];
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
            || length < std::mem::size_of::<Fixed>() as u32
        {
            return Err("Installer fixed version is invalid.".into());
        }
        let fixed = unsafe { &*pointer.cast::<Fixed>() };
        Ok(format!(
            "{}.{}.{}",
            fixed.file_ms >> 16,
            fixed.file_ms & 0xffff,
            fixed.file_ls >> 16
        ))
    }

    fn write_json(path: &Path, value: &Value) -> Result<(), String> {
        let temp = path.with_extension("tmp");
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&temp)
            .map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec(value).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(temp, path).map_err(|e| e.to_string())
    }

    fn copy_tree(source: &Path, destination: &Path, preserve_webview: bool) -> Result<(), String> {
        fs::create_dir_all(destination).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let name = entry.file_name();
            if preserve_webview && name.to_string_lossy().ends_with(".WebView2") {
                continue;
            }
            let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
            if metadata.file_type().is_symlink() {
                return Err(
                    "Reparse points in the installation directory prevent a safe Core update."
                        .into(),
                );
            }
            let target = destination.join(name);
            if metadata.is_dir() {
                copy_tree(&path, &target, false)?;
            } else if metadata.is_file() {
                fs::copy(path, target).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    fn clear_install(install: &Path) -> Result<(), String> {
        for entry in fs::read_dir(install).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if entry.file_name().to_string_lossy().ends_with(".WebView2") {
                continue;
            }
            let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
            if metadata.file_type().is_symlink() {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            } else if metadata.is_dir() {
                fs::remove_dir_all(path).map_err(|e| e.to_string())?;
            } else {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    fn restore(install: &Path, backup: &Path) -> Result<(), String> {
        #[cfg(feature = "update-test-keys")]
        if std::env::var_os("B6H_TEST_FAIL_CORE_RESTORE").is_some() {
            return Err("Injected Core restore failure.".into());
        }
        clear_install(install)?;
        copy_tree(backup, install, false)
    }

    fn remove_file_if_exists(path: &Path) -> Result<(), String> {
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }

    fn remove_dir_if_exists(path: &Path) -> Result<(), String> {
        match fs::remove_dir_all(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }

    fn clear_readiness_markers(state: &Path) -> Result<(), String> {
        let entries = match fs::read_dir(state) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error.to_string()),
        };
        for entry in entries {
            let entry = entry.map_err(|error| error.to_string())?;
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with("core-ready-")
                && entry
                    .file_type()
                    .map_err(|error| error.to_string())?
                    .is_file()
            {
                fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
            }
        }
        Ok(())
    }

    fn valid_nonce(nonce: &str) -> bool {
        nonce.len() == 36
            && nonce.bytes().enumerate().all(|(index, byte)| {
                if [8, 13, 18, 23].contains(&index) {
                    byte == b'-'
                } else {
                    byte.is_ascii_hexdigit()
                }
            })
    }

    fn read_transaction(state: &Path) -> Result<Value, String> {
        let bytes = fs::read(state.join("core-transaction.json"))
            .map_err(|error| format!("Core transaction journal is unavailable: {error}"))?;
        serde_json::from_slice(&bytes).map_err(|_| "Core transaction journal is invalid.".into())
    }

    fn save_transaction(state: &Path, transaction: &Value) -> Result<(), String> {
        write_json(&state.join("core-transaction.json"), transaction)
    }

    fn set_phase(state: &Path, transaction: &mut Value, phase: &str) -> Result<(), String> {
        transaction["phase"] = json!(phase);
        save_transaction(state, transaction)
    }

    fn validate_transaction(
        transaction: &Value,
        phase: &str,
        action: &str,
        nonce: &str,
        version: &str,
    ) -> Result<(), String> {
        if transaction["phase"] != phase
            || transaction["action"] != action
            || transaction["nonce"] != nonce
            || transaction["version"] != version
            || !valid_nonce(nonce)
        {
            return Err("Core update transaction identity does not match.".into());
        }
        Ok(())
    }

    fn restore_previous_rollback(state: &Path, transaction: &Value) -> Result<(), String> {
        let old = state.join("core-rollback.old");
        let previous = state.join("core-rollback");
        if old.is_dir() {
            remove_dir_if_exists(&previous)?;
            fs::rename(&old, &previous).map_err(|error| error.to_string())?;
        } else if transaction["rollbackSnapshotExisted"] == false {
            remove_dir_if_exists(&previous)?;
            remove_file_if_exists(&state.join("core-rollback-version"))?;
        }
        Ok(())
    }

    fn finish_recovery(state: &Path, transaction_path: &Path) -> Result<(), String> {
        for name in ["core-next.tmp", "core-rollback.new", "core-rollback.old"] {
            remove_dir_if_exists(&state.join(name))?;
        }
        remove_file_if_exists(&state.join("core-pending.json"))?;
        clear_readiness_markers(state)?;
        remove_dir_if_exists(&state.join("core-next"))?;
        remove_file_if_exists(transaction_path)
    }

    fn prepare_rollback(state: &Path, backup: &Path) -> Result<(), String> {
        let next = state.join("core-rollback.new");
        let old = state.join("core-rollback.old");
        let previous = state.join("core-rollback");
        let _ = fs::remove_dir_all(&next);
        let _ = fs::remove_dir_all(&old);
        copy_tree(backup, &next, false)?;
        if previous.exists() {
            fs::rename(&previous, &old).map_err(|e| e.to_string())?;
        }
        if let Err(error) = fs::rename(&next, &previous) {
            if old.exists() && !previous.exists() {
                let _ = fs::rename(&old, &previous);
            }
            return Err(error.to_string());
        }
        Ok(())
    }

    fn commit_transaction(state: &Path, rollback_version: &str) -> Result<(), String> {
        let transaction_path = state.join("core-transaction.json");
        let mut transaction = read_transaction(state)?;
        transaction["phase"] = json!("committed");
        transaction["rollbackVersion"] = json!(rollback_version);
        save_transaction(state, &transaction)?;
        fs::write(state.join("core-rollback-version"), rollback_version)
            .map_err(|e| e.to_string())?;
        finish_commit(state, &transaction_path)
    }

    fn finish_commit(state: &Path, transaction_path: &Path) -> Result<(), String> {
        for name in ["core-next.tmp", "core-rollback.old", "core-rollback.new"] {
            remove_dir_if_exists(&state.join(name))?;
        }
        remove_dir_if_exists(&state.join("generations/core"))?;
        remove_file_if_exists(&state.join("core-pending.json"))?;
        clear_readiness_markers(state)?;
        remove_dir_if_exists(&state.join("core-next"))?;
        remove_file_if_exists(transaction_path)?;
        clear_recovery()
    }

    fn report_error(message: &str) {
        #[cfg(feature = "update-test-keys")]
        if std::env::var_os("B6H_TEST_SUPPRESS_UPDATE_ERROR").is_some() {
            return;
        }
        let text: Vec<u16> = message.encode_utf16().chain(Some(0)).collect();
        let title: Vec<u16> = "B6H Core Update".encode_utf16().chain(Some(0)).collect();
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                text.as_ptr(),
                title.as_ptr(),
                MB_OK | MB_ICONERROR,
            )
        };
    }

    fn wait_for_exit(pid: u32) -> Result<(), String> {
        let process = unsafe { OpenProcess(SYNCHRONIZE, 0, pid) };
        if process.is_null() {
            return Ok(());
        }
        let result = unsafe { WaitForSingleObject(process, u32::MAX) };
        unsafe {
            CloseHandle(process);
        }
        if result == WAIT_OBJECT_0 {
            Ok(())
        } else {
            Err("Could not wait for B6H to close.".into())
        }
    }

    fn register_recovery(helper: &Path, state: &Path, install: &Path) -> Result<(), String> {
        #[cfg(feature = "update-test-keys")]
        if std::env::var_os("B6H_TEST_SKIP_RUNONCE").is_some() {
            return Ok(());
        }
        let subkey: Vec<u16> = RUN_ONCE.encode_utf16().chain(Some(0)).collect();
        let mut key = std::ptr::null_mut();
        let status = unsafe { RegCreateKeyW(HKEY_CURRENT_USER, subkey.as_ptr(), &mut key) };
        if status != 0 {
            return Err(format!("Could not register Core recovery ({status})."));
        }
        let command = format!(
            "\"{}\" recover \"{}\" \"{}\"",
            helper.display(),
            state.display(),
            install.display()
        );
        let value: Vec<u16> = command.encode_utf16().chain(Some(0)).collect();
        let name: Vec<u16> = RUN_ONCE_NAME.encode_utf16().chain(Some(0)).collect();
        let status = unsafe {
            RegSetValueExW(
                key,
                name.as_ptr(),
                0,
                REG_SZ,
                value.as_ptr().cast(),
                (value.len() * 2) as u32,
            )
        };
        unsafe {
            RegCloseKey(key);
        }
        if status != 0 {
            return Err(format!("Could not persist Core recovery ({status})."));
        }
        Ok(())
    }

    fn clear_recovery() -> Result<(), String> {
        #[cfg(feature = "update-test-keys")]
        if std::env::var_os("B6H_TEST_SKIP_RUNONCE").is_some() {
            return Ok(());
        }
        let subkey: Vec<u16> = RUN_ONCE.encode_utf16().chain(Some(0)).collect();
        let name: Vec<u16> = RUN_ONCE_NAME.encode_utf16().chain(Some(0)).collect();
        let mut key = std::ptr::null_mut();
        let status = unsafe { RegCreateKeyW(HKEY_CURRENT_USER, subkey.as_ptr(), &mut key) };
        if status != 0 {
            return Err(format!(
                "Could not open Core recovery registration ({status})."
            ));
        }
        let status = unsafe { RegDeleteValueW(key, name.as_ptr()) };
        unsafe { RegCloseKey(key) };
        if status != 0 && status != 2 {
            return Err(format!(
                "Could not clear Core recovery registration ({status})."
            ));
        }
        Ok(())
    }

    fn launch_and_wait(
        exe: &Path,
        state: &Path,
        nonce: &str,
        version: &str,
        action: &str,
    ) -> Result<(), String> {
        let transaction = read_transaction(state)?;
        validate_transaction(&transaction, "awaiting-ready", action, nonce, version)?;
        let ready = state.join(format!("core-ready-{nonce}"));
        remove_file_if_exists(&ready)?;
        #[cfg(feature = "update-test-keys")]
        if std::env::var_os("B6H_TEST_FAIL_CORE_LAUNCH").is_some() {
            return Err("Injected B6H launch failure.".into());
        }
        let mut child = Command::new(exe)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("B6H restart failed: {e}"))?;
        #[cfg(feature = "update-test-keys")]
        let timeout = std::env::var("B6H_TEST_CORE_READY_TIMEOUT_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(45u64);
        #[cfg(not(feature = "update-test-keys"))]
        let timeout = 120u64;
        let deadline = Instant::now() + Duration::from_secs(timeout);
        while Instant::now() < deadline {
            let current = read_transaction(state)?;
            validate_transaction(&current, "awaiting-ready", action, nonce, version)?;
            if fs::read_to_string(&ready).is_ok_and(|value| value == version) {
                return Ok(());
            }
            if child.try_wait().map_err(|e| e.to_string())?.is_some() {
                break;
            }
            thread::sleep(Duration::from_millis(250));
        }
        let pid = child.id();
        let _ = Command::new("taskkill.exe")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        Err("B6H did not report readiness before the Core update timeout.".into())
    }

    #[cfg(feature = "update-test-keys")]
    fn pause_after_install_for_test(state: &Path, nonce: &str) {
        if std::env::var_os("B6H_TEST_PAUSE_CORE_AFTER_INSTALL").is_none() {
            return;
        }
        let marker = state.join(format!("core-ready-testpause-{nonce}"));
        if fs::write(&marker, b"paused").is_ok() {
            while marker.exists() {
                thread::sleep(Duration::from_millis(100));
            }
        }
    }

    fn apply(args: &[String]) -> Result<(), String> {
        if args.len() != 10 {
            return Err("Invalid Core update arguments.".into());
        }
        let state = PathBuf::from(&args[2]);
        let generation = &args[3];
        let install = PathBuf::from(&args[4]);
        let exe = PathBuf::from(&args[5]);
        let parent = args[6]
            .parse::<u32>()
            .map_err(|_| "Invalid B6H process ID.")?;
        let nonce = &args[7];
        let version = &args[8];
        if args[9] != "--confirmed" {
            return Err("Core update confirmation is missing.".into());
        }
        let mut transaction = read_transaction(&state)?;
        validate_transaction(&transaction, "prepared", "upgrade", nonce, version)?;
        if transaction["generation"] != *generation {
            return Err("Core generation does not match its transaction.".into());
        }
        let (setup, verified_version) = verify_installer(&state, generation)?;
        if &verified_version != version {
            return Err("Core update version changed after confirmation.".into());
        }
        if exe.parent() != Some(install.as_path()) || !exe.is_file() {
            return Err("Existing B6H installation path could not be verified.".into());
        }
        let helper = std::env::current_exe().map_err(|e| e.to_string())?;
        let backup = state.join("core-next");
        let temp = state.join("core-next.tmp");
        let _ = fs::remove_dir_all(&temp);
        fs::create_dir_all(&state).map_err(|e| e.to_string())?;
        copy_tree(&install, &temp, true)?;
        fs::rename(&temp, &backup).map_err(|e| e.to_string())?;
        let previous_version = transaction["previousVersion"]
            .as_str()
            .ok_or("Previous Core version metadata is missing.")?
            .to_owned();
        transaction["backup"] = json!("core-next");
        set_phase(&state, &mut transaction, "installing")?;
        register_recovery(&helper, &state, &install)?;
        wait_for_exit(parent)?;
        #[cfg(feature = "update-test-keys")]
        let status = if std::env::var_os("B6H_TEST_FAIL_CORE_INSTALLER").is_some() {
            Command::new("cmd.exe")
                .args(["/C", "exit", "/B", "1"])
                .status()
                .map_err(|error| error.to_string())?
        } else {
            Command::new(&setup)
                .arg("/S")
                .arg(format!("/D={}", install.display()))
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map_err(|error| error.to_string())?
        };
        #[cfg(not(feature = "update-test-keys"))]
        let status = Command::new(&setup)
            .arg("/S")
            .arg(format!("/D={}", install.display()))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|error| error.to_string())?;
        if !status.success() || file_version(&exe).as_deref() != Ok(version) {
            return Err(
                "Core installer failed; recovery will restore the previous installation.".into(),
            );
        }
        set_phase(&state, &mut transaction, "awaiting-ready")?;
        #[cfg(feature = "update-test-keys")]
        pause_after_install_for_test(&state, nonce);
        launch_and_wait(&exe, &state, nonce, version, "upgrade")?;
        prepare_rollback(&state, &backup)?;
        commit_transaction(&state, &previous_version)
    }

    fn rollback(args: &[String]) -> Result<(), String> {
        if args.len() != 8 {
            return Err("Invalid Core rollback arguments.".into());
        }
        let state = PathBuf::from(&args[2]);
        let install = PathBuf::from(&args[3]);
        let exe = PathBuf::from(&args[4]);
        let parent = args[5]
            .parse::<u32>()
            .map_err(|_| "Invalid B6H process ID.")?;
        let nonce = &args[6];
        if args[7] != "--confirmed" {
            return Err("Core rollback confirmation is missing.".into());
        }
        let mut transaction = read_transaction(&state)?;
        let expected_version = transaction["version"]
            .as_str()
            .ok_or("Core rollback version is missing.")?
            .to_owned();
        validate_transaction(
            &transaction,
            "prepared",
            "rollback",
            nonce,
            &expected_version,
        )?;
        let replacement_version = transaction["previousVersion"]
            .as_str()
            .ok_or("Current Core version is missing.")?
            .to_owned();
        let backup = state.join("core-next");
        let temp = state.join("core-next.tmp");
        let _ = fs::remove_dir_all(&temp);
        copy_tree(&install, &temp, true)?;
        fs::rename(&temp, &backup).map_err(|e| e.to_string())?;
        let recovery = std::env::current_exe().map_err(|e| e.to_string())?;
        register_recovery(&recovery, &state, &install)?;
        wait_for_exit(parent)?;
        let previous = state.join("core-rollback");
        set_phase(&state, &mut transaction, "installing")?;
        restore(&install, &previous)?;
        set_phase(&state, &mut transaction, "awaiting-ready")?;
        #[cfg(feature = "update-test-keys")]
        pause_after_install_for_test(&state, nonce);
        launch_and_wait(&exe, &state, nonce, &expected_version, "rollback")?;
        prepare_rollback(&state, &backup)?;
        commit_transaction(&state, &replacement_version)
    }

    fn recover(args: &[String]) -> Result<(), String> {
        let result = recover_inner(args);
        if result.is_err() && args.len() >= 4 {
            if let Ok(helper) = std::env::current_exe() {
                let _ = register_recovery(&helper, Path::new(&args[2]), Path::new(&args[3]));
            }
        }
        result
    }

    fn recover_inner(args: &[String]) -> Result<(), String> {
        if args.len() < 4 {
            return Err("Invalid Core recovery arguments.".into());
        }
        let state = PathBuf::from(&args[2]);
        let install = PathBuf::from(&args[3]);
        let backup = state.join("core-next");
        let transaction_path = state.join("core-transaction.json");
        let transaction = match read_transaction(&state) {
            Ok(transaction) => transaction,
            Err(_error) if !transaction_path.exists() => {
                clear_readiness_markers(&state)?;
                clear_recovery()?;
                return Ok(());
            }
            Err(error) => return Err(error),
        };
        let phase = transaction["phase"]
            .as_str()
            .ok_or("Core transaction phase is missing.")?;
        if phase == "committed" {
            let version = transaction["rollbackVersion"]
                .as_str()
                .ok_or("Committed Core rollback version is missing.")?;
            fs::write(state.join("core-rollback-version"), version)
                .map_err(|error| error.to_string())?;
            finish_commit(&state, &transaction_path)?;
            let _ = Command::new(install.join("b6h.exe")).spawn();
            return Ok(());
        }
        if phase == "recovered" || phase == "cancelled" {
            finish_recovery(&state, &transaction_path)?;
            clear_recovery()?;
            let _ = Command::new(install.join("b6h.exe")).spawn();
            return Ok(());
        }
        if !backup.is_dir() {
            if phase == "prepared" {
                let mut transaction = transaction;
                set_phase(&state, &mut transaction, "cancelled")?;
                finish_recovery(&state, &transaction_path)?;
                clear_recovery()?;
                let _ = Command::new(install.join("b6h.exe")).spawn();
                return Ok(());
            }
            return Err(
                "Core recovery snapshot is missing; transaction state was preserved.".into(),
            );
        }
        let previous_version = transaction["previousVersion"]
            .as_str()
            .ok_or("Previous Core version metadata is missing.")?;
        if let Err(error) = restore(&install, &backup) {
            return Err(format!(
                "Could not restore Core {previous_version}; recovery journal and backup were preserved: {error}"
            ));
        }
        let exe = install.join("b6h.exe");
        if file_version(&exe).as_deref() != Ok(previous_version) {
            return Err("Restored Core version did not match the recovery journal; recovery state was preserved.".into());
        }
        restore_previous_rollback(&state, &transaction)?;
        let mut transaction = transaction;
        set_phase(&state, &mut transaction, "recovered")?;
        finish_recovery(&state, &transaction_path)?;
        clear_recovery()?;
        if args.get(4).map(String::as_str) != Some("--quiet") {
            report_error("B6H Core update failed. The previous installation was restored.");
        }
        let _ = Command::new(exe).spawn();
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn root() -> PathBuf {
            std::env::temp_dir().join(format!(
                "b6h-core-recovery-test-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ))
        }

        #[test]
        fn transaction_identity_requires_phase_action_nonce_and_version() {
            let nonce = "7c179920-ced6-4588-9dc8-714044a8169d";
            let transaction = json!({"phase":"awaiting-ready","action":"upgrade","nonce":nonce,"version":"3.0.1"});
            assert!(
                validate_transaction(&transaction, "awaiting-ready", "upgrade", nonce, "3.0.1")
                    .is_ok()
            );
            assert!(
                validate_transaction(&transaction, "awaiting-ready", "rollback", nonce, "3.0.1")
                    .is_err()
            );
            assert!(
                validate_transaction(&transaction, "awaiting-ready", "upgrade", nonce, "3.0.0")
                    .is_err()
            );
            assert!(
                validate_transaction(&transaction, "installing", "upgrade", nonce, "3.0.1")
                    .is_err()
            );
            assert!(
                validate_transaction(
                    &transaction,
                    "awaiting-ready",
                    "upgrade",
                    "../../escape",
                    "3.0.1"
                )
                .is_err()
            );
        }

        #[test]
        fn terminal_recovery_cleanup_is_idempotent_and_removes_markers() {
            let root = root();
            fs::create_dir_all(root.join("core-next")).unwrap();
            fs::create_dir_all(root.join("core-next.tmp")).unwrap();
            fs::create_dir_all(root.join("core-rollback.new")).unwrap();
            fs::create_dir_all(root.join("core-rollback.old")).unwrap();
            fs::write(root.join("core-pending.json"), b"pending").unwrap();
            fs::write(root.join("core-ready-stale"), b"3.0.1").unwrap();
            let journal = root.join("core-transaction.json");
            fs::write(&journal, b"{}").unwrap();
            finish_recovery(&root, &journal).unwrap();
            finish_recovery(&root, &journal).unwrap();
            for name in [
                "core-next",
                "core-next.tmp",
                "core-rollback.new",
                "core-rollback.old",
                "core-pending.json",
                "core-ready-stale",
                "core-transaction.json",
            ] {
                assert!(!root.join(name).exists(), "left {name}");
            }
            let _ = fs::remove_dir_all(root);
        }

        #[test]
        fn restore_failure_preserves_journal_backup_and_pending_state() {
            let root = root();
            let state = root.join("updates");
            let install = root.join("install");
            fs::create_dir_all(state.join("core-next")).unwrap();
            fs::create_dir_all(&install).unwrap();
            fs::write(state.join("core-next/b6h.exe"), b"previous executable").unwrap();
            fs::write(install.join("b6h.exe"), b"current executable").unwrap();
            fs::write(
                state.join("core-transaction.json"),
                serde_json::to_vec(&json!({"phase":"awaiting-ready","action":"upgrade","version":"3.0.1","previousVersion":"3.0.0","nonce":"7c179920-ced6-4588-9dc8-714044a8169d","backup":"core-next","rollbackSnapshotExisted":false})).unwrap(),
            ).unwrap();
            fs::write(state.join("core-pending.json"), b"pending").unwrap();
            let ready = state.join("core-ready-7c179920-ced6-4588-9dc8-714044a8169d");
            fs::write(&ready, b"3.0.1").unwrap();
            unsafe { std::env::set_var("B6H_TEST_FAIL_CORE_RESTORE", "1") };
            let result = recover_inner(&[
                "runner.exe".into(),
                "recover".into(),
                state.to_string_lossy().into_owned(),
                install.to_string_lossy().into_owned(),
                "--quiet".into(),
            ]);
            unsafe { std::env::remove_var("B6H_TEST_FAIL_CORE_RESTORE") };
            assert!(result.is_err());
            assert!(state.join("core-transaction.json").is_file());
            assert!(state.join("core-next/b6h.exe").is_file());
            assert!(state.join("core-pending.json").is_file());
            assert!(ready.is_file());
            assert_eq!(
                fs::read(install.join("b6h.exe")).unwrap(),
                b"current executable"
            );
            let _ = fs::remove_dir_all(root);
        }
    }

    pub fn run() -> Result<(), String> {
        let args: Vec<String> = std::env::args().collect();
        match args.get(1).map(String::as_str) {
            Some("apply") => {
                let result = apply(&args);
                if let Err(error) = &result {
                    if args.len() > 5 {
                        let recovered = recover(&[
                            args[0].clone(),
                            "recover".into(),
                            args[2].clone(),
                            args[4].clone(),
                            "--quiet".into(),
                        ])
                        .is_ok();
                        report_error(error);
                        if !recovered {
                            report_error(
                                "Core recovery could not complete. The recovery journal and backup were preserved; do not remove them.",
                            );
                        }
                    }
                }
                result
            }
            Some("rollback") => {
                let result = rollback(&args);
                if let Err(error) = &result {
                    if args.len() > 4 {
                        let recovered = recover(&[
                            args[0].clone(),
                            "recover".into(),
                            args[2].clone(),
                            args[3].clone(),
                            "--quiet".into(),
                        ])
                        .is_ok();
                        report_error(error);
                        if !recovered {
                            report_error(
                                "Core recovery could not complete. The recovery journal and backup were preserved; do not remove them.",
                            );
                        }
                    }
                }
                result
            }
            Some("recover") => {
                let result = recover(&args);
                if let Err(error) = &result {
                    report_error(error);
                }
                result
            }
            _ => Err("Unknown B6H update runner operation.".into()),
        }
    }
}

#[cfg(windows)]
fn main() {
    if let Err(error) = windows::run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("B6H Core update runner requires Windows.");
    std::process::exit(1);
}
