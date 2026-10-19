import { normalizeMath } from "./report-validation.js?v=fad89be6c91194c4";
import { createMathParser } from "./math-parser.js?v=fad89be6c91194c4";
import katex from "../vendor/katex/katex.mjs?v=fad89be6c91194c4";

const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const math = (source, display) => {
  try {
    return `<span class="formula-highlight${display ? " formula-display" : ""}">${katex.renderToString(source, { displayMode: display, trust: false, strict: "ignore", throwOnError: true, maxExpand: 1000, maxSize: 20 })}</span>`;
  } catch {
    return `<span class="formula-highlight"><code class="math-error formula-fallback">${escape(source)}</code></span>`;
  }
};

// Compatibility for older reports without explicit math delimiters. Match whole
// expressions, including trig arguments and degrees, before escaping HTML.
const atom = String.raw`(?:(?:sin|cos|tan|cot)\s*(?:[A-Za-z]|[0-9]+(?:\.[0-9]+)?)[°]?|[A-Za-z](?:\([^()\n，。；]+\))?[_₀-₉0-9²³⁰¹⁴⁵⁶⁷⁸⁹]*|[0-9]+(?:\.[0-9]+)?(?:°|[A-Za-z])?)`;
const expression = `${atom}(?:\\s*[+*/^−-]\\s*${atom})*`;
const plainFormula = new RegExp(`(?<![\\w/])(?:${expression}(?:\\s*(?:=|<|>|≤|≥|≠)\\s*${expression})+|[0-9]+(?:\\.[0-9]+)?°)(?![\\w])`, "g");
function highlightText(text) {
  let end = 0, html = "";
  for (const match of text.matchAll(plainFormula)) {
    html += escape(text.slice(end, match.index));
    html += `<span class="formula-highlight">${escape(match[0])}</span>`;
    end = match.index + match[0].length;
  }
  return html + escape(text.slice(end));
}

// Resolve known local forms without normalizing arbitrary directories or URLs.
export function evidenceImageName(src, runId, evidence, aliases = {}) {
  if (!/^[a-f0-9]{32}$/.test(runId)) return null;
  let path;
  try { path = decodeURIComponent(src.split(/[?#]/, 1)[0]); }
  catch { return null; }
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.includes("\\")) return null;
  const prefix = `/api/runs/${runId}/assets/`;
  let name;
  if (path.startsWith(prefix)) name = path.slice(prefix.length);
  else {
    if (path.startsWith("/")) return null;
    name = path.replace(/^(?:\.\/)?(?:\.\.\/evidence\/|evidence\/)?/, "");
  }
  if (!name || name.includes("/") || name === "." || name === "..") return null;
  if (!evidence.includes(name)) name = Object.hasOwn(aliases, name) ? aliases[name] : null;
  return evidence.includes(name) ? name : null;
}

export function renderMarkdown(
  text,
  { run_id = "", evidence = [], evidence_aliases = {}, prefix = "md", headings = [], inline = false } = {},
) {
  const md = createMathParser();
  for (const name of Object.keys(md.renderer.rules).filter(name => name.startsWith("math_"))) {
    md.renderer.rules[name] = (tokens, i) => math(tokens[i].content, !inline && (name.includes("block") || name.includes("double")));
  }
  md.renderer.rules.text = (tokens, i) => highlightText(tokens[i].content);
  md.renderer.rules.code_inline = (tokens, i) => {
    const content = tokens[i].content;
    // Some reports wrap complete TeX in backticks, occasionally with escaped
    // delimiters. Interpret only a complete math wrapper, never arbitrary code.
    for (const [open, close, display] of [["\\\\(", "\\\\)", false], ["\\(", "\\)", false], ["\\\\[", "\\\\]", true], ["\\[", "\\]", true], ["$$", "$$", true], ["$", "$", false]]) {
      const value = content.trim();
      if (value.startsWith(open) && value.endsWith(close) && value.length > open.length + close.length) {
        return math(value.slice(open.length, -close.length), display);
      }
    }
    return `<code class="formula-highlight">${escape(content)}</code>`;
  };
  md.renderer.rules.math = (tokens, i) =>
    math(tokens[i].content, tokens[i].meta.display);
  md.renderer.rules.image = (tokens, i) => {
    const token = tokens[i],
      src = token.attrGet("src") || "";
    const name = evidenceImageName(src, run_id, evidence, evidence_aliases);
    if (!name)
      return `<span class="muted">[图片不可用：${escape(token.content || name)}]</span>`;
    return `<img loading="lazy" src="/api/runs/${run_id}/assets/${encodeURIComponent(name)}" alt="${escape(token.content)}">`;
  };
  md.renderer.rules.heading_open = (tokens, i) => {
    const id = `${prefix}-h${headings.length}`;
    headings.push({ id, text: tokens[i + 1]?.content || "" });
    return `<${tokens[i].tag} id="${escape(id)}">`;
  };
  if (inline) {
    md.disable(['link', 'image', 'autolink']);
    return md.renderInline(normalizeMath(text).text);
  }
  return md.render(normalizeMath(text).text);
}
