import { renderToString } from '@plantuml/core';
import '@plantuml/core/themes.js';
import * as Viz from '@viz-js/viz';

// PlantUML uses Viz for diagrams that need Graphviz layout.
globalThis.PLANTUML_VIZ = Viz;
// Only the bundled assets are available to PlantUML documents.
globalThis.PLANTUML_STDLIB_LOADER = (file, _loaded, fail) => fail(`未打包 PlantUML 资源：${file}`);

function diagramStyle({ ink, blue, border, edge, paper, group }, fontStack) {
  return `<style>
root {
  FontName ${fontStack}
  FontColor ${ink}
  BackgroundColor ${blue}
  LineColor ${border}
}
document {
  BackgroundColor transparent
  title {
    BackgroundColor transparent
    LineColor transparent
  }
}
arrow {
  LineColor ${edge}
  BackgroundColor ${edge}
}
note {
  BackgroundColor ${group}
  LineColor ${border}
  LineThickness 1
}
sequenceDiagram {
  participant,actor,boundary,control,entity,queue,database,collections {
    BackgroundColor ${blue}
    LineColor ${border}
  }
  lifeLine {
    LineColor ${edge}
  }
  group,groupHeader,separator,reference,referenceHeader {
    LineColor ${border}
    LineThickness 1
  }
  group,reference {
    BackgroundColor transparent
  }
  groupHeader,separator,referenceHeader,box {
    BackgroundColor ${group}
  }
  activationBox {
    BackgroundColor ${paper}
    LineColor ${border}
  }
}
stateDiagram {
  circle {
    start,stop,end {
      BackgroundColor ${edge}
      LineColor ${edge}
    }
  }
}
</style>`;
}

/** Renders a fence to an SVG element, applying app defaults before the document's own styles. */
export async function renderPlantUml(source, palette, fontStack) {
  const style = diagramStyle(palette, fontStack);
  const start = /^[\t ]*@start[a-z]+\b[^\r\n]*/im;
  const input = start.test(source)
    ? source.replace(start, (line) => `${line}\n${style}`)
    : `@startuml\n${style}\n${source}\n@enduml`;
  const svg = await new Promise((resolve, reject) => {
    renderToString(input.split(/\r?\n/), resolve, (message) => reject(new Error(message)));
  });
  const element = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  // PlantUML 1.2026.9 returns syntax and preprocessing diagnostics as terminal-style SVGs.
  const [header, location] = element.querySelectorAll('text');
  if (header?.getAttribute('fill') === '#33FF02' && header.textContent.startsWith('PlantUML version ')
    && location?.textContent.startsWith('[From textarea (line ')) {
    const message = [...element.querySelectorAll('text[fill="#FF0000"]')].at(-1)?.textContent.trim();
    if (message) throw new Error(message);
  }
  return element;
}
