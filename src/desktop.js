import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';

export const desktop = isTauri();
const markdownExtensions = ['md', 'markdown', 'mdown'];

export function setWindowTitle(title) {
  return getCurrentWindow().setTitle(title);
}

export async function pickDocument() {
  const path = await open({
    title: '打开 Markdown 文件',
    filters: [{ name: 'Markdown', extensions: markdownExtensions }],
  });
  return path && openPath(path);
}

export async function pickFolder() {
  const path = await open({ title: '打开 Markdown 文件夹', directory: true });
  return path && openPath(path);
}

export function openPath(path) {
  return invoke('open_path', { path });
}

export function listFolder(path, folderId) {
  return invoke('list_folder', { path, folderId });
}

export function openTreeDocument(path, folderId) {
  return invoke('open_tree_document', { path, folderId });
}

export function listDistributions() {
  return invoke('wsl_distributions');
}

export function suggestWslPaths(directory, prefix) {
  return invoke('suggest_wsl_paths', { directory, prefix });
}

export function searchWorkspace(folderId, query, contents) {
  return invoke('search_workspace', { folderId, query, contents });
}

export function openRelated(path, documentId) {
  return invoke('open_related_document', { path, documentId });
}

export async function readImage(path, documentId) {
  const bytes = await invoke('read_image', { path, documentId });
  return new Uint8Array(bytes);
}

export async function connectDesktop(onPath, onDrag, onDrop) {
  async function consume() {
    const path = await invoke('take_pending_path');
    if (path) onPath(path);
  }
  await listen('document-requested', consume);
  await getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === 'drop') {
      onDrag(false);
      onDrop(payload.paths);
    } else {
      onDrag(payload.type !== 'leave');
    }
  });
  await consume();
}

export function launchExternal(url) {
  if (desktop) return openUrl(url);
  window.open(url, '_blank', 'noopener,noreferrer');
}
