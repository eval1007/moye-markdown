import './style.css';
import sampleText from '../samples/reading-demo.md?raw';
import sampleImage from '../samples/reader-mark.svg?url';
import { connectDesktop, desktop, launchExternal, openPath, openRelated, openTreeDocument, pickDocument, pickFolder, readImage, setWindowTitle } from './desktop.js';
import { FileTree } from './file-tree.js';
import { mountWslPicker } from './wsl-picker.js';
import { diagramType, renderDiagram, svgUrl } from './diagrams.js';
import { mountAppMenus } from './app-menus.js';
import { RecentPaths } from './recents.js';
import { localReference, renderMarkdown } from './markdown.js';
import { closeDiagram, showDiagram } from './zoom.js';
import { mountDocumentFind } from './document-find.js';
import { mountWorkspaceSearch } from './workspace-search.js';

const $ = (selector) => document.querySelector(selector);
const article = $('#article');
const reader = $('#reader');
const readerFind = mountDocumentFind($('#document-find'), article, reader);
const notice = $('#notice');
const fileInput = $('#file-input');
const themePicker = $('#theme');
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const fileType = /\.(?:md|markdown|mdown)$/i;
const imageType = { svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', ico: 'image/x-icon' };
const errorText = (error) => error instanceof Error ? error.message : String(error);
const pendingAssets = new Set();
let generation = 0;
let opening = 0;
let current = null;
let panels = [];
let folder = null;
let sidebarMode = 'files';
let sidebarCollapsed = false;
let outlineCount = 0;
const recents = new RecentPaths();
const fileTree = new FileTree($('#file-tree'), (path, folderId) => {
  load(() => openTreeDocument(path, folderId));
});

function report(message = '') {
  notice.textContent = message;
  notice.hidden = !message;
}

function updateTitle(title) {
  document.title = title;
  if (desktop) setWindowTitle(title).catch((error) => report(errorText(error)));
}

function themeValue() {
  return themePicker.value === 'system' ? (systemTheme.matches ? 'dark' : 'light') : themePicker.value;
}

function applyTheme() {
  const theme = themeValue();
  if (document.documentElement.dataset.theme === theme) return;
  document.documentElement.dataset.theme = theme;
  closeDiagram();
  for (const panel of panels) panel.paint();
}

function rememberUrl(url) {
  pendingAssets.add(url);
  return url;
}

function releaseUrl(url) {
  URL.revokeObjectURL(url);
  pendingAssets.delete(url);
}

function imageFailure(img, alt) {
  const fallback = document.createElement('span');
  fallback.className = 'image-failure';
  fallback.textContent = `图片不可用${alt ? `：${alt}` : ''}`;
  img.replaceWith(fallback);
}

async function hydrateImage(img, source, document, version) {
  const alt = img.alt;
  const path = localReference(source);
  let url;
  try {
    if (document.sample && path === 'reader-mark.svg') url = sampleImage;
    else if (document.documentId && path) {
      const bytes = await readImage(path, document.documentId);
      if (version !== generation) return;
      const ext = path.split('.').at(-1).toLowerCase();
      url = rememberUrl(URL.createObjectURL(new Blob([bytes], { type: imageType[ext] ?? `image/${ext}` })));
    }
    if (!url) return imageFailure(img, alt);
    img.addEventListener('error', () => imageFailure(img, alt), { once: true });
    img.src = url;
  } catch {
    if (version === generation) imageFailure(img, alt);
  }
}

function mountDiagram(figure, source, index, version) {
  const kind = diagramType(source);
  const er = kind === 'er';
  figure.classList.toggle('er-diagram', er);
  // This template is constant. Document data is inserted as text or an image URL.
  figure.innerHTML = `<div class="figure-toolbar">
    <span class="figure-label"><span aria-hidden="true">◇</span> Mermaid · 图 ${index + 1}</span>
    <div class="figure-actions">
      <button class="fit-inline">原始大小</button>
      <select aria-label="图 ${index + 1} 的布局"><option value="dagre">Dagre</option><option value="elk">ELK</option></select>
      <button class="expand" aria-label="放大图 ${index + 1}" disabled>放大 ↗</button>
    </div>
  </div><div class="figure-content" aria-live="polite"></div>`;
  const content = figure.querySelector('.figure-content');
  const expand = figure.querySelector('.expand');
  const layout = figure.querySelector('select');
  const inlineFit = figure.querySelector('.fit-inline');
  layout.hidden = !['er', 'flowchart', 'class', 'state'].includes(kind);
  layout.value = ['er', 'flowchart'].includes(kind) ? 'elk' : 'dagre';
  inlineFit.onclick = () => {
    const actual = figure.classList.toggle('actual-size');
    inlineFit.textContent = actual ? '适应宽度' : '原始大小';
  };
  let revision = 0;
  let url;
  let data;

  function expandDiagram() {
    if (data && url) showDiagram(data, url, `Mermaid · 图 ${index + 1}`);
  }
  expand.onclick = expandDiagram;

  async function paint() {
    const request = ++revision;
    const isCurrent = () => version === generation && request === revision;
    expand.disabled = true;
    content.textContent = '正在绘制…';
    content.classList.add('waiting');
    if (url) releaseUrl(url);
    url = undefined;
    data = undefined;
    try {
      const next = await renderDiagram(source, themeValue(), layout.value, er, isCurrent);
      if (!next || !isCurrent()) return;
      data = next;
      url = rememberUrl(svgUrl(data.svg));
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Mermaid 图 ${index + 1}`;
      img.style.width = `${data.width}px`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'figure-image';
      button.setAttribute('aria-label', `查看图 ${index + 1} 大图`);
      button.onclick = expandDiagram;
      button.append(img);
      content.replaceChildren(button);
      expand.disabled = false;
    } catch (error) {
      if (!isCurrent()) return;
      const message = document.createElement('p');
      message.className = 'diagram-error';
      message.textContent = '这张 Mermaid 图无法显示。';
      const details = document.createElement('details');
      const label = document.createElement('summary');
      label.textContent = '查看错误和源码';
      const reason = document.createElement('pre');
      reason.textContent = errorText(error);
      const code = document.createElement('pre');
      code.textContent = source;
      details.append(label, reason, code);
      content.replaceChildren(message, details);
    } finally {
      if (isCurrent()) content.classList.remove('waiting');
    }
  }

  layout.onchange = paint;
  paint();
  return { paint };
}

function updateSidebar() {
  const inFolder = Boolean(folder);
  const showFiles = inFolder && sidebarMode === 'files';
  const available = inFolder || outlineCount > 0;
  const visible = available && !sidebarCollapsed;
  $('#sidebar').hidden = !visible;
  const toggle = $('#toggle-sidebar');
  toggle.disabled = !available;
  toggle.setAttribute('aria-expanded', String(visible));
  toggle.setAttribute('aria-label', visible ? '收起侧栏' : '展开侧栏');
  toggle.title = (visible ? '收起侧栏' : '展开侧栏') + ' (Ctrl+B)';
  $('#sidebar-tabs').hidden = !inFolder;
  $('#tree-pane').hidden = !showFiles;
  $('#outline-pane').hidden = showFiles;
  $('#outline-label').textContent = outlineCount ? '本文目录' : '当前文档没有标题';
  $('#show-tree').setAttribute('aria-pressed', String(showFiles));
  $('#show-outline').setAttribute('aria-pressed', String(!showFiles));
  $('#find-document').hidden = !current;
}

function showFolder(next) {
  ++generation;
  current = null;
  readerFind.close();
  closeDiagram();
  for (const url of pendingAssets) releaseUrl(url);
  panels = [];
  article.replaceChildren();
  article.hidden = true;
  $('#outline').replaceChildren();
  outlineCount = 0;
  folder = next;
  sidebarCollapsed = false;
  sidebarMode = 'files';
  fileTree.setFolder(next);
  recents.add({ kind: 'folder', path: next.id, name: next.name });
  $('#folder-name').textContent = next.name;
  $('#folder-name').title = next.path;
  $('#file-name').textContent = '选择文档';
  $('#file-name').removeAttribute('title');
  updateTitle(next.name + ' · 墨页');
  $('#empty').hidden = false;
  $('#empty-title').textContent = '从左侧选择文档';
  $('#empty-description').textContent = '展开文件夹，点击 Markdown 文件即可阅读。';
  $('#empty-actions').hidden = true;
  reader.scrollTop = 0;
  report('');
  updateSidebar();
}

function showDocument(doc, anchor) {
  const rendered = renderMarkdown(doc.text);
  const version = ++generation;
  current = doc;
  readerFind.close();
  if (doc.documentId) recents.add({ kind: 'document', path: doc.documentId, name: doc.name });
  closeDiagram();
  for (const url of pendingAssets) releaseUrl(url);
  panels = [];

  // Build in a detached template, removing every image URL before the live DOM can fetch it.
  const template = document.createElement('template');
  template.innerHTML = rendered.html;
  const images = [...template.content.querySelectorAll('img')].map((img) => {
    const path = img.getAttribute('src');
    img.removeAttribute('src');
    return [img, path];
  });
  article.replaceChildren(template.content);
  article.hidden = false;
  $('#empty').hidden = true;
  $('#file-name').textContent = doc.workspacePath || doc.name;
  $('#file-name').title = doc.documentId || doc.name;
  updateTitle(`${doc.name} · 墨页`);
  report('');

  const outline = $('#outline');
  outline.replaceChildren(...rendered.headings.map(({ id, level, title }) => {
    const link = document.createElement('a');
    link.href = `#${id}`;
    link.textContent = title;
    link.style.setProperty('--indent', String(Math.max(0, level - 2)));
    link.onclick = (event) => { event.preventDefault(); scrollToHeading(id); };
    return link;
  }));
  outlineCount = rendered.headings.length;
  if (folder && !doc.workspacePath) {
    folder = null;
    fileTree.setFolder(null);
  }
  if (folder) fileTree.select(doc.workspacePath);
  updateSidebar();
  reader.scrollTop = 0;
  if (anchor) scrollToHeading(anchor);
  for (const [img, path] of images) hydrateImage(img, path, doc, version);
  panels = [...article.querySelectorAll('figure[data-diagram]')].map((figure, index) =>
    mountDiagram(figure, rendered.diagrams[Number(figure.dataset.diagram)], index, version),
  );
}

