import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramType, straightenElkPath } from '../src/diagrams.js';

test('ELK corner coordinates survive straightening, including negatives and exponents', () => {
  assert.equal(
    straightenElkPath('M0,0L40,0Q50,0 50,10L50,40Q50,50 40,50L0,50'),
    'M0,0L40,0L50,0L50,10L50,40L50,50L40,50L0,50',
  );
  assert.equal(straightenElkPath('M0,0Q-1.2e+3,4.5 -2,6L-2,7'), 'M0,0L-1.2e+3,4.5L-2,6L-2,7');
  assert.equal(straightenElkPath('M1,2L3,4'), 'M1,2L3,4');
});

test('layout controls recognize graph types behind frontmatter and comments', () => {
  assert.equal(diagramType('---\ntitle: Demo\n---\n%% Note\nflowchart TB\nA-->B'), 'flowchart');
  assert.equal(diagramType('%%{init: {}}%%\nerDiagram\nA ||--|| B : link'), 'er');
  assert.equal(diagramType('graph LR\nA-->B'), 'flowchart');
  assert.equal(diagramType('sequenceDiagram\nA->>B: hello'), 'other');
});
