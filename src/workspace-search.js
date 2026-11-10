import { cancelSearch, refreshSearch, searchWorkspace } from './desktop.js';

const TYPE_DELAY = 180;
let nextRequestId = Date.now() * 1000;

/** Controls live filename and source search, and discards batches from replaced requests. */
export function mountWorkspaceSearch(dialog, getFolder, openResult) {
  const form = dialog.querySelector('form');
  const query = dialog.querySelector('input');
  const mode = dialog.querySelector('select');
  const status = dialog.querySelector('#search-status');
  const scope = dialog.querySelector('#search-scope');
  const results = dialog.querySelector('#search-results');
  let revision = 0;
  let activeRequest;
  let timer;
  let composing = false;
  let ready = Promise.resolve();

  function reset() {
    revision++;
    clearTimeout(timer);
    if (activeRequest !== undefined) {
      // Replaced requests must stop scanning, even if they have not produced a hit.
      cancelSearch(activeRequest).catch((error) => console.error('取消搜索失败', error));
      activeRequest = undefined;
    }
    results.replaceChildren();
    status.textContent = '';
  }

  async function search() {
    reset();
    const folder = getFolder();
    const text = query.value.trim();
    if (!text || !folder || !dialog.open) return;
    const request = revision;
    const id = ++nextRequestId;
    const contents = mode.value === 'contents';
    activeRequest = id;
    let count = 0;
    let skippedCount = 0;
    let done = false;
    const current = () => request === revision && dialog.open && folder === getFolder();
    status.textContent = '搜索中…';
    try {
      await ready;
      if (!current()) return;
      await searchWorkspace(folder.id, text, contents, id, ({ matches, limited, skipped, done: finished }) => {
        if (!current()) return;
        count += matches.length;
        skippedCount += skipped;
        done = finished;
        status.textContent = (finished ? (limited ? '显示前 ' + count + ' 条结果' : count ? count + ' 条结果' : '没有匹配结果')
          : '搜索中 · 已找到 ' + count + ' 条结果')
          + (skippedCount ? ' · 跳过 ' + skippedCount + ' 个无法读取或过大的项目' : '');
        const rows = matches.map((match) => {
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'search-result';
          const path = document.createElement('strong');
          path.textContent = match.path + (match.line ? ':' + match.line : '');
          row.title = path.textContent;
          row.append(path);
          if (match.preview) {
            const preview = document.createElement('span');
            preview.textContent = match.preview;
            row.append(preview);
          }
          row.onclick = async () => {
            row.disabled = true;
            const opened = await openResult(match, folder, contents ? text : undefined, (message) => {
              if (current()) status.textContent = message;
            });
            if (opened) dialog.close();
            row.disabled = false;
          };
          return row;
        });
        results.append(...rows);
        if (finished && activeRequest === id) activeRequest = undefined;
      });
    } catch (error) {
      if (current()) status.textContent = String(error);
    } finally {
      // Keep cancellation available until the final channel message arrives.
      if (done && activeRequest === id) activeRequest = undefined;
    }
  }

  function schedule() {
    reset();
    if (query.value.trim()) timer = setTimeout(search, TYPE_DELAY);
  }

  form.onsubmit = (event) => { event.preventDefault(); if (!composing) search(); };
  query.oncompositionstart = () => { composing = true; reset(); };
  query.oninput = (event) => {
    if (event.isComposing) reset();
    else schedule();
  };
  query.oncompositionend = () => { composing = false; schedule(); };
  mode.onchange = () => { updatePlaceholder(); search(); };
  query.onkeydown = (event) => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' && results.firstElementChild) {
      event.preventDefault();
      results.firstElementChild.focus();
    }
  };
  dialog.querySelector('#search-close').onclick = () => dialog.close();
  dialog.onclose = reset;

  function updatePlaceholder() {
    query.placeholder = mode.value === 'contents' ? '输入正文关键词' : '输入文件名或路径，支持模糊匹配';
  }

  return (kind = 'contents') => {
    const folder = getFolder();
    if (!folder) return false;
    reset();
    mode.value = kind;
    updatePlaceholder();
    scope.textContent = folder.path;
    scope.title = folder.path;
    // Refresh before the first filename query so new files on WSL shares are visible.
    ready = refreshSearch();
    ready.catch((error) => { status.textContent = String(error); });
    dialog.showModal();
    query.select();
    schedule();
    return true;
  };
}
