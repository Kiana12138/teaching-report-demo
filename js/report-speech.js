import { mathToSpeech } from './tts.js?v=20b28f8f57cc6712';

export const speechRulesVersion = '20261019-v1';

export function reportPageKey(slide) {
  return slide?.type === 'issue' ? `${slide.group}-${slide.kind}` : slide?.type || '';
}

export function reportSpeechText(slide) {
  if (!slide) return '';
  const copy = slide.cloneNode(true);
  copy.querySelectorAll('.film, .intertitle, .scene-head, .evidence-collection, .overview-cover').forEach(element => element.remove());
  copy.querySelectorAll('.katex').forEach(element => {
    const tex = element.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    element.replaceWith(document.createTextNode(tex ? mathToSpeech(tex) : ''));
  });
  return copy.textContent.replace(/\s+/g, ' ').trim();
}
