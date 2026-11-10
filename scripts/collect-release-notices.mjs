import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const target = 'x86_64-pc-windows-msvc';
const { packages, resolve: graph } = JSON.parse(execFileSync('cargo', [
  'metadata', '--locked', '--manifest-path', 'src-tauri/Cargo.toml',
  '--filter-platform', target, '--format-version', '1',
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
const resolved = new Set(graph.nodes.map(({ id }) => id));
// These upstream license texts are missing from the published crate archives.
const upstream = {
  'alloc-stdlib@0.3.0': ['alloc-stdlib-0.3.0-BSD.txt'],
  'selectors@0.38.0': ['MPL-2.0.txt'],
  'tauri-plugin@2.7.2': ['tauri-MIT.txt', 'tauri-Apache-2.0.txt'],
  'webview2-com@0.39.1': ['webview2-rs-MIT.txt'],
  'webview2-com-macros@0.8.1': ['webview2-rs-MIT.txt'],
  'webview2-com-sys@0.39.1': ['webview2-rs-MIT.txt'],
};
const notices = ['# Rust dependency notices', '', 'Resolved Cargo packages for ' + target + '.'];
const licenseSections = new Map();

for (const pkg of packages.filter(({ id, source }) => resolved.has(id) && source)) {
  const key = pkg.name + '@' + pkg.version;
  const directory = dirname(pkg.manifest_path);
  const files = new Set(readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^(license|licence|copying|notice|copyright|unlicense)/i.test(entry.name))
    .map((entry) => resolve(directory, entry.name)));
  if (pkg.license_file) files.add(resolve(directory, pkg.license_file));
  for (const file of upstream[key] ?? []) files.add(resolve('licenses/rust', file));
  if (!files.size) throw new Error('Missing license text for ' + key);
  const source = 'https://static.crates.io/crates/' + pkg.name + '/' + pkg.name + '-' + pkg.version + '.crate';
  const sections = [];
  for (const file of files) {
    const body = readFileSync(file, 'utf8').replaceAll('\r\n', '\n').trim();
    if (!licenseSections.has(body)) licenseSections.set(body, licenseSections.size + 1);
    sections.push('[' + basename(file) + '](#notice-' + licenseSections.get(body) + ')');
  }
  notices.push('- [' + key + '](' + source + ') · ' + (pkg.license ?? 'See license text') + ' · ' + sections.join(', '));
}

for (const [body, section] of licenseSections) notices.push('', '## Notice ' + section, '', body);
mkdirSync('dist/licenses', { recursive: true });
writeFileSync('dist/licenses/Rust.md', notices.join('\n') + '\n');
copyFileSync('LICENSE', 'dist/licenses/Moye-MIT.txt');
copyFileSync('THIRD_PARTY.md', 'dist/licenses/Third-Party.md');
copyFileSync('src-tauri/windows/LICENSE-TAURI-MIT', 'dist/licenses/Tauri-installer-MIT.txt');
