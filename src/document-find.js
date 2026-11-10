const searchableBlock = 'p,li,td,th,pre,dt,dd,h1,h2,h3,h4,h5,h6';

function literalMatches(article, query) {
  const pattern = new RegExp(query.replace(/[.*+?{}^$()|[\]\\]/g, '\\$&'), 'giu');
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.parentElement.closest('figure.diagram,[hidden]')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const ranges = [];
  let block;
  let text = '';
  let nodes = [];

  function collect() {
    let first = 0;
    let last = 0;
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      while (nodes[first + 1]?.offset <= start) first++;
      last = Math.max(first, last);
      while (nodes[last + 1]?.offset < end) last++;
      const range = new Range();
      range.setStart(nodes[first].node, start - nodes[first].offset);
      range.setEnd(nodes[last].node, end - nodes[last].offset);
      ranges.push(range);
    }
    text = '';
    nodes = [];
  }

  // Search across inline formatting without letting a match span unrelated blocks.
  for (let node; (node = walker.nextNode());) {
    if (!node.length) continue;
    const next = node.parentElement.closest(searchableBlock) ?? article;
    if (next !== block) {
      collect();
      block = next;
    }
    nodes.push({ node, offset: text.length });
    text += node.data;
  }
  collect();
  return ranges;
}

function blockAtLine(article, line) {
  let best;
  for (const block of article.querySelectorAll('[data-source-line]')) {
    const start = Number(block.dataset.sourceLine);
    const end = Number(block.dataset.sourceEnd);
    if (start > line) continue;
    if (!best || start > Number(best.dataset.sourceLine)
      || (start === Number(best.dataset.sourceLine) && end <= Number(best.dataset.sourceEnd))) best = block;
  }
  return best;
}

/** Finds rendered text and scrolls to matches without modifying the document DOM. */
export function mountDocumentFind(bar, article, reader) {
  const input = bar.querySelector('input');
  const count = bar.querySelector('output');
  const previous = bar.querySelector('#find-prev');
  const next = bar.querySelector('#find-next');
  let ranges = [];
  let index = -1;

  function select(match, sourceBlock) {
    index = match;
    CSS.highlights.delete('moye-current-match');
    const range = ranges[match];
    if (range) {
      CSS.highlights.set('moye-current-match', new Highlight(range));
      const rect = range.getBoundingClientRect();
      reader.scrollBy(0, rect.top + rect.height / 2 - reader.getBoundingClientRect().top - reader.clientHeight / 2);
    } else if (sourceBlock) {
      sourceBlock.scrollIntoView({ block: 'center' });
    }
    count.value = ranges.length ? (index < 0 ? '–' : index + 1) + ' / ' + ranges.length
      : sourceBlock ? '已定位到正文块' : input.value.trim() ? '无匹配' : '';
    previous.disabled = next.disabled = ranges.length === 0;
  }

  function refresh(sourceLine) {
    const query = input.value.trim();
    ranges = query ? literalMatches(article, query) : [];
    const all = new Highlight();
    for (const range of ranges) all.add(range);
    CSS.highlights.set('moye-match', all);
    const sourceBlock = sourceLine ? blockAtLine(article, sourceLine) : null;
    select(sourceBlock ? ranges.findIndex((range) => sourceBlock.contains(range.startContainer)) : 0, sourceBlock);
  }

  function close() {
    bar.hidden = true;
    CSS.highlights?.delete('moye-match');
    CSS.highlights?.delete('moye-current-match');
    ranges = [];
    index = -1;
  }

  function step(delta) {
    if (!ranges.length) return;
    select(index < 0 ? (delta > 0 ? 0 : ranges.length - 1) : (index + delta + ranges.length) % ranges.length);
  }

  input.oninput = (event) => { if (!event.isComposing) refresh(); };
  input.oncompositionend = () => refresh();
  input.onkeydown = (event) => {
    if (event.isComposing || event.key !== 'Enter') return;
    event.preventDefault();
    step(event.shiftKey ? -1 : 1);
  };
  previous.onclick = () => step(-1);
  next.onclick = () => step(1);
  bar.querySelector('#find-close').onclick = () => { close(); reader.focus({ preventScroll: true }); };

  return {
    close,
    show(query, line) {
      bar.hidden = false;
      if (query !== undefined) input.value = query;
      refresh(line);
      if (line) reader.focus({ preventScroll: true });
      else { input.focus({ preventScroll: true }); input.select(); }
    },
  };
}
