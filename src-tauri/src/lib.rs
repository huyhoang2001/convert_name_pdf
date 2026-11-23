mod chat;
mod count;
mod pdf;
mod printing;
mod storage;
mod update;
mod modular_update;
mod word;
mod workbook;
use std::sync::Arc;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
async fn scan(root: String) -> Result<pdf::Scan, String> {
    tauri::async_runtime::spawn_blocking(move || pdf::scan(&root))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn preview(
    input: pdf::PreviewInput,
    state: State<'_, Arc<pdf::State>>,
) -> Result<pdf::Preview, String> {
    let state = state.inner().clone();
    let destinations: pdf::Destinations =
        serde_json::from_value(storage::destinations()?).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || pdf::preview(&state, input, destinations))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn run_pdf(
    input: serde_json::Value,
    state: State<'_, Arc<pdf::State>>,
) -> Result<pdf::RunResult, String> {
    let token = input
        .get("token")
        .and_then(|v| v.as_str())
        .ok_or("Invalid run request")?
        .to_string();
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || pdf::run(&state, token))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn get_destinations() -> Result<serde_json::Value, String> {
    storage::destinations()
}
#[tauri::command]
fn save_destination(kind: String, value: String) -> Result<serde_json::Value, String> {
    storage::save_destination(&kind, &value)
}
#[tauri::command]
fn default_destinations() -> Result<serde_json::Value, String> {
    storage::default_destinations()
}
#[tauri::command]
fn reset_destination(kind: String) -> Result<serde_json::Value, String> {
    storage::reset_destination(&kind)
}
#[tauri::command]
async fn check_destination(kind: String) -> Result<String, String> {
    let path = storage::destination_path(&kind)?;
    tauri::async_runtime::spawn_blocking(move || storage::check_directory(&path).to_string())
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn open_destination(kind: String) -> Result<(), String> {
    let path = storage::destination_path(&kind)?;
    if !path.is_dir() {
        return Err("Destination folder not found.".into());
    }
    std::process::Command::new("explorer.exe")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn get_language() -> Result<String, String> {
    storage::language()
}
#[tauri::command]
fn save_language(language: String) -> Result<String, String> {
    storage::save_language(&language)
}
#[tauri::command]
fn get_theme() -> Result<String, String> {
    storage::theme()
}
#[tauri::command]
fn save_theme(theme: String) -> Result<String, String> {
    storage::save_theme(&theme)
}
#[tauri::command]
fn get_signature_stt_mode() -> Result<String, String> {
    storage::signature_stt_mode()
}
#[tauri::command]
fn save_signature_stt_mode(mode: String) -> Result<String, String> {
    storage::save_signature_stt_mode(&mode)
}
#[tauri::command]
fn get_translation_stt_mode() -> Result<String, String> {
    storage::translation_stt_mode()
}
#[tauri::command]
fn save_translation_stt_mode(mode: String) -> Result<String, String> {
    storage::save_translation_stt_mode(&mode)
}
#[tauri::command]
fn get_chatbot_visible() -> Result<bool, String> {
    storage::chatbot_visible()
}
#[tauri::command]
fn save_chatbot_visible(visible: bool) -> Result<bool, String> {
    storage::save_chatbot_visible(visible)
}
#[tauri::command]
fn get_home_favorites() -> Result<serde_json::Value, String> {
    storage::home_favorites()
}
#[tauri::command]
fn save_home_favorites(favorites: serde_json::Value) -> Result<serde_json::Value, String> {
    storage::save_home_favorites(favorites)
}
#[tauri::command]
fn get_signature_settings() -> Result<serde_json::Value, String> {
    storage::signature_settings()
}
#[tauri::command]
fn save_signature_settings(labels: serde_json::Value) -> Result<serde_json::Value, String> {
    storage::save_signature_settings(labels)
}
#[tauri::command]
fn get_selector_settings(selector: String) -> Result<serde_json::Value, String> {
    storage::selector_settings(&selector)
}
#[tauri::command]
fn save_selector_settings(
    selector: String,
    labels: serde_json::Value,
) -> Result<serde_json::Value, String> {
    storage::save_selector_settings(&selector, labels)
}
#[tauri::command]
fn get_translations() -> Result<serde_json::Value, String> {
    storage::translations()
}
#[tauri::command]
fn save_translations(sheets: serde_json::Value) -> Result<usize, String> {
    storage::save_translations(sheets)
}
#[tauri::command]
fn clear_translation_cache() -> Result<bool, String> {
    storage::clear_translations()
}
#[tauri::command]
fn read_report(value: String, state: State<'_, Arc<pdf::State>>) -> Result<String, String> {
    let path = std::fs::canonicalize(&value).map_err(|e| e.to_string())?;
    if !state
        .reports
        .lock()
        .map_err(|e| e.to_string())?
        .contains(&path)
    {
        return Err("Invalid report".into());
    }
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}
#[tauri::command]
fn open_path(value: String, state: State<'_, Arc<pdf::State>>) -> Result<(), String> {
    let path = std::fs::canonicalize(&value).map_err(|e| e.to_string())?;
    if !state
        .completed
        .lock()
        .map_err(|e| e.to_string())?
        .contains(&path)
    {
        return Err("Invalid completed path".into());
    }
    std::process::Command::new("explorer.exe")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn get_chat_online_status() -> Result<bool, String> {
    Ok(chat::status()?.configured)
}
#[tauri::command]
fn get_chat_key_status() -> Result<chat::KeyStatus, String> {
    chat::status()
}
#[tauri::command]
fn save_chat_key(value: String) -> Result<chat::KeyStatus, String> {
    chat::save(&value)
}
#[tauri::command]
fn remove_chat_key() -> Result<chat::KeyStatus, String> {
    chat::remove()
}
#[tauri::command]
fn load_chat_session() -> Result<Option<serde_json::Value>, String> {
    storage::chat_session()
}
#[tauri::command]
fn save_chat_session(session: serde_json::Value) -> Result<(), String> {
    storage::save_chat_session(&session)
}
#[tauri::command]
fn reset_chat_session() -> Result<(), String> {
    storage::reset_chat_session()
}
#[tauri::command]
fn cancel_online_chat(id: String) -> Result<(), String> {
    if id.is_empty() || id.len() > 100 {
        return Err("Invalid chat request.".into());
    }
    chat::cancel(&id)
}
#[tauri::command]
async fn ask_online_chat(
    app: tauri::AppHandle,
    messages: Vec<chat::Message>,
    language: String,
    id: String,
    context: Option<chat::Context>,
) -> Result<String, String> {
    chat::ask(app, messages, language, id, context).await
}
async fn run_workbook<T: Send + 'static>(
    app: tauri::AppHandle,
    operation: impl FnOnce(&workbook::State) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let lock = app.state::<workbook::State>().operation_lock();
    let guard = lock.lock_owned().await;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let state = app.state::<workbook::State>();
        operation(&state)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn import_translation_workbook(
    file: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    run_workbook(app, move |state| {
        workbook::import(
            state,
            "translation",
            &file,
            &storage::selector_settings("translation")?,
        )
    })
    .await
}
#[tauri::command]
async fn refresh_translation_workbook(
    file: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    run_workbook(app, move |state| {
        workbook::import(
            state,
            "translation",
            &file,
            &storage::selector_settings("translation")?,
        )
    })
    .await
}
#[tauri::command]
async fn save_translation_workbook(
    input: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    run_workbook(app, move |state| {
        Ok(workbook::save_translation(
            state,
            &input,
            &storage::selector_settings("translation")?,
        ))
    })
    .await
}
#[tauri::command]
fn export_translation_workbook(file: String, data: String, sheets: serde_json::Value) -> Result<String, String> {
    workbook::export_translation(&file, &data, &sheets)
}
#[tauri::command]
async fn new_translation_workbook(
    file: String,
    sheets: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    run_workbook(app, move |state| {
        workbook::create(
            state,
            "translation",
            &file,
            &sheets,
            &storage::selector_settings("translation")?,
            "VI",
        )
    })
    .await
}
#[tauri::command]
async fn import_signature_workbook(
    file: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    run_workbook(app, move |state| {
        workbook::import(state, "signature", &file, &storage::signature_settings()?)
    })
    .await
}
#[tauri::command]
async fn refresh_signature_workbook(
    file: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    run_workbook(app, move |state| {
        workbook::import(state, "signature", &file, &storage::signature_settings()?)
    })
    .await
}
#[tauri::command]
async fn save_signature_workbook(
    input: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    run_workbook(app, move |state| {
        Ok(workbook::save_signature(state, &input, &storage::signature_settings()?))
    })
    .await
}
#[tauri::command]
async fn new_signature_workbook(
    file: String,
    sheets: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    run_workbook(app, move |state| {
        workbook::create(
            state,
            "signature",
            &file,
            &sheets,
            &storage::signature_settings()?,
            "VI",
        )
    })
    .await
}
#[tauri::command]
async fn clear_signature_cache(app: tauri::AppHandle) -> Result<bool, String> {
    run_workbook(app, |state| state.clear("signature")).await
}
#[tauri::command]
async fn import_copies_workbook(
    file: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    run_workbook(app, move |state| {
        workbook::import(
            state,
            "copies",
            &file,
            &storage::selector_settings("copies")?,
        )
    })
    .await
}
#[tauri::command]
async fn refresh_copies_workbook(
    file: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    run_workbook(app, move |state| {
        workbook::import(
            state,
            "copies",
            &file,
            &storage::selector_settings("copies")?,
        )
    })
    .await
}
#[tauri::command]
async fn save_copies_workbook(
    input: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<usize, String> {
    run_workbook(app, move |state| {
        workbook::save(
            state,
            "copies",
            &input,
            &storage::selector_settings("copies")?,
            "VI",
        )
    })
    .await
}
#[tauri::command]
async fn new_copies_workbook(
    file: String,
    sheets: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    run_workbook(app, move |state| {
        workbook::create(
            state,
            "copies",
            &file,
            &sheets,
            &storage::selector_settings("copies")?,
            "VI",
        )
    })
    .await
}
#[tauri::command]
async fn export_copies_workbook(
    file: String,
    sheets: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<String, String> {
    run_workbook(app, move |state| {
        workbook::create(
            state,
            "copies",
            &file,
            &sheets,
            &storage::selector_settings("copies")?,
            "VI",
        )?;
        Ok(file)
    })
    .await
}
#[tauri::command]
async fn clear_copies_cache(app: tauri::AppHandle) -> Result<bool, String> {
    run_workbook(app, |state| state.clear("copies")).await
}
#[tauri::command]
fn parse_translation_rows(rows: Vec<Vec<String>>) -> Result<Option<serde_json::Value>, String> {
    workbook::parse_translation_rows(&rows, &storage::selector_settings("translation")?)
}
#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<bool, String> {
    update::check(app).await
}
#[tauri::command]
async fn install_update_from_file(app: tauri::AppHandle, file: String) -> Result<modular_update::PackageInfo, String> {
    tauri::async_runtime::spawn_blocking(move || modular_update::import_package(app, &file))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn discover_online_updates() -> Result<Vec<modular_update::CatalogPackage>, String> {
    modular_update::discover_online_updates().await
}
#[tauri::command]
async fn download_online_update(app: tauri::AppHandle, component: String, release_id: String) -> Result<modular_update::PackageInfo, String> {
    modular_update::download_online_update(app, component, release_id).await
}
#[tauri::command]
fn cancel_update_import() {
    modular_update::cancel_import();
}
#[tauri::command]
fn get_staged_updates() -> Result<Vec<modular_update::PackageInfo>, String> {
    modular_update::staged_packages()
}
#[tauri::command]
fn get_update_runtime_status() -> Result<modular_update::RuntimeStatus, String> {
    modular_update::runtime_status()
}
#[tauri::command]
fn get_update_history() -> Result<Vec<modular_update::UpdateHistoryEntry>, String> {
    modular_update::update_history()
}
#[tauri::command]
fn activate_update(component: String, release_id: String) -> Result<(), String> {
    modular_update::schedule_package(&component, &release_id)
}
#[tauri::command]
fn rollback_update() -> Result<(), String> {
    modular_update::schedule_rollback()
}
#[tauri::command]
fn rollback_core_update(app: tauri::AppHandle) -> Result<(), String> {
    modular_update::start_core_rollback(app)
}
#[tauri::command]
fn launch_core_update(app: tauri::AppHandle) -> Result<(), String> {
    modular_update::start_core_update(app)
}
#[tauri::command]
fn mark_runtime_ready() -> Result<Option<modular_update::UpdateNotice>, String> {
    modular_update::mark_runtime_ready()
}
#[tauri::command]
fn restart_application(app: tauri::AppHandle) {
    app.restart()
}
#[tauri::command]
fn mark_update_started() -> Result<(), String> {
    update::mark_started()
}
#[tauri::command]
fn get_word_settings() -> Result<serde_json::Value, String> {
    storage::word_settings()
}
#[tauri::command]
fn get_word_local_fonts() -> Vec<serde_json::Value> {
    word::local_fonts()
}
#[tauri::command]
fn save_word_settings(value: serde_json::Value) -> Result<serde_json::Value, String> {
    storage::save_word_settings(value)
}
#[tauri::command]
async fn get_word_printers() -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(printing::printers)
        .await
        .map_err(|error| error.to_string())
}
#[tauri::command]
async fn open_word_printer_properties(printer: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || printing::open_properties(&printer))
        .await
        .map_err(|error| error.to_string())?
}
#[tauri::command]
async fn print_word_pdf(
    pdf_base64: String,
    printer: String,
    mode: String,
    copies: u32,
    collate: bool,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        printing::submit_pdf(&pdf_base64, &printer, &mode, copies, collate)
    })
    .await
    .map_err(|error| error.to_string())?
}
#[tauri::command]
async fn print_word_manual_pass(
    pdf_base64: String,
    printer: String,
    pass: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        printing::submit_manual_pass(&pdf_base64, &printer, &pass)
    })
    .await
    .map_err(|error| error.to_string())?
}
#[tauri::command]
fn get_word_refeed_preferences() -> Result<serde_json::Value, String> {
    printing::refeed_preferences()
}
#[tauri::command]
fn save_word_refeed_preference(
    printer: String,
    face: String,
    leading_edge: String,
) -> Result<serde_json::Value, String> {
    printing::save_refeed_preference(&printer, &face, &leading_edge)
}
#[tauri::command]
async fn get_calendar_data() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(storage::calendar_data)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn save_calendar_data(value: serde_json::Value) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || storage::save_calendar_data(value))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn write_calendar_backup(file: String, contents: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::write(file, contents).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn query_calendar_data(
    start_date: String,
    end_date: String,
    board_view: bool,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        storage::query_calendar_data(start_date, end_date, board_view)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn save_calendar_changes(
    value: serde_json::Value,
    expected_updated_at: std::collections::HashMap<String, Option<String>>,
    deleted_ids: Vec<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        storage::save_calendar_changes(value, expected_updated_at, deleted_ids)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn calendar_rebuild_status() -> Option<serde_json::Value> {
    storage::calendar_rebuild_status()
}
#[tauri::command]
fn cancel_calendar_rebuild() -> Result<(), String> {
    storage::cancel_calendar_rebuild()
}
#[tauri::command]
async fn list_word_templates() -> Result<Vec<word::TemplateEntry>, String> {
    tauri::async_runtime::spawn_blocking(word::templates)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn read_word_template(file: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || word::read_template(&file))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn import_word_template(
    source: String,
    name: String,
    topic: String,
    kind: String,
    replace_existing: bool,
) -> Result<word::TemplateEntry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        word::import_template(&source, &name, &topic, &kind, replace_existing)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn create_word_template(
    bytes_base64: String,
    name: String,
    topic: String,
    kind: String,
) -> Result<word::TemplateEntry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        word::create_template(&bytes_base64, &name, &topic, &kind)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn open_external_word_document(
    file: String,
    state: State<'_, Arc<word::State>>,
) -> Result<serde_json::Value, String> {
    let state = state.inner().clone();
    let file = std::path::PathBuf::from(file);
    tauri::async_runtime::spawn_blocking(move || word::open_external(&state, &file))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn open_recent_word_document(
    file: String,
    state: State<'_, Arc<word::State>>,
) -> Result<serde_json::Value, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || word::open_recent(&state, &file))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn get_recent_word_documents() -> Result<serde_json::Value, String> {
    word::recent()
}
#[tauri::command]
fn set_word_template_pinned(file: String, pinned: bool) -> Result<(), String> {
    word::set_template_pinned(&file, pinned)
}
#[tauri::command]
fn open_recent_word_location(file: String) -> Result<(), String> {
    word::open_recent_location(&file)
}
#[tauri::command]
fn open_word_devtools(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    app.get_webview_window("main")
        .ok_or("Main window is unavailable.")?
        .open_devtools();
    Ok(())
}
#[tauri::command]
fn update_recent_word_document(
    file: String,
    action: String,
    name: Option<String>,
) -> Result<(), String> {
    word::update_recent(&file, &action, name.as_deref())
}
#[tauri::command]
async fn save_word_document(
    input: serde_json::Value,
    state: State<'_, Arc<word::State>>,
) -> Result<serde_json::Value, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || word::save_document(&state, input))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn save_word_draft(input: serde_json::Value) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || word::save_draft(input))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn list_word_drafts() -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(word::list_drafts)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn remove_word_draft(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || word::remove_draft(&id))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn count_scan(root: String) -> Result<count::Scan, String> {
    tauri::async_runtime::spawn_blocking(move || count::scan(&root))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn get_existing_count_report(root: String) -> Result<Option<String>, String> {
    let root = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
    let path = root.join("thong_ke.txt");
    Ok(if path.is_file() {
        Some(std::fs::read_to_string(path).map_err(|e| e.to_string())?)
    } else {
        None
    })
}
#[tauri::command]
async fn save_count_report(
    root: String,
    language: String,
    state: State<'_, Arc<pdf::State>>,
) -> Result<String, String> {
    let path = tauri::async_runtime::spawn_blocking(move || count::report(&root, &language))
        .await
        .map_err(|e| e.to_string())??;
    state
        .reports
        .lock()
        .map_err(|e| e.to_string())?
        .insert(std::fs::canonicalize(&path).map_err(|e| e.to_string())?);
    Ok(path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("tauri", |context, request| {
            let requested = request.uri().path().trim_start_matches('/');
            let path = if requested.is_empty() { "index.html" } else { requested };
            let app = context.app_handle();
            let csp = app.asset_resolver().get("index.html".into()).and_then(|asset| asset.csp_header);
            let origin = if cfg!(windows) { "http://tauri.localhost" } else { "tauri://localhost" };
            let response = match modular_update::active_asset(path) {
                Ok(Some(asset)) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", asset.mime_type)
                    .header("Access-Control-Allow-Origin", origin)
                    .header("Cache-Control", "no-cache")
                    .header("Content-Security-Policy", csp.unwrap_or_default())
                    .body(asset.bytes),
                Ok(None) => match app.asset_resolver().get(path.to_string()) {
                    Some(asset) => {
                        let mut builder = tauri::http::Response::builder()
                            .status(200)
                            .header("Content-Type", asset.mime_type)
                            .header("Access-Control-Allow-Origin", origin)
                            .header("Cache-Control", "no-cache");
                        if let Some(csp) = asset.csp_header { builder = builder.header("Content-Security-Policy", csp); }
                        builder.body(asset.bytes)
                    }
                    None => tauri::http::Response::builder().status(404).body(Vec::new()),
                },
                Err(_) => tauri::http::Response::builder().status(500).body(b"Runtime integrity check failed.".to_vec()),
            };
            response.unwrap_or_else(|_| tauri::http::Response::builder().status(500).body(Vec::new()).unwrap())
        })
        .manage(Arc::new(pdf::State::default()))
        .manage(workbook::State::default())
        .manage(Arc::new(word::State::default()))
        .setup(|app| {
            modular_update::recover_activation().map_err(std::io::Error::other)?;
            app.on_menu_event(|app, event| match event.id().0.as_str() {
                "check-update" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = update::check(app.clone()).await {
                            app.dialog().message(error).title("B6H").blocking_show();
                        }
                    });
                }
                "install-update" => {
                    if let Some(file) = app
                        .dialog()
                        .file()
                        .add_filter("B6H modular update", &["b6hupdate"])
                        .blocking_pick_file()
                    {
                        match file.into_path() {
                            Ok(file) => {
                                let app = app.clone();
                                let error_app = app.clone();
                                let path = file.to_string_lossy().into_owned();
                                tauri::async_runtime::spawn(async move {
                                    if let Ok(Err(error)) = tauri::async_runtime::spawn_blocking(move || modular_update::import_package(app, &path)).await {
                                        error_app.dialog().message(error).title("B6H").blocking_show();
                                    }
                                });
                            }
                            Err(error) => {
                                app.dialog()
                                    .message(error.to_string())
                                    .title("B6H")
                                    .blocking_show();
                            }
                        }
                    }
                }
                "about" => {
                    app.dialog()
                        .message(format!("B6H {}", env!("CARGO_PKG_VERSION")))
                        .title("B6H")
                        .blocking_show();
                }
                "reload" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.reload();
                    }
                }
                "fullscreen" => {
                    if let Some(window) = app.get_webview_window("main") {
                        if let Ok(full) = window.is_fullscreen() {
                            let _ = window.set_fullscreen(!full);
                        }
                    }
                }
                "devtools" => {
                    if let Some(window) = app.get_webview_window("main") {
                        window.open_devtools();
                    }
                }
                _ => (),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan,
            preview,
            run_pdf,
            get_destinations,
            save_destination,
            default_destinations,
            reset_destination,
            check_destination,
            open_destination,
            get_language,
            save_language,
            get_theme,
            save_theme,
            get_signature_stt_mode,
            save_signature_stt_mode,
            get_translation_stt_mode,
            save_translation_stt_mode,
            get_chatbot_visible,
            save_chatbot_visible,
            get_home_favorites,
            save_home_favorites,
            get_signature_settings,
            save_signature_settings,
            get_selector_settings,
            save_selector_settings,
            get_translations,
            save_translations,
            clear_translation_cache,
            read_report,
            open_path,
            count_scan,
            get_existing_count_report,
            save_count_report,
            get_chat_online_status,
            get_chat_key_status,
            save_chat_key,
            remove_chat_key,
            load_chat_session,
            save_chat_session,
            reset_chat_session,
            cancel_online_chat,
            ask_online_chat,
            import_translation_workbook,
            refresh_translation_workbook,
            save_translation_workbook,
            export_translation_workbook,
            new_translation_workbook,
            import_signature_workbook,
            refresh_signature_workbook,
            save_signature_workbook,
            new_signature_workbook,
            clear_signature_cache,
            import_copies_workbook,
            refresh_copies_workbook,
            save_copies_workbook,
            new_copies_workbook,
            export_copies_workbook,
            clear_copies_cache,
            parse_translation_rows,
            check_for_updates,
            install_update_from_file,
            discover_online_updates,
            download_online_update,
            cancel_update_import,
            get_staged_updates,
            get_update_runtime_status,
            get_update_history,
            activate_update,
            rollback_update,
            rollback_core_update,
            launch_core_update,
            mark_runtime_ready,
            restart_application,
            mark_update_started,
            get_word_settings,
            get_word_local_fonts,
            save_word_settings,
            get_word_printers,
            open_word_printer_properties,
            print_word_pdf,
            print_word_manual_pass,
            get_word_refeed_preferences,
            save_word_refeed_preference,
            get_calendar_data,
            save_calendar_data,
            write_calendar_backup,
            query_calendar_data,
            save_calendar_changes,
            calendar_rebuild_status,
            cancel_calendar_rebuild,
            list_word_templates,
            read_word_template,
            import_word_template,
            create_word_template,
            open_external_word_document,
            open_recent_word_document,
            get_recent_word_documents,
            set_word_template_pinned,
            open_recent_word_location,
            open_word_devtools,
            update_recent_word_document,
            save_word_document,
            save_word_draft,
            list_word_drafts,
            remove_word_draft
        ])
        .run(tauri::generate_context!())
        .expect("error while running B6H");
}
