import '../../../src/style.css';
import './style.css';
import { renderMarkdown, localReference } from '../../../src/markdown.js';
import { mountDiagramPanel } from '../../../src/diagram-panel.js';
import { closeDiagram, showDiagram } from '../../../src/zoom.js';

const vscode = acquireVsCodeApi();
const article = document.querySelector('#markdown-preview');
const reader = document.querySelector('#reader');
const notice = document.querySelector('#notice');
const copies = new Map();
let panels = [];
let generation = 0;
let firstRender = true;
let copySequence = 0;

function theme() {
  return document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast') ? 'dark' : 'light';
}

function updateTheme() {
  const value = theme();
  if (document.documentElement.dataset.theme === value) return;
  document.documentElement.dataset.theme = value;
  closeDiagram();
  for (const panel of panels) panel.paint();
}

function scrollToAnchor(fragment) {
  const id = decodeURIComponent(fragment);
  const element = document.getElementById(id) ?? document.getElementById(`heading-${id}`);
  if (element && article.contains(element)) element.scrollIntoView({ block: 'start' });
}

/** Renders the latest document snapshot, keeping stale async diagrams out of the view. */
async function showDocument({ text, resourceBase, anchor }) {
  const version = ++generation;
  const rendered = await renderMarkdown(text);
  if (version !== generation) return;
  const scrollTop = firstRender ? (vscode.getState()?.scrollTop ?? 0) : reader.scrollTop;
  firstRender = false;
  closeDiagram();
  for (const panel of panels) panel.dispose();
  panels = [];
  copies.clear();
  const template = document.createElement('template');
  template.innerHTML = rendered.html;
  // Strip all image URLs before insertion; only relative resources use VS Code's resource loader.
  for (const image of template.content.querySelectorAll('img')) {
    const source = image.getAttribute('src');
    image.removeAttribute('src');
    const fail = () => {
      const label = document.createElement('span');
      label.className = 'image-failure';
      label.textContent = `图片不可用${image.alt ? `：${image.alt}` : ''}`;
      image.replaceWith(label);
    };
    if (localReference(source)) {
      image.addEventListener('error', fail, { once: true });
      image.src = new URL(source, resourceBase).href;
    } else fail();
  }
  article.replaceChildren(template.content);
  notice.hidden = true;
  panels = [...article.querySelectorAll('figure[data-diagram]')].map((figure, index) =>
    mountDiagramPanel(figure, rendered.diagrams[Number(figure.dataset.diagram)], index, {
      getTheme: theme, isDocumentCurrent: () => generation === version, showDiagram,
    }),
  );
  await Promise.all(panels.map((panel) => panel.ready));
  if (version !== generation) return;
  reader.scrollTop = scrollTop;
  if (anchor) scrollToAnchor(anchor);
}

window.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'document') {
    showDocument(message).catch((error) => {
      notice.textContent = `预览失败：${error.message}`;
      notice.hidden = false;
    });
  } else if (message.type === 'copied') {
    const button = copies.get(message.id);
    if (button) {
      button.textContent = '已复制';
      button.closest('.code-block').querySelector('.copy-status').textContent = '代码已复制';
      copies.delete(message.id);
    }
  }
});

article.addEventListener('click', (event) => {
  const copy = event.target.closest('button.copy-code');
  if (copy) {
    const id = ++copySequence;
    copies.set(id, copy);
    vscode.postMessage({ type: 'copy', id, text: copy.closest('.code-block').querySelector('pre code').textContent });
    return;
  }
  const link = event.target.closest('a[href]');
  if (!link) return;
  event.preventDefault();
  const href = link.getAttribute('href');
  if (href.startsWith('#')) {
    try { scrollToAnchor(href.slice(1)); }
    catch { notice.textContent = '链接中的标题位置无效。'; notice.hidden = false; }
  } else vscode.postMessage({ type: 'openLink', href });
});
reader.addEventListener('scroll', () => vscode.setState({ scrollTop: reader.scrollTop }), { passive: true });
new MutationObserver(updateTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
updateTheme();
vscode.postMessage({ type: 'ready' });
