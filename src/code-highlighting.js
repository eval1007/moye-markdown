import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import githubLight from '@shikijs/themes/github-light';
import githubDark from '@shikijs/themes/github-dark';
import javascript from '@shikijs/langs/javascript';
import typescript from '@shikijs/langs/typescript';
import jsx from '@shikijs/langs/jsx';
import tsx from '@shikijs/langs/tsx';
import json from '@shikijs/langs/json';
import jsonc from '@shikijs/langs/jsonc';
import sql from '@shikijs/langs/sql';
import shellscript from '@shikijs/langs/shellscript';
import powershell from '@shikijs/langs/powershell';
import python from '@shikijs/langs/python';
import java from '@shikijs/langs/java';
import go from '@shikijs/langs/go';
import rust from '@shikijs/langs/rust';
import html from '@shikijs/langs/html';
import css from '@shikijs/langs/css';
import xml from '@shikijs/langs/xml';
import yaml from '@shikijs/langs/yaml';
import toml from '@shikijs/langs/toml';
import docker from '@shikijs/langs/docker';
import diff from '@shikijs/langs/diff';
import markdown from '@shikijs/langs/markdown';

// Keep the offline bundle limited to common document languages and two themes.
const highlighter = createHighlighterCoreSync({
  engine: createJavaScriptRegexEngine({ target: 'ES2018' }),
  themes: [githubLight, githubDark],
  langs: [javascript, typescript, jsx, tsx, json, jsonc, sql, shellscript, powershell,
    python, java, go, rust, html, css, xml, yaml, toml, docker, diff, markdown],
});
const languages = new Set(highlighter.getLoadedLanguages());

/** Returns highlighted HTML with source attributes, or null for an unsupported language. */
export function highlightCode(source, language, attributes) {
  if (!languages.has(language)) return null;
  return highlighter.codeToHtml(source, {
    lang: language,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
    transformers: [{
      pre(node) {
        // Source attributes must live on the rendered node for folder-search navigation.
        Object.assign(node.properties, Object.fromEntries(attributes ?? []));
      },
    }],
  }) + '\n';
}
