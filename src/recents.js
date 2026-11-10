const storageKey = 'moye-recents';
const limit = 20;

/** Keeps the latest explicitly opened paths on this device. */
export class RecentPaths {
  list() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      return Array.isArray(saved) ? saved.filter((item) =>
        typeof item?.path === 'string' && typeof item.name === 'string' &&
        (item.kind === 'folder' || item.kind === 'document')).slice(0, limit) : [];
    } catch { return []; }
  }

  add(item) {
    const next = [item, ...this.list().filter((entry) => entry.path !== item.path)].slice(0, limit);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  clear() {
    localStorage.removeItem(storageKey);
  }
}
