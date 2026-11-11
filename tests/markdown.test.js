import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/markdown.js';

test('highlighting resolves aliases and retains source positions for search navigation', async () => {
  const { html } = await renderMarkdown('# Demo\n\n```JS\nconst value = "<script>";\n```');
  assert.match(html, /<pre[^>]*class="shiki [^"]*"[^>]*data-source-line="3" data-source-end="5"/);
  assert.match(html, /--shiki-light:/);
  assert.match(html, /--shiki-dark:/);
  assert.match(html, /(?:&lt;|&#x3C;)script/);
  assert.doesNotMatch(html, /<script>/);
});

test('unknown and unlabelled fences keep escaped text and usable source positions', async () => {
  const { html } = await renderMarkdown('```custom"><img\n<a href="file">& text</a>\n```\n\n```\nplain text\n```');
  assert.doesNotMatch(html, /class="shiki|<img|<a href/);
  assert.match(html, /custom&quot;&gt;&lt;img/);
  assert.match(html, /&lt;a href=&quot;file&quot;&gt;&amp; text&lt;\/a&gt;/);
  assert.match(html, /data-source-line="1" data-source-end="3"/);
  assert.match(html, /data-source-line="5" data-source-end="7"/);
  assert.match(html, /纯文本/);
});

test('mixed documents send only normal code to Shiki and retain diagram sources', async () => {
  const { html, diagrams } = await renderMarkdown('```mermaid\ngraph LR\nA-->B\n```\n\n```sql\nSELECT * FROM sales;\n```\n\n```plantuml\n@startuml\nA -> B\n@enduml\n```');
  assert.deepEqual(diagrams, [
    { language: 'mermaid', source: 'graph LR\nA-->B\n' },
    { language: 'plantuml', source: '@startuml\nA -> B\n@enduml\n' },
  ]);
  assert.equal((html.match(/class="code-toolbar"/g) ?? []).length, 1);
  assert.match(html, /<figure class="diagram" data-diagram="0" data-source-line="1" data-source-end="4"/);
  assert.match(html, /<pre[^>]*data-source-line="6" data-source-end="8"/);
  assert.match(html, /<figure class="diagram" data-diagram="1" data-source-line="10" data-source-end="14"/);
});