function scrollToHeading(anchor) {
  try {
    const id = decodeURIComponent(anchor);
    const target = document.getElementById(id) ?? document.getElementById(`heading-${id}`);
    if (target && article.contains(target)) target.scrollIntoView({ block: 'start' });
  } catch { /* Malformed fragments do not navigate. */ }
}

async function load(getDocument, anchor, onError = report) {
  const request = ++opening;
  try {
    const result = await getDocument();
    if (!result || request !== opening) return false;
    if (result.kind === 'folder') showFolder(result.folder);
    else showDocument(result.kind === 'document' ? result.document : result, anchor);
    return true;
  } catch (error) {
    if (request === opening) onError(errorText(error));
    return false;
  }
}

function chooseFile() {
  if (desktop) load(pickDocument);
  else fileInput.click();
}

function openBrowserFile(file) {
  if (!file) return;
  if (!fileType.test(file.name)) return report('请选择 Markdown 文件（.md、.markdown 或 .mdown）。');
  load(async () => ({
    name: file.name,
    text: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()),
  }));
}

function dropPaths(paths) {
  if (paths[0]) load(() => openPath(paths[0]));
}

const recentsDialog = $('#recents-dialog');
const recentsError = $('#recents-error');

function renderRecents() {
  const list = recents.list();
  $('#clear-recents').disabled = !list.length;
  $('#recents-list').replaceChildren(...list.map((item) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'recent-row';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const path = document.createElement('span');
    const friendlyPath = item.path.startsWith('\\\\?\\UNC\\')
      ? '\\\\' + item.path.slice(8) : item.path.replace(/^\\\\\?\\/, '');
    path.textContent = (item.kind === 'folder' ? '文件夹 · ' : '文件 · ') + friendlyPath;
    row.title = friendlyPath;
    row.append(name, path);
    row.onclick = async () => {
      recentsError.hidden = true;
      row.disabled = true;
      const opened = await load(() => openPath(item.path), null, (error) => {
        recentsError.textContent = error;
        recentsError.hidden = false;
      });
      row.disabled = false;
      if (opened) recentsDialog.close();
    };
    return row;
  }));
  if (!list.length) $('#recents-list').textContent = '还没有打开记录。';
}

