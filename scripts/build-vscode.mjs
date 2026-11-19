import { build } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';

await build({ configFile: 'extensions/vscode/vite.config.js' });
copyFileSync('LICENSE', 'extensions/vscode/LICENSE');
copyFileSync('THIRD_PARTY.md', 'extensions/vscode/media/licenses/Third-Party.md');
copyFileSync('src-tauri/icons/icon.png', 'extensions/vscode/icon.png');
copyFileSync('public/licenses/JetBrainsMono-OFL.txt', 'extensions/vscode/media/licenses/JetBrainsMono-OFL.txt');
for (const file of ['Graphviz-EPL-1.0.txt', 'Expat-MIT.txt', 'Viz-MIT.txt']) {
  copyFileSync(`public/licenses/${file}`, `extensions/vscode/media/licenses/${file}`);
}
mkdirSync('dist-vscode', { recursive: true });
