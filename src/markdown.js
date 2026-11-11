import MarkdownIt from 'markdown-it';

const parser = new MarkdownIt({ html: false, linkify: true, typographer: false });
const renderFence = parser.renderer.rules.fence;
parser.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/, 1)[0].toLowerCase();
  if (language !== 'mermaid' && language !== 'plantuml') {
    const code = env.highlightCode(token.content, language, token.attrs)
      ?? renderFence(tokens, index, options, env, renderer);
    const label = parser.utils.escapeHtml(language || '纯文本');
    return '<section class="code-block"><div class="code-toolbar">'
      + '<span class="code-language">' + label + '</span>'
      + '<button type="button" class="copy-code" aria-label="复制代码">复制</button>'
      + '<span class="sr-only copy-status" role="status"></span></div>' + code + '</section>\n';
  }
  const diagram = env.diagrams.push({ language, source: token.content }) - 1;
  return '<figure class="diagram" data-diagram="' + diagram + '"' + renderer.renderAttrs(token) + '></figure>';
};

/** Renders read-only Markdown, loading the bundled highlighter only for ordinary code fences. */
export async function renderMarkdown(text) {
  const env = { diagrams: [] };
  const tokens = parser.parse(text, env);
  if (tokens.some((token) => token.type === 'fence'
    && !['mermaid', 'plantuml'].includes(token.info.trim().split(/\s+/, 1)[0].toLowerCase()))) {
    const { highlightCode } = await import('./code-highlighting.js');
    env.highlightCode = highlightCode;
  }
  const headings = [];
  const counts = new Map();

  for (const [i, token] of tokens.entries()) {
    if (token.map && (token.nesting === 1 || token.type === 'fence' || token.type === 'code_block')) {
      token.attrSet('data-source-line', token.map[0] + 1);
      token.attrSet('data-source-end', token.map[1]);
    }
    if (token.type !== 'heading_open') continue;
    const inline = tokens[i + 1];
    const title = inline.children.map((child) =>
      child.type === 'image' || child.type === 'text' || child.type === 'code_inline' ? child.content : '',
    ).join('').trim();
    const slug = title.toLowerCase().replace(/[^\p{L}\p{N}_ -]+/gu, '').replace(/\s+/g, '-') || 'section';
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    const id = `heading-${count ? `${slug}-${count}` : slug}`;
    token.attrSet('id', id);
    headings.push({ id, title: title || '未命名标题', level: Number(token.tag.slice(1)) });
  }

  return { html: parser.renderer.render(tokens, parser.options, env), headings, diagrams: env.diagrams };
}

export function localReference(value) {
  if (!value || /^(?:[a-z][\w+.-]*:|[/\\])/i.test(value)) return null;
  try { return decodeURIComponent(value.split(/[?#]/, 1)[0]); } catch { return null; }
}
