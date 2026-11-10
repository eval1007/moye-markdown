const diagramFontFamily = 'JetBrains Mono';
const fontStack = '"JetBrains Mono", "Cascadia Mono", Consolas, "Microsoft YaHei UI", "Noto Sans CJK SC", monospace';
let diagramFont;
let renderer;
let sequence = 0;
let renderTail = Promise.resolve();

async function loadRenderer() {
  const { default: mermaid } = await import('mermaid');
  return mermaid;
}

/** Loads the font before Mermaid measures labels, and returns the rule for the SVG image. */
async function loadDiagramFont() {
  const { default: url } = await import('./fonts/JetBrainsMono-Regular.woff2?inline');
  const source = `url("${url}") format("woff2")`;
  const face = await new FontFace(diagramFontFamily, source).load();
  document.fonts.add(face);
  return `@font-face { font-family: "${diagramFontFamily}"; src: ${source}; }`;
}

export function diagramType(source) {
  const body = source.replace(/^---[^\S\r\n]*\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/, '')
    .replace(/%%\{[\s\S]*?\}%%/g, '');
  const first = body.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith('%%'));
  if (/^erDiagram\b/i.test(first ?? '')) return 'er';
  if (/^(?:graph|flowchart(?:-elk)?)\b/i.test(first ?? '')) return 'flowchart';
  if (/^classDiagram\b/i.test(first ?? '')) return 'class';
  if (/^stateDiagram(?:-v2)?\b/i.test(first ?? '')) return 'state';
  return 'other';
}

/** Restores ELK's corner coordinates from Mermaid's quadratic rounding segments. */
export function straightenElkPath(path) {
  return path.replace(/Q([-\d.e+]+),([-\d.e+]+)\s+([-\d.e+]+),([-\d.e+]+)/gi, 'L$1,$2L$3,$4');
}

/** Serializes Mermaid configuration changes so each SVG uses its requested theme and layout. */
export function renderDiagram(source, theme, layout, isEr, isCurrent) {
  const task = renderTail.then(async () => {
    if (!isCurrent()) return null;
    const mermaid = await (renderer ??= loadRenderer());
    const fontRule = await (diagramFont ??= loadDiagramFont());
    if (!isCurrent()) return null;
    const dark = theme === 'dark';
    const ink = dark ? '#e8edf8' : '#17191d';
    const blue = dark ? '#243950' : '#e1edfc';
    const border = dark ? '#7195c4' : '#5e9df1';
    const edge = dark ? '#a2acbd' : '#7d8189';
    const paper = dark ? '#211e2b' : '#ffffff';
    const group = dark ? '#1f2936' : '#f5f8fd';
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: 'base',
      look: 'classic',
      htmlLabels: false,
      layout,
      fontFamily: fontStack,
      themeVariables: {
        darkMode: dark, fontSize: '15px', textColor: ink, primaryTextColor: ink,
        primaryColor: blue, primaryBorderColor: border, lineColor: edge,
        secondaryColor: blue, secondaryBorderColor: border, secondaryTextColor: ink,
        tertiaryColor: group, tertiaryBorderColor: border, tertiaryTextColor: ink,
        clusterBkg: group, clusterBorder: border, edgeLabelBackground: paper,
        mainBkg: blue, nodeBorder: border, nodeTextColor: ink,
        rowOdd: dark ? '#212936' : '#ffffff', rowEven: dark ? '#273140' : '#f5f8fd',
        actorBkg: blue, actorBorder: border, actorTextColor: ink, actorLineColor: edge,
        signalColor: edge, signalTextColor: ink, labelBoxBkgColor: group, labelBoxBorderColor: border,
        labelTextColor: ink, noteBkgColor: group, noteBorderColor: border, noteTextColor: ink,
        archEdgeColor: edge, archEdgeArrowColor: edge, archEdgeWidth: '1',
        archGroupBorderColor: border, archGroupBorderWidth: '1',
      },
      themeCSS: '.node, .node * { filter: none !important; } .relationshipLine, .flowchart-link, .actor-line { stroke-width: 1px; }',
      ...(isEr ? {
        er: { useMaxWidth: false, fontSize: 15, entityPadding: 9, diagramPadding: 14, nodeSpacing: 54, rankSpacing: 67 },
      } : {}),
      flowchart: { useMaxWidth: false, nodeSpacing: 54, rankSpacing: 70, padding: 18, wrappingWidth: 280, curve: 'linear' },
      sequence: { useMaxWidth: false, actorFontFamily: fontStack, messageFontFamily: fontStack, noteFontFamily: fontStack },
    });
    const id = `moye-mermaid-${++sequence}`;
    try {
      const { svg } = await mermaid.render(id, source);
      if (!isCurrent()) return null;
      const element = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
      const [, , width, height] = (element.getAttribute('viewBox') ?? '').split(/[ ,]+/).map(Number);
      if (layout === 'elk') {
        // Mermaid 12.3's ELK adapter forces rounded corners even with flowchart.curve = linear.
        for (const edge of element.querySelectorAll('path.flowchart-link')) {
          edge.setAttribute('d', straightenElkPath(edge.getAttribute('d')));
        }
      }
      // An SVG loaded as an image cannot inherit the page's fonts or fetch a font file.
      const style = element.ownerDocument.createElementNS(element.namespaceURI, 'style');
      style.textContent = fontRule;
      element.prepend(style);
      return { svg: new XMLSerializer().serializeToString(element), width: width || 640, height: height || 480 };
    } finally {
      // Some Mermaid errors leave their temporary rendering host in the DOM.
      document.getElementById(`d${id}`)?.remove();
    }
  });
  renderTail = task.catch(() => {});
  return task;
}

/** Shows one SVG as an image, keeping it out of the application's interactive DOM. */
export function svgUrl(svg) {
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
}
