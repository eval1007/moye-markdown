import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { URI, Utils } from 'vscode-uri';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../extensions/vscode/extension.cjs', import.meta.url), 'utf8');

function previewHost(uri) {
  const root = Utils.dirname(Utils.dirname(uri));
  const commands = new Map();
  const opened = [];
  const messages = [];
  let provider;
  let onMessage;
  let onDispose;
  let onChange;
  let readDisk = async () => new TextEncoder().encode('disk version');
  const subscription = { dispose() {} };
  const document = { uri, version: 1, isDirty: false, getText: () => 'buffer version' };
  const panel = {
    active: true, viewColumn: 2,
    onDidDispose(fn) { onDispose = fn; },
    webview: {
      cspSource: 'https://*.vscode-cdn.net',
      asWebviewUri: (uri) => URI.from({ scheme: 'https', authority: 'resources.example', path: uri.path }),
      postMessage(message) { messages.push(message); },
      onDidReceiveMessage(fn) { onMessage = fn; return subscription; },
    },
  };
  const vscode = {
    Uri: { parse: URI.parse, joinPath: Utils.joinPath },
    ViewColumn: { Beside: 2 },
    workspace: {
      getWorkspaceFolder: () => ({ uri: root }),
      fs: { readFile: async (uri) => uri.path.endsWith('/media/index.html')
        ? new TextEncoder().encode('<head></head>') : readDisk() },
      onDidChangeTextDocument(fn) { onChange = fn; return subscription; },
    },
    window: {
      registerCustomEditorProvider(_type, value) { provider = value; return subscription; },
      showErrorMessage(message) { throw new Error(message); },
    },
    commands: {
      registerCommand(name, handler) { commands.set(name, handler); return subscription; },
      async executeCommand(...args) { opened.push(args); },
    },
  };
  const module = { exports: {} };
  runInNewContext(source, { module, require: (name) => name === 'vscode' ? vscode : require(name), TextDecoder });
  module.exports.activate({ extensionUri: URI.parse('file:///extension'), subscriptions: [] });
  return {
    provider, document, panel, messages, opened, commands, root,
    async ready() { await provider.resolveCustomTextEditor(document, panel); onMessage({ type: 'ready' }); },
    change() { onChange({ document }); },
    dispose() { onDispose(); },
    setReadDisk(fn) { readDisk = fn; },
  };
}

test('relative Markdown navigation preserves Remote WSL and UNC authorities and Unicode anchors', async () => {
  for (const uri of [
    URI.parse('vscode-remote://wsl+Ubuntu/home/user/project/docs/start.md'),
    URI.parse('file://wsl.localhost/Ubuntu/home/user/project/docs/start.md'),
  ]) {
    const host = previewHost(uri);
    await host.provider.handleMessage({ type: 'openLink', href: '%E5%8F%A6%E4%B8%80%E7%AF%87.md#%E6%A0%87%E9%A2%98' }, host.document, host.panel, host.root);
    const [, target, viewType] = host.opened[0];
    assert.equal(target.scheme, uri.scheme);
    assert.equal(target.authority, uri.authority);
    assert.equal(target.path, Utils.joinPath(uri, '..', '另一篇.md').path);
    assert.equal(target.fragment, '');
    assert.equal(decodeURIComponent(host.provider.anchors.get(target.toString())), '标题');
    assert.equal(viewType, 'moye.preview');
    for (const href of ['command:workbench.action.files.saveAll', '../../../outside.md', '%2e%2e/%2e%2e/outside.md', '..%5c..%5coutside.md']) {
      await assert.rejects(host.provider.handleMessage({ type: 'openLink', href }, host.document, host.panel, host.root));
    }
    assert.equal(host.opened.length, 1);
  }
});

test('explicit refresh reads changed files, preserves unsaved text and ignores a stale disk read', async () => {
  const host = previewHost(URI.parse('vscode-remote://wsl+Ubuntu/home/user/project/docs/start.md'));
  await host.ready();
  assert.equal(host.messages.at(-1).text, 'buffer version');
  await host.commands.get('moye.refreshPreview')();
  assert.equal(host.messages.at(-1).text, 'disk version');
  host.document.isDirty = true;
  await host.commands.get('moye.refreshPreview')();
  assert.equal(host.messages.at(-1).text, 'buffer version');
  host.document.isDirty = false;
  let resolveRead;
  host.setReadDisk(() => new Promise((resolve) => { resolveRead = resolve; }));
  const refresh = host.commands.get('moye.refreshPreview')();
  host.document.version++;
  host.document.getText = () => 'new unsaved edit';
  host.change();
  resolveRead(new TextEncoder().encode('older disk version'));
  await refresh;
  assert.equal(host.messages.at(-1).text, 'new unsaved edit');
});

test('closing a preview invalidates an outstanding refresh and releases document listeners', async () => {
  const host = previewHost(URI.parse('file:///project/docs/start.md'));
  await host.ready();
  let resolveRead;
  host.setReadDisk(() => new Promise((resolve) => { resolveRead = resolve; }));
  const refresh = host.commands.get('moye.refreshPreview')();
  const count = host.messages.length;
  host.dispose();
  resolveRead(new TextEncoder().encode('late snapshot'));
  await refresh;
  assert.equal(host.messages.length, count);
  assert.equal(host.provider.panels.size, 0);
});
