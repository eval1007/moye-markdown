const vscode = require('vscode');
const path = require('node:path').posix;

const VIEW_TYPE = 'moye.preview';
const MARKDOWN = /\.(?:md|markdown|mdown)$/i;
const EXTERNAL_SCHEMES = new Set(['http', 'https', 'mailto']);

/** Provides a read-only Moye view of VS Code text documents, including remote URIs. */
class MoyePreviewProvider {
  constructor(context) {
    this.media = vscode.Uri.joinPath(context.extensionUri, 'media');
    this.panels = new Map();
    this.anchors = new Map();
  }

  /** Opens a Markdown resource in Moye; VS Code retains ownership of editing and saving. */
  async open(uri, column) {
    uri ??= [...this.panels.values()].find(({ panel }) => panel.active)?.document.uri;
    if (!uri || !MARKDOWN.test(uri.path)) {
      await vscode.window.showInformationMessage('请先打开或选择一份 Markdown 文档。');
      return;
    }
    const resource = uri.with({ fragment: '' });
    const key = resource.toString();
    this.anchors.set(key, uri.fragment);
    await vscode.commands.executeCommand('vscode.openWith', resource, VIEW_TYPE, { viewColumn: column });
    this.panels.get(key)?.send();
  }

  async resolveCustomTextEditor(document, panel) {
    const key = document.uri.toString();
    const directory = document.uri.with({ path: path.dirname(document.uri.path), query: '', fragment: '' });
    const root = vscode.workspace.getWorkspaceFolder(document.uri)?.uri ?? directory;
    panel.webview.options = { enableScripts: true, localResourceRoots: [this.media, root] };
    const template = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.media, 'index.html')));
    const base = panel.webview.asWebviewUri(this.media).toString() + '/';
    const csp = panel.webview.cspSource;
    const policy = `default-src 'none'; script-src ${csp} 'wasm-unsafe-eval'; style-src ${csp} 'unsafe-inline'; img-src ${csp} blob: data:; font-src ${csp} data:; connect-src ${csp}; worker-src blob:; base-uri ${csp}; form-action 'none';`;
    let ready = false;
    let revision = 0;
    const send = (text = document.getText()) => {
      if (!ready) return;
      ++revision;
      const anchor = this.anchors.get(key);
      this.anchors.delete(key);
      panel.webview.postMessage({
        type: 'document', text, anchor,
        resourceBase: panel.webview.asWebviewUri(directory).toString().replace(/\/?$/, '/'),
      });
    };
    // UNC filesystem notifications may be unavailable; explicit refresh reads disk without discarding unsaved edits.
    const refresh = async () => {
      const request = ++revision;
      const version = document.version;
      const text = document.isDirty ? document.getText()
        : new TextDecoder().decode(await vscode.workspace.fs.readFile(document.uri));
      if (request === revision && version === document.version) send(text);
    };
    this.panels.set(key, { send, refresh, panel, document });
    const subscriptions = [
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === key) send();
      }),
      panel.webview.onDidReceiveMessage((message) => {
        this.handleMessage(message, document, panel, root, () => { ready = true; send(); })
          .catch((error) => vscode.window.showErrorMessage(`Moye：${error.message}`));
      }),
    ];
    panel.onDidDispose(() => {
      ++revision;
      this.panels.delete(key);
      this.anchors.delete(key);
      for (const subscription of subscriptions) subscription.dispose();
    });
    panel.webview.html = template.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}"><base href="${base}">`);
  }

  async refresh() {
    await [...this.panels.values()].find(({ panel }) => panel.active)?.refresh();
  }

  /** Handles only preview actions; document content cannot invoke arbitrary VS Code commands. */
  async handleMessage(message, document, panel, root, onReady) {
    if (!message || typeof message.type !== 'string') throw new Error('预览消息无效。');
    switch (message.type) {
      case 'ready':
        onReady();
        break;
      case 'copy':
        if (typeof message.text !== 'string') throw new Error('复制内容无效。');
        await vscode.env.clipboard.writeText(message.text);
        panel.webview.postMessage({ type: 'copied', id: message.id });
        break;
      case 'openLink': {
        if (typeof message.href !== 'string') throw new Error('链接无效。');
        const href = message.href;
        if (/^[a-z][\w+.-]*:/i.test(href)) {
          const uri = vscode.Uri.parse(href);
          if (!EXTERNAL_SCHEMES.has(uri.scheme)) throw new Error('不支持此链接类型。');
          await vscode.env.openExternal(uri);
          return;
        }
        if (/^[/\\]/.test(href)) throw new Error('请使用相对文档路径。');
        const match = /^([^?#]*)(?:\?[^#]*)?(?:#(.*))?$/.exec(href);
        const relative = decodeURIComponent(match[1]);
        if (relative.includes('\\')) throw new Error('文档链接路径请使用正斜杠。');
        const target = vscode.Uri.joinPath(document.uri, '..', relative).with({ fragment: match[2] ?? '' });
        const rootPath = root.path.replace(/\/$/, '') + '/';
        if (target.path !== root.path && !target.path.startsWith(rootPath)) throw new Error('链接超出当前工作区或文档目录。');
        if (MARKDOWN.test(target.path)) await this.open(target, panel.viewColumn);
        else await vscode.commands.executeCommand('vscode.open', target);
        break;
      }
    }
  }
}

/** Registers an optional preview so normal Markdown editing remains owned by VS Code. */
function activate(context) {
  const provider = new MoyePreviewProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { enableFindWidget: true }, supportsMultipleEditorsPerDocument: false,
    }),
    vscode.commands.registerCommand('moye.openPreview', (uri) =>
      provider.open(uri ?? vscode.window.activeTextEditor?.document.uri, vscode.ViewColumn.Beside)),
    vscode.commands.registerCommand('moye.refreshPreview', () => provider.refresh()),
  );
}

module.exports = { activate };
