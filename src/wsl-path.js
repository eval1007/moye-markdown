/** Converts a WSL absolute path without running a shell inside the distribution. */
export function resolveWslPath(value, distro) {
  const path = value.trim();
  if (/^\\\\wsl(?:\.localhost|\$)\\[^\\]+(?:\\.*)?$/i.test(path)) return path;
  if (!path.startsWith('/') || path.includes('\\')) throw new Error('请输入 Linux 绝对路径，例如 /home/你的用户名/项目。');
  if (!distro) throw new Error('请选择 WSL 发行版，或粘贴 WSL 网络路径。');
  const parts = [];
  for (const part of path.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return ['\\\\wsl.localhost', distro, ...parts].join('\\');
}

/** Splits the input into the directory to list and the unfinished name, preserving its path style. */
export function wslCompletion(value, distro) {
  const path = value.trimStart() || '/';
  const unc = /^(\\\\wsl(?:\.localhost|\$)\\)([^\\/]*)(\\[^/]*)?$/i.exec(path);
  if (unc && !unc[3]) {
    return { pathPrefix: unc[1], prefix: unc[2], separator: '\\', directory: null };
  }
  if (unc && !unc[2]) return null;
  if (!unc && (!distro || !path.startsWith('/') || path.includes('\\'))) return null;
  const separator = unc ? '\\' : '/';
  const split = path.lastIndexOf(separator) + 1;
  const pathPrefix = path.slice(0, split);
  return { pathPrefix, prefix: path.slice(split), separator, directory: resolveWslPath(pathPrefix, distro) };
}
