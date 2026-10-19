import '../vendor/markdown-it/markdown-it.min.js?v=20b28f8f57cc6712';
import texmath from '../vendor/markdown-it-texmath/texmath.js?v=20b28f8f57cc6712';
import katex from '../vendor/katex/katex.mjs?v=20b28f8f57cc6712';

export const mathOptions = {
  throwOnError: true, trust: false, strict: 'ignore',
  maxExpand: 1000, maxSize: 20,
};
export function createMathParser() {
  return globalThis.markdownit({ html: false, linkify: false, breaks: true })
    .use(texmath, { engine: katex, delimiters: ['dollars', 'brackets'], katexOptions: { ...mathOptions } });
}
export function isMathToken(token) { return token.type.startsWith('math_'); }
