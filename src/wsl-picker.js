import { listDistributions, suggestWslPaths } from './desktop.js';
import { resolveWslPath, wslCompletion } from './wsl-path.js';

const suggestionDelay = 150;

/** Wires the WSL dialog and returns the function that shows it. */
export function mountWslPicker(dialog, openPath) {
  const form = dialog.querySelector('form');
  const distro = dialog.querySelector('#wsl-distro');
  const input = dialog.querySelector('#wsl-path');
  const results = dialog.querySelector('#wsl-suggestions');
  const status = dialog.querySelector('#wsl-suggestion-status');
  const error = dialog.querySelector('#wsl-error');
  const submit = dialog.querySelector('#wsl-submit');
  let names = [];
  let choices = [];
  let active = -1;
  let timer;
  let revision = 0;

  function report(message = '') {
    error.textContent = message;
    error.hidden = !message;
  }

  function clear(message = '') {
    clearTimeout(timer);
    ++revision;
    choices = [];
    active = -1;
    results.replaceChildren();
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    status.textContent = message;
  }

  function choose(index) {
    const choice = choices[index];
    input.value = choice.path;
    input.focus();
    if (choice.directory) refresh();
    else clear('已选中文件，按 Enter 或点击「打开」。');
  }

  function render(entries, { pathPrefix, separator }) {
    if (!entries.length) {
      status.textContent = '没有匹配的文件夹或 Markdown 文件。';
      return;
    }
    choices = entries.map(({ name, directory }) => ({
      path: pathPrefix + name + (directory ? separator : ''),
      label: name + (directory ? separator : ''),
      directory,
    }));
    results.replaceChildren(...choices.map((choice, index) => {
      const option = document.createElement('li');
      option.id = 'wsl-option-' + index;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.dataset.kind = choice.directory ? 'folder' : 'file';
      option.textContent = choice.label;
      option.title = choice.path;
      option.onmousedown = (event) => event.preventDefault();
      option.onclick = () => choose(index);
      return option;
    }));
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    status.textContent = '↑ ↓ 选择，Enter 或 Tab 补全。';
  }

  function refresh() {
    report();
    clear();
    const query = wslCompletion(input.value, distro.value);
    if (!query) {
      status.textContent = '输入 / 开始浏览，或粘贴 WSL 网络路径。';
      return;
    }
    if (!query.directory) {
      const prefix = query.prefix.toLowerCase();
      render(names.filter((name) => name.toLowerCase().startsWith(prefix))
        .map((name) => ({ name, directory: true })), query);
      return;
    }
    const request = revision;
    status.textContent = '正在查找路径…';
    // A slow response from a previous directory must never replace the current suggestions.
    const current = () => request === revision && dialog.open;
    timer = setTimeout(async () => {
      try {
        const entries = await suggestWslPaths(query.directory, query.prefix);
        if (current()) render(entries, query);
      } catch {
        if (current()) status.textContent = '无法列出此目录，可继续手动输入完整路径。';
      }
    }, suggestionDelay);
  }

  input.oninput = (event) => event.isComposing ? clear() : refresh();
  input.oncompositionend = refresh;
  distro.onchange = refresh;
  input.onkeydown = (event) => {
    if (event.isComposing) return;
    const { key } = event;
    if (key === 'Escape' && choices.length) {
      event.preventDefault();
      clear();
    } else if (choices.length && (key === 'ArrowDown' || key === 'ArrowUp')) {
      event.preventDefault();
      if (active >= 0) results.children[active].setAttribute('aria-selected', 'false');
      active = active < 0 ? (key === 'ArrowDown' ? 0 : choices.length - 1)
        : Math.min(choices.length - 1, Math.max(0, active + (key === 'ArrowDown' ? 1 : -1)));
      const option = results.children[active];
      option.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    } else if ((key === 'Enter' && active >= 0) ||
               (key === 'Tab' && !event.shiftKey && (active >= 0 || choices.length === 1))) {
      event.preventDefault();
      choose(Math.max(0, active));
    }
  };

  form.onsubmit = async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    clear();
    report();
    submit.disabled = true;
    try {
      const path = resolveWslPath(input.value, distro.value);
      if (await openPath(path, report)) dialog.close();
    } catch (error) {
      report(error instanceof Error ? error.message : String(error));
    } finally {
      submit.disabled = false;
    }
  };
  dialog.querySelector('#wsl-cancel').onclick = () => dialog.close();
  dialog.onclose = () => clear();

  return async () => {
    dialog.showModal();
    if (names.length) return refresh();
    clear('正在查询 WSL 发行版…');
    report();
    try {
      names = await listDistributions();
      distro.replaceChildren(...names.map((name) => new Option(name, name)));
      if (dialog.open) {
        refresh();
        if (!names.length) report('未找到已安装的 WSL 发行版。');
      }
    } catch (error) {
      if (dialog.open) {
        clear();
        report(error instanceof Error ? error.message : String(error));
      }
    }
  };
}
