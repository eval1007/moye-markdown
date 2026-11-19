import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./webview', import.meta.url)),
  base: './',
  publicDir: false,
  build: {
    outDir: '../media',
    emptyOutDir: true,
    license: { fileName: 'licenses/Frontend.md' },
  },
});
