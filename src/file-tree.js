import { listFolder } from './desktop.js';

/** Retains expanded folders while the reader switches documents. */
export class FileTree {
  constructor(container, onOpen) {
    this.container = container;
    this.onOpen = onOpen;
    this.folder = null;
    this.selection = null;
    this.expand = new WeakMap();
  }

  setFolder(folder) {
    this.folder = folder;
    this.selection = null;
    this.container.replaceChildren();
    if (folder) this.render(this.container, folder.entries, folder.id);
  }

  select(path) {
    this.selection = path;
    for (const button of this.container.querySelectorAll('button[data-path]')) {
      button.setAttribute('aria-current', button.dataset.path === path ? 'page' : 'false');
    }
  }

  /** Opens the selected document's ancestors and scrolls its row into view. */
  async reveal(path) {
    let parent = this.container;
    let relative = '';
    for (const segment of path.split('/').slice(0, -1)) {
      relative += (relative ? '/' : '') + segment;
      const details = [...parent.children].find((node) => node.dataset.folderPath === relative);
      if (!details) return;
      details.open = true;
      await this.expand.get(details)();
      if (this.selection !== path || !details.isConnected) return;
      parent = details.lastElementChild;
    }
    [...parent.children].find((node) => node.dataset.path === path)?.scrollIntoView({ block: 'nearest' });
  }

  render(parent, entries, folderId) {
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'tree-status';
      empty.textContent = '没有 Markdown 文件或子文件夹';
      parent.replaceChildren(empty);
      return;
    }

    parent.replaceChildren(...entries.map((entry) => {
      if (!entry.directory) {
        const button = document.createElement('button');
        button.className = 'tree-file';
        button.dataset.path = entry.path;
        button.title = entry.name;
        button.textContent = entry.name;
        button.setAttribute('aria-current', entry.path === this.selection ? 'page' : 'false');
        button.onclick = () => this.onOpen(entry.path, folderId);
        return button;
      }

      const details = document.createElement('details');
      details.dataset.folderPath = entry.path;
      const summary = document.createElement('summary');
      summary.textContent = entry.name;
      summary.title = entry.name;
      const children = document.createElement('div');
      children.className = 'tree-children';
      details.append(summary, children);
      let request;
      const expand = () => request ??= (async () => {
        children.textContent = '读取中…';
        try {
          const result = await listFolder(entry.path, folderId);
          if (details.isConnected) this.render(children, result, folderId);
        } catch (error) {
          children.textContent = String(error);
          request = undefined;
        }
      })();
      this.expand.set(details, expand);
      details.addEventListener('toggle', () => { if (details.open) expand(); });
      return details;
    }));
  }
}