$('#open-recents').onclick = () => {
  renderRecents();
  recentsError.hidden = true;
  recentsDialog.showModal();
};
$('#recents-close').onclick = () => recentsDialog.close();
$('#clear-recents').onclick = () => { recents.clear(); recentsError.hidden = true; renderRecents(); };

const showWslDialog = mountWslPicker($('#wsl-dialog'), (path, onError) => load(() => openPath(path), null, onError));
const showWorkspaceSearch = mountWorkspaceSearch($('#search-dialog'), () => folder, async (match, scope, query, onError) => {
  if (scope !== folder) return false;
  if (!await load(() => openTreeDocument(match.path, scope.id), null, onError)) return false;
  sidebarMode = 'files';
  sidebarCollapsed = false;
  updateSidebar();
  fileTree.reveal(match.path);
  if (match.line) readerFind.show(query, match.line);
  return true;
});

article.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (!link) return;
  event.preventDefault();
  const href = link.getAttribute('href');
  if (href.startsWith('#')) return scrollToHeading(href.slice(1));
  if (/^(?:https?:\/\/|mailto:)/i.test(href)) {
    Promise.resolve(launchExternal(href)).catch((error) => report(errorText(error)));
    return;
  }
  const path = localReference(href);
  if (current?.documentId && path && fileType.test(path)) {
    load(() => openRelated(path, current.documentId), href.split('#')[1]);
  } else {
    report('此链接无法在阅读器内打开。');
  }
});

