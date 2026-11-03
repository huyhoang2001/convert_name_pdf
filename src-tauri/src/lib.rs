mod chat;
mod count;
mod pdf;
mod storage;
mod update;
mod word;
mod workbook;
use std::sync::Arc;
use tauri::{
    Manager, State,
    menu::{MenuBuilder, MenuItem, SubmenuBuilder},
};
use tauri_plugin_dialog::DialogExt;

fn install_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    let vi = storage::language().unwrap_or_else(|_| "EN".into()) == "VI";
    let label = |en: &'static str, vn: &'static str| if vi { vn } else { en };
    let file = SubmenuBuilder::new(app, label("File", "Tệp"))
        .quit()
        .build()?;
    let edit = SubmenuBuilder::new(app, label("Edit", "Chỉnh sửa"))
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view = SubmenuBuilder::new(app, label("View", "Xem"))
        .text("reload", label("Reload", "Tải lại"));
    let devtools = MenuItem::with_id(app, "devtools", label("Developer tools", "Công cụ phát triển"), true, Some("Ctrl+F12"))?;
    let view = view.item(&devtools);
    let view = view
        .separator()
        .text("fullscreen", label("Fullscreen", "Toàn màn hình"))
        .build()?;
    let window = SubmenuBuilder::new(app, label("Window", "Cửa sổ"))
        .minimize()
        .close_window()
        .separator()
        .text(
            "check-update",
            label("Check for updates...", "Kiểm tra bản cập nhật..."),
        )
        .text(
            "install-update",
            label(
                "Install update from file...",
                "Cài đặt bản cập nhật từ tệp...",
            ),
        )
        .build()?;
    let help = SubmenuBuilder::new(app, label("Help", "Trợ giúp"))
        .text("about", label("About B6H", "Giới thiệu B6H"))
        .build()?;
    let menu = MenuBuilder::new(app)
        .items(&[&file, &edit, &view, &window, &help])
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

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
fn get_language() -> Result<String, String> {
    storage::language()
}
#[tauri::command]
fn save_language(language: String, app: tauri::AppHandle) -> Result<String, String> {
    let value = storage::save_language(&language)?;
    install_menu(&app).map_err(|e| e.to_string())?;
    Ok(value)
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
async fn ask_online_chat(
    app: tauri::AppHandle,
    messages: Vec<chat::Message>,
    language: String,
    id: String,
) -> Result<String, String> {
    chat::ask(app, messages, language, id).await
}
#[tauri::command]
fn import_translation_workbook(
    file: String,
    state: State<'_, workbook::State>,
) -> Result<serde_json::Value, String> {
    workbook::import(
        &state,
        "translation",
        &file,
        &storage::selector_settings("translation")?,
    )
}
#[tauri::command]
fn refresh_translation_workbook(
    file: String,
    state: State<'_, workbook::State>,
) -> Result<serde_json::Value, String> {
    workbook::import(
        &state,
        "translation",
        &file,
        &storage::selector_settings("translation")?,
    )
}
#[tauri::command]
fn save_translation_workbook(
    input: serde_json::Value,
    state: State<'_, workbook::State>,
) -> Result<usize, String> {
    workbook::save(
        &state,
        "translation",
        &input,
        &storage::selector_settings("translation")?,
        "VI",
    )
}
#[tauri::command]
fn new_translation_workbook(
    file: String,
    sheets: serde_json::Value,
    state: State<'_, workbook::State>,
) -> Result<serde_json::Value, String> {
    workbook::create(
        &state,
        "translation",
        &file,
        &sheets,
        &storage::selector_settings("translation")?,
        "VI",
    )
}
#[tauri::command]
fn import_signature_workbook(
    file: String,
    state: State<'_, workbook::State>,
) -> Result<serde_json::Value, String> {
    workbook::import(&state, "signature", &file, &storage::signature_settings()?)
}
#[tauri::command]
fn refresh_signature_workbook(
    file: String,
    state: State<'_, workbook::State>,
) -> Result<serde_json::Value, String> {
    workbook::import(&state, "signature", &file, &storage::signature_settings()?)
}
#[tauri::command]
fn save_signature_workbook(
    input: serde_json::Value,
    state: State<'_, workbook::State>,
) -> Result<usize, String> {
    workbook::save(
        &state,
        "signature",
        &input,
        &storage::signature_settings()?,
        "VI",
    )
}
#[tauri::command]
fn new_signature_workbook(
    file: String,
    sheets: serde_json::Value,
    state: State<'_, workbook::State>,
) -> Result<serde_json::Value, String> {
    workbook::create(
        &state,
        "signature",
        &file,
        &sheets,
        &storage::signature_settings()?,
        "VI",
    )
}
#[tauri::command]
fn clear_signature_cache(state: State<'_, workbook::State>) -> Result<bool, String> {
    state.clear("signature")
}
#[tauri::command]
fn import_copies_workbook(
    file: String,
    state: State<'_, workbook::State>,
) -> Result<serde_json::Value, String> {
    workbook::import(
        &state,
        "copies",
        &file,
        &storage::selector_settings("copies")?,
    )
}
#[tauri::command]
fn refresh_copies_workbook(
    file: String,
    state: State<'_, workbook::State>,
) -> Result<serde_json::Value, String> {
    workbook::import(
        &state,
        "copies",
        &file,
        &storage::selector_settings("copies")?,
    )
}
#[tauri::command]
fn save_copies_workbook(
    input: serde_json::Value,
    state: State<'_, workbook::State>,
) -> Result<usize, String> {
    workbook::save(
        &state,
        "copies",
        &input,
        &storage::selector_settings("copies")?,
        "VI",
    )
}
#[tauri::command]
fn new_copies_workbook(
    file: String,
    sheets: serde_json::Value,
    state: State<'_, workbook::State>,
) -> Result<serde_json::Value, String> {
    workbook::create(
        &state,
        "copies",
        &file,
        &sheets,
        &storage::selector_settings("copies")?,
        "VI",
    )
}
#[tauri::command]
fn export_copies_workbook(
    file: String,
    sheets: serde_json::Value,
    state: State<'_, workbook::State>,
) -> Result<String, String> {
    workbook::create(
        &state,
        "copies",
        &file,
        &sheets,
        &storage::selector_settings("copies")?,
        "VI",
    )?;
    Ok(file)
}
#[tauri::command]
fn clear_copies_cache(state: State<'_, workbook::State>) -> Result<bool, String> {
    state.clear("copies")
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
fn install_update_from_file(app: tauri::AppHandle, file: String) -> Result<(), String> {
    update::install_file(&app, &file)
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
    app.get_webview_window("main").ok_or("Main window is unavailable.")?.open_devtools();
    Ok(())
}
#[tauri::command]
fn update_recent_word_document(file: String, action: String, name: Option<String>) -> Result<(), String> {
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
        .manage(Arc::new(pdf::State::default()))
        .manage(workbook::State::default())
        .manage(Arc::new(word::State::default()))
        .setup(|app| {
            install_menu(app.handle())?;
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
                        .add_filter("B6H portable app", &["exe"])
                        .blocking_pick_file()
                    {
                        match file.into_path() {
                            Ok(file) => {
                                if let Err(error) =
                                    update::install_file(app, &file.to_string_lossy())
                                {
                                    app.dialog().message(error).title("B6H").blocking_show();
                                }
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
            get_language,
            save_language,
            get_theme,
            save_theme,
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
            ask_online_chat,
            import_translation_workbook,
            refresh_translation_workbook,
            save_translation_workbook,
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
            mark_update_started,
            get_word_settings,
            get_word_local_fonts,
            save_word_settings,
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
            save_word_document
        ])
        .run(tauri::generate_context!())
        .expect("error while running B6H");
}
