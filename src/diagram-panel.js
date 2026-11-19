import { diagramType, renderDiagram, svgUrl } from './diagrams.js';

const errorText = (error) => error instanceof Error ? error.message : String(error);

/** Mounts a themed diagram with layout controls and owns its SVG image lifetime. */
export function mountDiagramPanel(figure, diagram, index, { getTheme, isDocumentCurrent, showDiagram }) {
  const { language, source } = diagram;
  const engine = language === 'plantuml' ? 'PlantUML' : 'Mermaid';
  const title = `${engine} · 图 ${index + 1}`;
  const kind = language === 'mermaid' ? diagramType(source) : 'other';
  const er = kind === 'er';
  figure.classList.toggle('er-diagram', er);
  // Only the app's engine label and figure number go into this template.
  figure.innerHTML = `<div class="figure-toolbar">
    <span class="figure-label"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.5"/><path d="M5.5 6.5h5M5.5 9.5h3"/></svg>${title}</span>
    <div class="figure-actions">
      <button class="fit-inline">原始大小</button>
      <select aria-label="图 ${index + 1} 的布局"><option value="dagre">Dagre</option><option value="elk">ELK</option></select>
      <button class="expand" aria-label="放大图 ${index + 1}" disabled>放大 ↗</button>
    </div>
  </div><div class="figure-content" aria-live="polite"></div>`;
  const content = figure.querySelector('.figure-content');
  const expand = figure.querySelector('.expand');
  const layout = figure.querySelector('select');
  const inlineFit = figure.querySelector('.fit-inline');
  layout.hidden = !['er', 'flowchart', 'class', 'state'].includes(kind);
  layout.value = ['er', 'flowchart'].includes(kind) ? 'elk' : 'dagre';
  inlineFit.onclick = () => {
    const actual = figure.classList.toggle('actual-size');
    inlineFit.textContent = actual ? '适应宽度' : '原始大小';
  };
  let revision = 0;
  let url;
  let data;

  function expandDiagram() {
    if (data && url) showDiagram(data, url, title);
  }
  expand.onclick = expandDiagram;

  async function paint() {
    const request = ++revision;
    const isCurrent = () => isDocumentCurrent() && request === revision;
    expand.disabled = true;
    content.textContent = '正在绘制…';
    content.classList.add('waiting');
    if (url) URL.revokeObjectURL(url);
    url = undefined;
    data = undefined;
    try {
      const next = await renderDiagram(diagram, getTheme(), layout.value, er, isCurrent);
      if (!next || !isCurrent()) return;
      data = next;
      url = svgUrl(data.svg);
      const img = document.createElement('img');
      img.src = url;
      img.alt = title;
      img.style.width = `${data.width}px`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'figure-image';
      button.setAttribute('aria-label', `查看图 ${index + 1} 大图`);
      button.onclick = expandDiagram;
      button.append(img);
      content.replaceChildren(button);
      expand.disabled = false;
    } catch (error) {
      if (!isCurrent()) return;
      const message = document.createElement('p');
      message.className = 'diagram-error';
      message.textContent = `这张 ${engine} 图无法显示。`;
      const details = document.createElement('details');
      const label = document.createElement('summary');
      label.textContent = '查看错误和源码';
      const reason = document.createElement('pre');
      reason.textContent = errorText(error);
      const code = document.createElement('pre');
      code.textContent = source;
      details.append(label, reason, code);
      content.replaceChildren(message, details);
    } finally {
      if (isCurrent()) content.classList.remove('waiting');
    }
  }

  layout.onchange = paint;
  return {
    ready: paint(),
    paint,
    dispose() {
      ++revision;
      if (url) URL.revokeObjectURL(url);
    },
  };
}
