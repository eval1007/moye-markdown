#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod search;

use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf, Prefix},
    sync::Mutex,
};
use tauri::{ipc::Response, Emitter, Manager, State};

const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown", "mdown"];
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg", "ico"];
const WSL_SUGGESTION_LIMIT: usize = 30;

/// Holds the folder the user opened and the current document that may refer to local assets.
#[derive(Default)]
struct Workspace {
    root: Option<PathBuf>,
    current: Option<PathBuf>,
}

/// Stores the active workspace and a file or folder requested before the window is ready.
#[derive(Default)]
struct ReaderState {
    workspace: Mutex<Workspace>,
    pending: Mutex<Option<PathBuf>>,
}

/// Carries Markdown and the paths used to identify the document and select it in the tree.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Document {
    name: String,
    text: String,
    document_id: String,
    workspace_path: Option<String>,
}

/// Describes a lazily loaded child of an open folder.
#[derive(Serialize)]
struct Entry {
    name: String,
    path: String,
    directory: bool,
}

/// Describes a newly opened folder and its immediate children.
#[derive(Serialize)]
struct Folder {
    id: String,
    name: String,
    path: String,
    entries: Vec<Entry>,
}

/// Distinguishes a folder open from a document open without asking the UI to probe the disk.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Opened {
    Document { document: Document },
    Folder { folder: Folder },
}

fn has_extension(path: &Path, extensions: &[&str]) -> bool {
    path.extension().and_then(|value| value.to_str())
        .is_some_and(|ext| extensions.iter().any(|allowed| ext.eq_ignore_ascii_case(allowed)))
}

fn startup_path(args: impl IntoIterator<Item = String>, cwd: &Path) -> Option<PathBuf> {
    args.into_iter().map(|arg| cwd.join(arg))
        .find(|path| has_extension(path, MARKDOWN_EXTENSIONS) || path.is_dir())
}

fn name_of(path: &Path) -> String {
    path.file_name().map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| display_path(path))
}

fn display_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(tail) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{tail}")
    } else {
        value.strip_prefix(r"\\?\").unwrap_or(&value).into()
    }
}

fn tree_path(path: &Path, root: &Path) -> Option<String> {
    path.strip_prefix(root).ok().map(|value| value.to_string_lossy().replace('\\', "/"))
}

fn read_document(path: PathBuf, workspace: &mut Workspace) -> Result<Document, String> {
    if !has_extension(&path, MARKDOWN_EXTENSIONS) {
        return Err("请选择 Markdown 文件（.md、.markdown 或 .mdown）。".into());
    }
    let text = fs::read_to_string(&path).map_err(|error| format!("无法读取 UTF-8 文档：{error}"))?;
    let workspace_path = workspace.root.as_deref().and_then(|root| tree_path(&path, root));
    if workspace_path.is_none() {
        workspace.root = None;
    }
    let name = name_of(&path);
    let document_id = path.to_string_lossy().into_owned();
    workspace.current = Some(path);
    Ok(Document {
        name, text: text.strip_prefix('\u{feff}').unwrap_or(&text).to_owned(),
        document_id, workspace_path,
    })
}

fn list_children(root: &Path, folder: &Path, prefix: &str) -> Result<Vec<Entry>, String> {
    let children = fs::read_dir(folder).map_err(|error| format!("无法读取文件夹：{error}"))?;
    let mut entries = Vec::new();
    for child in children.flatten() {
        let name = child.file_name().to_string_lossy().into_owned();
        if !name.starts_with(prefix) {
            continue;
        }
        let path = child.path();
        let Ok(file_type) = child.file_type() else { continue };
        let directory = file_type.is_dir();
        if !directory && !(file_type.is_file() && has_extension(&path, MARKDOWN_EXTENSIONS)) {
            continue;
        }
        if let Some(path) = tree_path(&path, root) {
            entries.push(Entry { name, path, directory });
        }
    }
    entries.sort_by_cached_key(|entry| (!entry.directory, entry.name.to_lowercase(), entry.name.clone()));
    Ok(entries)
}

fn join_within(base: &Path, root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative);
    if relative.components().any(|part| matches!(part, Component::Prefix(_) | Component::RootDir)) {
        return Err("只支持相对路径。".into());
    }
    // Resolve junctions and '..' before checking the authorized directory boundary.
    let target = base.join(relative).canonicalize().map_err(|_| "找不到相对路径对应的文件。")?;
    if !target.starts_with(root) {
        return Err("文件在已打开的目录之外。".into());
    }
    Ok(target)
}

fn folder_root<'a>(workspace: &'a Workspace, id: &str) -> Result<&'a Path, String> {
    workspace.root.as_deref().filter(|root| root.to_string_lossy() == id)
        .ok_or_else(|| "文件夹已切换，请重试。".into())
}

fn resolve_related(workspace: &Workspace, document_id: &str, path: &str) -> Result<PathBuf, String> {
    let document = workspace.current.as_ref().filter(|current| current.to_string_lossy() == document_id)
        .ok_or("文档已切换，请重试。")?;
    let parent = document.parent().ok_or("找不到文档目录。")?;
    join_within(parent, workspace.root.as_deref().unwrap_or(parent), path)
}

fn open_path_inner(path: PathBuf, state: &ReaderState) -> Result<Opened, String> {
    let path = path.canonicalize().map_err(|error| format!("无法打开路径：{error}"))?;
    let mut workspace = state.workspace.lock().map_err(|_| "无法打开路径。")?;
    if path.is_dir() {
        let entries = list_children(&path, &path, "")?;
        let folder = Folder { id: path.to_string_lossy().into_owned(), name: name_of(&path), path: display_path(&path), entries };
        *workspace = Workspace { root: Some(path), current: None };
        Ok(Opened::Folder { folder })
    } else {
        Ok(Opened::Document { document: read_document(path, &mut workspace)? })
    }
}

