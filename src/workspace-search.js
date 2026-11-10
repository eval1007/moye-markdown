import { searchWorkspace } from './desktop.js';

/** Controls filename and Markdown source search for the current folder. */
export function mountWorkspaceSearch(dialog, getFolder, openResult) {
  const form = dialog.querySelector('form');
  const query = dialog.querySelector('input');
  const mode = dialog.querySelector('select');
  const status = dialog.querySelector('#search-status');
  const scope = dialog.querySelector('#search-scope');
  const results = dialog.querySelector('#search-results');
  const submit = dialog.querySelector('#search-submit');
  let revision = 0;

  function reset() {
    revision++;
    results.replaceChildren();
    status.textContent = '';
    submit.disabled = false;
  }

  form.onsubmit = async (event) => {
    event.preventDefault();
    const folder = getFolder();
    const text = query.value.trim();
    if (!text || !folder || submit.disabled) return;
    reset();
    const request = revision;
    status.textContent = '搜索中…';
    submit.disabled = true;
    try {
      const answer = await searchWorkspace(folder.id, text, mode.value === 'contents');
      if (request !== revision || !dialog.open || folder !== getFolder()) return;
      const { matches, limited, skipped } = answer;
      status.textContent = (limited ? '显示前 ' + matches.length + ' 条结果' : matches.length ? matches.length + ' 条结果' : '没有匹配结果')
        + (skipped ? ' · 跳过 ' + skipped + ' 个无法读取或过大的项目' : '');
      results.replaceChildren(...matches.map((match) => {
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
          const opened = await openResult(match, folder, text, (message) => { status.textContent = message; });
          if (opened) dialog.close();
          row.disabled = false;
        };
        return row;
      }));
    } catch (error) {
      if (request === revision) status.textContent = String(error);
    } finally {
      if (request === revision) submit.disabled = false;
    }
  };
  query.oninput = mode.onchange = reset;
  query.onkeydown = (event) => {
    if (event.key === 'ArrowDown' && results.firstElementChild) {
      event.preventDefault();
      results.firstElementChild.focus();
    }
  };
  dialog.querySelector('#search-close').onclick = () => dialog.close();
  dialog.onclose = reset;

  return (kind = 'contents') => {
    const folder = getFolder();
    if (!folder) return false;
    reset();
    mode.value = kind;
    scope.textContent = folder.path;
    scope.title = folder.path;
    dialog.showModal();
    query.select();
    return true;
  };
}