$('#open-file').onclick = chooseFile;
mountAppMenus(document.querySelector('.topbar'));
$('#toggle-sidebar').onclick = () => { sidebarCollapsed = !sidebarCollapsed; updateSidebar(); };
$('#empty-open').onclick = chooseFile;
$('#open-folder').onclick = $('#empty-folder').onclick = () => load(pickFolder);
$('#open-wsl').onclick = showWslDialog;
$('#find-document').onclick = () => readerFind.show();
$('#open-folder-search').onclick = () => showWorkspaceSearch();
$('#show-tree').onclick = () => { sidebarMode = 'files'; updateSidebar(); };
$('#show-outline').onclick = () => { sidebarMode = 'outline'; updateSidebar(); };
$('#open-sample').onclick = () => load(() => ({ name: '阅读示例.md', text: sampleText, sample: true }));
fileInput.onchange = () => { openBrowserFile(fileInput.files[0]); fileInput.value = ''; };
document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) return;
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  const modal = document.querySelector('dialog[open]');
  if (modifier && key === 'o') {
    event.preventDefault();
    chooseFile();
  } else if (!modal && modifier && key === 'b' && !$('#toggle-sidebar').disabled) {
    event.preventDefault();
    $('#toggle-sidebar').click();
  } else if (!modal && modifier && key === 'f' && !event.shiftKey && current) {
    event.preventDefault();
    readerFind.show();
  } else if (!modal && modifier && (key === 'p' || (key === 'f' && event.shiftKey)) && folder) {
    event.preventDefault();
    showWorkspaceSearch(key === 'p' ? 'filename' : 'contents');
  } else if (!modal && key === 'escape' && !$('#document-find').hidden) {
    event.preventDefault();
    readerFind.close();
    reader.focus({ preventScroll: true });
  }
});
const dropTarget = $('#drop-target');
if (desktop) {
  for (const id of ['#open-folder', '#open-wsl', '#open-recents', '#empty-folder']) $(id).hidden = false;
  $('#empty-title').textContent = '打开 Markdown 文件夹';
  $('#empty-description').textContent = '拖入文件夹或打开 WSL 路径，从文件树选择要读的文档。';
  connectDesktop(
    (path) => load(() => openPath(path)),
    (active) => { dropTarget.hidden = !active; },
    dropPaths,
  ).catch((error) => report(errorText(error)));
} else {
  document.addEventListener('dragover', (event) => {
    if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dropTarget.hidden = false; }
  });
  document.addEventListener('dragleave', (event) => { if (!event.relatedTarget) dropTarget.hidden = true; });
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    dropTarget.hidden = true;
    openBrowserFile(event.dataTransfer.files[0]);
  });
}
themePicker.value = localStorage.getItem('moye-theme') ?? 'system';
themePicker.onchange = () => {
  localStorage.setItem('moye-theme', themePicker.value);
  applyTheme();
};
systemTheme.addEventListener('change', applyTheme);
applyTheme();
