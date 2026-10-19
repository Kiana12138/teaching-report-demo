// Shared by the report reader and cinema. All content is rendered as escaped data.
const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const timeLabel = ms => {
  const seconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
export function mediaURL(raw, publicMode = false) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '';
  if (/^\/assets\/[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|webp|mp4)(?:\?v=[A-Za-z0-9_-]+)?$/.test(raw)) return raw;
  if (!/^\/api\/runs\/[a-zA-Z0-9_-]+\/(?:assets\/[^/?#]+|clips\/snap_[a-f0-9]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/.test(raw)) return '';
  const publicPrefix = publicMode === 'new2' ? '/api/public/new2/runs/' : '/api/public/runs/';
  return publicMode ? raw.replace('/api/runs/', publicPrefix) : raw;
}
export function evidenceCaption(item = {}) {
  if (item.kind === 'video') {
    const known = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    return known(item.startMs) && known(item.endMs)
      ? `课堂视频 · ${timeLabel(item.startMs)}—${timeLabel(item.endMs)}` : '课堂视频 · 时间段未知';
  }
  let type = item.sourceType;
  if (!['ppt', 'board'].includes(type)) {
    const hint = `${item.sourceId || ''} ${item.imageSrc || ''} ${item.imageAlt || ''}`;
    if (/\bboard[_-]|blackboard|板书|(?:^|[.:\s])b\d{4}\b/i.test(hint)) type = 'board';
    else if (/\bppt(?:[_-]|\b)|课件|(?:^|[.:\s])p\d{4}\b/i.test(hint)) type = 'ppt';
  }
  if (type === 'board') return '板书图像';
  if (type === 'ppt') {
    const time = item.capturedAtMs;
    return `PPT 图像 · ${typeof time === 'number' && Number.isFinite(time) && time >= 0 ? timeLabel(time) : '时间点未知'}`;
  }
  return '课堂图像';
}

export function renderEvidenceCollection(evidence, publicMode = false, resolveMedia = raw => mediaURL(raw, publicMode)) {
  // Head orientation is one composite visualization with two complementary views.
  // Ordinary findings still select exactly one image or one clip below.
  if (evidence?.kind === 'head_orientation') {
    const views = [[evidence.motion, '头部朝向动态'], [evidence.distribution, '关注分布热力图']];
    if (views.some(([view]) => !resolveMedia(view?.imageSrc))) return '';
    return `<div class="evidence-collection"><div class="film evidence-card evidence-pair"><div class="perf"></div><div class="frame">${views.map(([view, label]) => {
      const url = esc(resolveMedia(view.imageSrc));
      return `<figure class="evidence-view"><figcaption>${label}</figcaption><a href="${url}" target="_blank" rel="noopener"><img loading="lazy" src="${url}" alt="${esc(view.imageAlt || label)}"></a></figure>`;
    }).join('')}</div><div class="film-cap"><span>头部朝向</span></div><div class="perf"></div></div></div>`;
  }
  if (evidence?.kind === 'schematic') {
    const lines = value => esc(value).replaceAll('\n', '<br>');
    return `<div class="evidence-collection"><div class="film evidence-card evidence-schematic"><div class="perf"></div><div class="frame"><div class="teaching-diagram">
      <div><h3>${esc(evidence.chalkTitle || '')}</h3><p>${esc(evidence.chalkSubtitle || '')}</p>${(evidence.chalkBoxes || []).map(box => `<div class="diagram-box">${lines(box)}</div>`).join('')}</div>
      <div><h3>${esc(evidence.slideTitle || '')}</h3><ul>${(evidence.slideLines || []).map(line => `<li>${esc(line)}</li>`).join('')}</ul></div>
      </div></div><div class="film-cap"><span>教学示意</span></div><div class="perf"></div></div></div>`;
  }
  if (!Array.isArray(evidence?.items)) return '';
  // Prefer a still image; render only the selected source.
  const image = evidence.items.find(item => item.kind === 'image' && resolveMedia(item.imageSrc));
  const selected = image || evidence.items.find(item => item.kind === 'video' && resolveMedia(item.videoSrc));
  const items = selected ? [selected] : [];
  return `<div class="evidence-collection">${items.map((item, index) => {
    const caption = evidenceCaption(item);
    let content;
    if (item.kind === 'image') {
      const url = resolveMedia(item.imageSrc);
      content = url ? `<a href="${esc(url)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(url)}" alt="${esc(item.imageAlt || '课堂证据图')}"></a>` : '<p>图片不可用</p>';
    } else {
      const url = resolveMedia(item.videoSrc);
      const offset = Number(item.mediaOffsetMs || 0);
      const start = (Number(item.startMs) - offset) / 1000, end = (Number(item.endMs) - offset) / 1000;
      const poster = resolveMedia(item.posterSrc);
      content = url ? `<video controls playsinline preload="none"${poster ? ` poster="${esc(poster)}"` : ''} src="${esc(url)}${url.includes('/clips/') ? '' : `#t=${start},${end}`}" data-evidence-video data-start="${start}" data-end="${end}" aria-label="${esc(caption)}"></video>` : '<p>视频不可用</p>';
    }
    return `<div class="film evidence-card" ${index ? 'hidden' : ''}><div class="perf"></div><div class="frame">${content}</div><div class="film-cap"><span>${esc(caption)}</span>${items.length > 1 ? `<button type="button" data-evidence-prev aria-label="上一份素材">‹</button><span>${index + 1}/${items.length}</span><button type="button" data-evidence-next aria-label="下一份素材">›</button>` : ''}</div><p data-media-status aria-live="polite" hidden></p><div class="perf"></div></div>`;
  }).join('')}</div>`;
}

const playbackAttempts = new WeakMap();

export function pauseEvidenceVideos(root = document) {
  root.querySelectorAll('video[data-evidence-video]').forEach(video => {
    playbackAttempts.delete(video);
    video.pause();
  });
}

export async function playEvidenceVideo(root) {
  const video = root?.querySelector('video[data-evidence-video]');
  if (!video) return;
  const attempt = {};
  playbackAttempts.set(video, attempt);
  const current = () => playbackAttempts.get(video) === attempt && video.isConnected
    && !video.closest('[hidden], .slide:not(.active)');
  if (!current()) return;
  const status = video.closest('.evidence-card')?.querySelector('[data-media-status]');
  const message = text => {
    if (!status || !current()) return;
    status.textContent = text;
    status.hidden = !text;
  };
  message('');
  try {
    video.muted = false;
    video.volume = 1;
    video.currentTime = Math.max(0, Number(video.dataset.start) || 0);
    await video.play();
  } catch (error) {
    if (!current() || error.name === 'AbortError') return;
    message(error.name === 'NotAllowedError' ? '点击播放器播放视频。' : '视频暂时无法播放，请刷新重试。');
    return;
  }
  if (!current()) {
    if (!playbackAttempts.has(video) || playbackAttempts.get(video) === attempt) video.pause();
  }
}

export function bindEvidencePlayers(root = document) {
  for (const collection of root.querySelectorAll('.evidence-collection')) {
    if (collection.dataset.bound) continue;
    collection.dataset.bound = '1';
    const cards = [...collection.querySelectorAll('.evidence-card')];
    collection.addEventListener('click', event => {
      const next = event.target.closest('[data-evidence-next]');
      const previous = event.target.closest('[data-evidence-prev]');
      if (!next && !previous) return;
      const current = cards.findIndex(card => !card.hidden);
      const index = (current + (next ? 1 : -1) + cards.length) % cards.length;
      pauseEvidenceVideos(collection);
      cards.forEach((card, i) => { card.hidden = i !== index; });
      window.dispatchEvent(new Event('resize'));
    });
  }
  for (const video of root.querySelectorAll('video[data-evidence-video]')) {
    if (video.dataset.bound) continue;
    video.dataset.bound = '1';
    const status = video.closest('.evidence-card').querySelector('[data-media-status]');
    const start = Number(video.dataset.start), end = Number(video.dataset.end);
    video.addEventListener('loadedmetadata', () => { video.currentTime = start; });
    video.addEventListener('play', () => {
      if (video.closest('[hidden], .slide:not(.active)')) { video.pause(); return; }
      status.textContent = '';
      status.hidden = true;
      document.querySelectorAll('video[data-evidence-video]').forEach(v => { if (v !== video) v.pause(); });
      if (video.currentTime >= end || video.currentTime < start) video.currentTime = start;
    });
    video.addEventListener('seeking', () => {
      if (video.currentTime < start) video.currentTime = start;
      else if (video.currentTime > end) { video.pause(); video.currentTime = end; }
    });
    video.addEventListener('timeupdate', () => {
      if (video.currentTime >= end) video.pause();
    });
    video.addEventListener('error', () => {
      status.hidden = false;
      status.textContent = '视频暂时无法播放，请刷新重试。';
    });
  }
}
