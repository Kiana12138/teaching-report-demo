import { createMathParser, isMathToken, mathOptions } from './math-parser.js?v=20b28f8f57cc6712';
import katex from '../vendor/katex/katex.mjs?v=20b28f8f57cc6712';

// Repairs change wrappers only, never the mathematical body. Fenced/indented
// code is protected using Markdown token ranges rather than global substitution.
export function normalizeMath(source) {
  source = String(source || '');
  const fixes = [], errors = [], ranges = [];
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  for (const t of globalThis.markdownit().parse(source, {})) {
    if (['fence', 'code_block'].includes(t.type) && t.map)
      ranges.push([starts[t.map[0]], starts[t.map[1]] ?? source.length]);
  }
  const location = offset => ({ offset, line: source.slice(0, offset).split('\n').length });
  const wrappers = [['\\\\(', '\\\\)', false], ['\\(', '\\)', false], ['\\\\[', '\\\\]', true], ['\\[', '\\]', true], ['$$', '$$', true], ['$', '$', false]];
  function wrapped(value) {
    return wrappers.find(([open, close]) => value.startsWith(open) && value.endsWith(close) && value.length > open.length + close.length);
  }
  let text = '', i = 0, expected = 0;
  while (i < source.length) {
    const range = ranges.find(([a, b]) => i >= a && i < b);
    if (range) { text += source.slice(i, range[1]); i = range[1]; continue; }
    if (source[i] === '`') {
      const marks = source.slice(i).match(/^`+/)[0];
      const end = source.indexOf(marks, i + marks.length);
      if (end >= 0) {
        const body = source.slice(i + marks.length, end).trim();
        const pair = wrapped(body);
        if (pair) {
          expected++;
          const [open, close, display] = pair, delimiter = display ? '$$' : '$';
          text += delimiter + body.slice(open.length, -close.length) + delimiter;
          fixes.push({ ...location(i), rule: 'unwrap_math_code', message: '移除完整公式外的反引号并统一分隔符' });
        } else text += source.slice(i, end + marks.length);
        i = end + marks.length; continue;
      }
    }
    const pair = wrappers.find(([open]) => source.startsWith(open, i));
    if (pair) {
      const [open, close, display] = pair;
      let end = source.indexOf(close, i + open.length);
      while (end >= 0 && close.startsWith('$') && source[end - 1] === '\\') end = source.indexOf(close, end + close.length);
      if (end < 0 || (!display && source.slice(i + open.length, end).includes('\n'))) {
        errors.push({ ...location(i), code: 'unclosed_math', message: '公式分隔符未闭合或行内公式跨行' });
        text += open; i += open.length; continue;
      }
      expected++;
      let body = source.slice(i + open.length, end);
      let after = end + close.length;
      const degree = source[after] === '°' && /^\s*\d+(?:\.\d+)?\s*$/.test(body);
      if (degree) { body += '^{\\circ}'; after++; }
      const delimiter = display ? '$$' : '$';
      text += delimiter + body + delimiter;
      if (open !== delimiter || degree) fixes.push({ ...location(i), rule: degree ? 'include_degree' : 'math_delimiter', message: degree ? '将度数符号纳入完整公式' : '统一公式分隔符' });
      i = after; continue;
    }
    if (source[i] === '\\' && source[i + 1]) {
      // Markdown escapes and literal dollars must not become math delimiters.
      text += source.slice(i, i + 2); i += 2; continue;
    }
    text += source[i++];
  }
  return { text, fixes, errors, expected };
}

export function validateReport(source) {
  const result = normalizeMath(source);
  let count = 0;
  const validFormulas = [];
  const inspect = (tokens, line = 1) => {
    for (const token of tokens) {
      const at = token.map ? token.map[0] + 1 : line;
      if (isMathToken(token)) {
        count++;
        try { katex.renderToString(token.content, { ...mathOptions, displayMode: token.type.includes('block') }); validFormulas.push(token.content); }
        catch (e) { result.errors.push({ line: at, code: 'invalid_math', formula: token.content, message: String(e.message).slice(0, 500) }); }
      } else if (token.type === 'text' || token.type === 'code_inline') {
        if (/\\(?:frac|sqrt|sin|cos|tan|begin|end|left|right|sum|int|alpha|beta|theta|cdot)\b/.test(token.content))
          result.errors.push({ line: at, code: 'unparsed_math', message: '发现未被公式解析器识别的 LaTeX，请补齐公式分隔符', formula: token.content.slice(0, 300) });
      }
      if (token.children) inspect(token.children, at);
    }
  };
  inspect(createMathParser().parse(result.text, {}));
  if (count !== result.expected) result.errors.push({ code: 'unparsed_wrapper', message: '部分公式虽然有分隔符，但未能被 Markdown 公式解析器识别，请检查空白、嵌套或分隔符位置' });
  return { ...result, valid: result.errors.length === 0, formula_count: count, valid_formulas: validFormulas };
}