/// Opens a file or folder explicitly selected by the reader.
#[tauri::command]
fn open_path(path: PathBuf, state: State<'_, ReaderState>) -> Result<Opened, String> {
    open_path_inner(path, &state)
}

/// Lists only one level of a folder the user expanded, within the current root.
#[tauri::command]
fn list_folder(path: String, folder_id: String, state: State<'_, ReaderState>) -> Result<Vec<Entry>, String> {
    let workspace = state.workspace.lock().map_err(|_| "无法读取文件夹。")?;
    let root = folder_root(&workspace, &folder_id)?;
    let target = join_within(root, root, &path)?;
    list_children(root, &target, "")
}

/// Returns up to 30 matching children of a WSL UNC directory without changing the open workspace.
#[tauri::command]
async fn suggest_wsl_paths(directory: PathBuf, prefix: String) -> Result<Vec<Entry>, String> {
    let Some(Component::Prefix(root)) = directory.components().next() else {
        return Err("请选择 WSL 目录。".into());
    };
    match root.kind() {
        Prefix::UNC(server, _) if server.eq_ignore_ascii_case("wsl.localhost") || server.eq_ignore_ascii_case("wsl$") => {}
        _ => return Err("请选择 WSL 目录。".into()),
    }
    // A WSL share may take time to start; directory I/O must not block the window.
    tauri::async_runtime::spawn_blocking(move || {
        let mut entries = list_children(&directory, &directory, &prefix)?;
        if prefix.is_empty() {
            entries.retain(|entry| !entry.name.starts_with('.'));
        }
        entries.truncate(WSL_SUGGESTION_LIMIT);
        Ok(entries)
    }).await.map_err(|_| "无法读取 WSL 目录。")?
}

/// Searches Markdown paths or contents in the currently open folder.
#[tauri::command]
async fn search_workspace(
    folder_id: String, query: String, contents: bool, state: State<'_, ReaderState>,
) -> Result<search::SearchResults, String> {
    let root = {
        let workspace = state.workspace.lock().map_err(|_| "无法搜索文件夹。")?;
        folder_root(&workspace, &folder_id)?.to_owned()
    };
    tauri::async_runtime::spawn_blocking(move || search::run(&root, &query, contents))
        .await.map_err(|_| "无法搜索文件夹。".into())
}

/// Opens a Markdown leaf from the selected folder, preserving the root.
#[tauri::command]
fn open_tree_document(path: String, folder_id: String, state: State<'_, ReaderState>) -> Result<Document, String> {
    let mut workspace = state.workspace.lock().map_err(|_| "无法打开文档。")?;
    let root = folder_root(&workspace, &folder_id)?;
    let target = join_within(root, root, &path)?;
    read_document(target, &mut workspace)
}

/// Opens a Markdown link relative to the current document within its reading scope.
#[tauri::command]
fn open_related_document(path: String, document_id: String, state: State<'_, ReaderState>) -> Result<Document, String> {
    let mut workspace = state.workspace.lock().map_err(|_| "无法打开文档。")?;
    let target = resolve_related(&workspace, &document_id, &path)?;
    read_document(target, &mut workspace)
}

/// Returns image bytes for a relative reference within the active document's reading scope.
#[tauri::command]
fn read_image(path: String, document_id: String, state: State<'_, ReaderState>) -> Result<Response, String> {
    let workspace = state.workspace.lock().map_err(|_| "无法读取图片。")?;
    let target = resolve_related(&workspace, &document_id, &path)?;
    if !has_extension(&target, IMAGE_EXTENSIONS) {
        return Err("不支持此图片格式。".into());
    }
    let bytes = fs::read(target).map_err(|_| "无法读取图片。")?;
    Ok(Response::new(bytes))
}

/// Reads WSL's distribution names without starting any distro or executing a user command.
#[tauri::command]
async fn wsl_distributions() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let output = std::process::Command::new("wsl.exe")
            .args(["--list", "--quiet"]).creation_flags(CREATE_NO_WINDOW)
            .output().map_err(|_| "无法查询 WSL 发行版。")?;
        if !output.status.success() {
            return Err("未找到可用的 WSL 发行版。".into());
        }
        let text = if output.stdout.contains(&0) {
            let words: Vec<u16> = output.stdout.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
            String::from_utf16_lossy(&words)
        } else {
            String::from_utf8_lossy(&output.stdout).into_owned()
        };
        Ok(text.lines().map(|line| line.trim_matches(['\u{feff}', '\0', '\r', ' ']))
            .filter(|line| !line.is_empty()).map(str::to_owned).collect())
    }
    #[cfg(not(windows))]
    { Ok(Vec::new()) }
}

/// Returns a pending desktop launch path once when the reader is ready.
#[tauri::command]
fn take_pending_path(state: State<'_, ReaderState>) -> Option<PathBuf> {
    state.pending.lock().ok()?.take()
}

fn main() {
    let initial = std::env::current_dir().ok().and_then(|cwd| startup_path(std::env::args().skip(1), &cwd));
    tauri::Builder::default()
        .manage(ReaderState { pending: Mutex::new(initial), ..Default::default() })
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Some(path) = startup_path(args.into_iter().skip(1), Path::new(&cwd)) {
                if let Ok(mut pending) = app.state::<ReaderState>().pending.lock() {
                    *pending = Some(path);
                }
                let _ = app.emit("document-requested", ());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            open_path, list_folder, open_tree_document, open_related_document, read_image,
            wsl_distributions, suggest_wsl_paths, search_workspace, take_pending_path
        ])
        .run(tauri::generate_context!())
        .expect("could not start Moye reader");
}
