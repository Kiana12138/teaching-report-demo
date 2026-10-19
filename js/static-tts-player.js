// Prerecorded narration uses the same controls as the online report reader.
export class ReportTTSPlayer {
  constructor(button, label, getText, {manifest, getPageKey, beforePlay = () => {}, baseURL = document.baseURI} = {}) {
    this.button = button;
    this.label = label;
    this.getText = getText;
    this.manifest = manifest;
    this.getPageKey = getPageKey;
    this.beforePlay = beforePlay;
    this.baseURL = new URL('./', baseURL);
    this.rate = 1;
    this.active = false;
    this.audio = null;
    this.attempt = null;
    button.disabled = !Object.keys(manifest?.pages || {}).length;
    if (button.disabled) button.title = '语音暂不可用';
    button.addEventListener('click', () => this.active ? this.stop() : this.playCurrentPage());
    window.addEventListener('report-page-change', () => this.stop());
    document.addEventListener('play', event => {
      if (event.target instanceof HTMLVideoElement) this.stop();
    }, true);
  }

  currentText() { return this.getText(); }

  setRate(rate) {
    this.rate = rate;
    if (this.audio) this.audio.playbackRate = rate;
  }

  setState(state, message = '') {
    this.button.classList.toggle('is-loading', state === 'loading');
    this.button.classList.toggle('is-playing', state === 'playing');
    this.button.setAttribute('aria-pressed', String(state !== 'idle'));
    this.label.textContent = state === 'idle' ? (message ? '朗读失败' : '朗读本页') : state === 'loading' ? '正在加载' : '停止朗读';
    this.button.title = message || (state === 'idle' ? '使用豆包语音朗读当前页' : '停止朗读');
  }

  async playCurrentPage() {
    const entry = this.manifest?.pages?.[this.getPageKey()];
    if (!entry || !/^\.\/audio\/[A-Za-z0-9_-]+\.[a-f0-9]{16}\.mp3$/.test(entry.audio || '')) {
      this.setState('idle', '当前页语音不可用');
      return;
    }
    this.stop();
    this.beforePlay();
    const attempt = {};
    const audio = new Audio(new URL(entry.audio, this.baseURL).href);
    this.attempt = attempt;
    this.audio = audio;
    this.active = true;
    audio.preload = 'none';
    audio.muted = false;
    audio.volume = 1;
    audio.playbackRate = this.rate;
    audio.preservesPitch = true;
    const current = () => this.active && this.attempt === attempt;
    audio.addEventListener('playing', () => { if (current()) this.setState('playing'); });
    audio.addEventListener('waiting', () => { if (current()) this.setState('loading'); });
    audio.addEventListener('ended', () => { if (current()) this.stop(); });
    audio.addEventListener('error', () => { if (current()) this.stop('语音暂时无法播放，请重试。'); });
    this.setState('loading');
    try {
      await audio.play();
      if (!current()) audio.pause();
    } catch (error) {
      if (current()) this.stop(error.name === 'NotAllowedError' ? '请点击朗读按钮播放。' : '语音暂时无法播放，请重试。');
    }
  }

  stop(message = '') {
    this.active = false;
    this.attempt = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
    this.setState('idle', message);
  }
}
