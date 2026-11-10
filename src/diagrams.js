const erFontFamily = 'JetBrains Mono';
let erFont;
let renderer;
let sequence = 0;
let renderTail = Promise.resolve();

async function loadRenderer() {
  const { default: mermaid } = await import('mermaid');
  return mermaid;
}

/** Loads the font before Mermaid measures labels, and returns the rule for the SVG image. */
async function loadErFont() {
  const { default: url } = await import('./fonts/JetBrainsMono-Regular.woff2?inline');
  const source = `url("${url}") format("woff2")`;
  const face = await new FontFace(erFontFamily, source).load();
  document.fonts.add(face);
  return `@font-face { font-family: "${erFontFamily}"; src: ${source}; }`;
}

export function isErDiagram(source) {
  const body = source.replace(/^---[^\S\r\n]*\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/, '')
    .replace(/%%\{[\s\S]*?\}%%/g, '');
  const first = body.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith('%%'));
  return /^erDiagram\b/i.test(first ?? '');
}

/** Serializes Mermaid configuration changes so each SVG uses its requested theme and layout. */
export function renderDiagram(source, theme, layout, isEr, isCurrent) {
  const task = renderTail.then(async () => {
    if (!isCurrent()) return null;
    const mermaid = await (renderer ??= loadRenderer());
    const fontRule = isEr ? await (erFont ??= loadErFont()) : null;
    if (!isCurrent()) return null;
    const dark = theme === 'dark';
    const ink = dark ? '#e8e6f0' : '#24223a';
    const accent = dark ? '#bcb3f8' : '#5944b6';
    const erInk = dark ? '#e8edf8' : '#17191d';
    const erHeader = dark ? '#243950' : '#e1edfc';
    const erBorder = dark ? '#7195c4' : '#5e9df1';
    const erEdge = dark ? '#a2acbd' : '#7d8189';
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: 'base',
      look: 'classic',
      htmlLabels: false,
      layout,
      fontFamily: isEr
        ? `"${erFontFamily}", "Cascadia Mono", Consolas, "Microsoft YaHei UI", "Noto Sans CJK SC", monospace`
        : '"Segoe UI", "Microsoft YaHei UI", "Noto Sans CJK SC", system-ui, sans-serif',
      themeVariables: {
        darkMode: dark, fontSize: '15px', textColor: isEr ? erInk : ink, primaryTextColor: isEr ? erInk : ink,
        primaryColor: isEr ? erHeader : dark ? '#312a4c' : '#ede9fc',
        primaryBorderColor: isEr ? erBorder : accent,
        lineColor: isEr ? erEdge : dark ? '#acabc1' : '#625e7a',
        clusterBkg: dark ? '#252335' : '#f8f7fc', clusterBorder: dark ? '#605a7a' : '#c8c0e3',
        edgeLabelBackground: isEr ? dark ? '#211e2b' : '#ffffff' : dark ? '#252335' : '#ffffff',
        secondaryColor: dark ? '#24374b' : '#eaf3fa',
        tertiaryColor: dark ? '#333142' : '#f2f0f7',
        ...(isEr ? {
          mainBkg: erHeader, nodeBorder: erBorder, nodeTextColor: erInk,
          rowOdd: dark ? '#212936' : '#ffffff', rowEven: dark ? '#273140' : '#f5f8fd',
        } : {}),
      },
      ...(isEr ? {
        themeCSS: '.node, .node * { filter: none !important; } .relationshipLine { stroke-width: 1px; }',
        er: { useMaxWidth: false, fontSize: 15, entityPadding: 9, diagramPadding: 14, nodeSpacing: 54, rankSpacing: 67 },
      } : {}),
      flowchart: { useMaxWidth: false, nodeSpacing: 44, rankSpacing: 54, padding: 16, curve: 'linear' },
      sequence: { useMaxWidth: false },
    });
    const id = `moye-mermaid-${++sequence}`;
    try {
      const { svg } = await mermaid.render(id, source);
      if (!isCurrent()) return null;
      const element = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
      const [, , width, height] = (element.getAttribute('viewBox') ?? '').split(/[ ,]+/).map(Number);
      if (fontRule) {
        // An SVG loaded as an image cannot inherit the page's fonts or fetch a font file.
        const style = element.ownerDocument.createElementNS(element.namespaceURI, 'style');
        style.textContent = fontRule;
        element.prepend(style);
      }
      return { svg: fontRule ? new XMLSerializer().serializeToString(element) : svg, width: width || 640, height: height || 480 };
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
