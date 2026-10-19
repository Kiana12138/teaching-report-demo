import { renderEvidenceCollection, bindEvidencePlayers, pauseEvidenceVideos, playEvidenceVideo, mediaURL, evidenceCaption } from "./evidence-player.js?v=a19010ccf9e1fa1c";
import { buildCinemaSlides } from "./cinema-model.js?v=a19010ccf9e1fa1c";
import { renderMarkdown } from "./markdown.js?v=a19010ccf9e1fa1c";
import { reportPageKey, reportSpeechText } from "./report-speech.js?v=a19010ccf9e1fa1c";

const staticMode = document.documentElement.dataset.reportMode === "static";
const staticBase = new URL("./", document.baseURI);
const { ReportTTSPlayer } = await import(staticMode ? "./static-tts-player.js?v=a19010ccf9e1fa1c" : "./tts-player.js?v=a19010ccf9e1fa1c");
async function buildBuiltinExample() {
  return (await import("./builtin-example.js?v=a19010ccf9e1fa1c")).buildBuiltinExample();
}

const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (ch) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const inlineReportText = (value = "") => renderMarkdown(
  String(value).replaceAll("\u0000", "").replace(/\s*\n\s*/g, " "),
  { inline: true },
);
const pad = (number) => String(number).padStart(2, "0");
const stage = $("#stageView");
const strip = $("#segs");
const runId = new URLSearchParams(location.search).get("run");
// 登录阅读与两个公开课例集共享放映厅。
const new2Mode = location.pathname === "/new2";
const publicMode = new2Mode || location.pathname === "/new";
const publicMedia = new2Mode ? "new2" : publicMode;
const portableBuiltin = !new2Mode && runId === "builtin";
const targetRun = runId && runId !== "latest" && !portableBuiltin ? runId : "";
const BUILT_IN_PREFIX = "内置示例";
const API_BASE = new2Mode ? "/api/public/new2" : publicMode ? "/api/public" : "/api";
const READER_PATH = new2Mode ? "/new2" : publicMode ? "/new" : "/report";
const currentUrl = `${API_BASE}/report${publicMode ? "" : "/current"}${targetRun ? `?run=${encodeURIComponent(targetRun)}` : ""}`;

let slides = [];
let windows = [];
let slideWindow = [];
let current = -1;

function reportMediaURL(raw) {
  const safe = mediaURL(raw, publicMedia);
  if (!staticMode) return safe;
  return safe.startsWith('/assets/') ? new URL(safe.slice(1), staticBase).href : '';
}

function safeImage(src) {
  if (staticMode) return reportMediaURL(src);
  if (typeof src !== "string") return "";
  try {
    const url = new URL(src, location.origin);
    if (url.origin !== location.origin) return "";
    const asset = /^\/api\/runs\/([a-f0-9]{32})\/assets\/([^/]+)$/.exec(url.pathname);
    if (asset) return publicMode ? `${API_BASE}/runs/${asset[1]}/assets/${asset[2]}` : url.pathname;
    if (/^\/assets\/[^/]+$/.test(url.pathname)) return url.pathname + url.search;
  } catch { /* Bad image reference: show an empty evidence card. */ }
  return "";
}

function missingEvidence(message = "暂无图像证据") {
  return `<div class="intertitle"><div class="inner">
    <div class="it-k">课 堂 证 据</div>
    <div class="it-t">${inlineReportText(message)}</div>
    <div class="it-foot">未提供可显示的素材</div>
  </div></div>`;
}

function evidenceKind(evidence) {
  if (evidence?.kind === 'head_orientation') return '头部朝向';
  if (evidence?.kind === 'schematic') return '教学示意';
  if (evidence?.items?.length) {
    const item = evidence.items.find(item => item.kind === "image") || evidence.items[0];
    return evidenceCaption(item).split(' · ')[0];
  }
  if (evidence?.chip) return evidence.chip;
  return evidenceCaption(evidence || {}).split(' · ')[0];
}

function evidenceFrame(slide) {
  const evidence = slide.evidence;
  if (Array.isArray(evidence?.items) || ['head_orientation', 'schematic'].includes(evidence?.kind)) {
    return renderEvidenceCollection(evidence, publicMedia, reportMediaURL) || missingEvidence();
  }
  const src = safeImage(evidence?.imageSrc);
  if (!src) return missingEvidence();
  const caption = evidenceCaption(evidence);
  return `<div class="film" data-fit="pending"><div class="perf"></div>
    <div class="frame"><img src="${escapeHTML(src)}" alt="${escapeHTML(evidence?.imageAlt || "课堂证据图")}" /></div>
    <div class="film-cap"><span>${escapeHTML(caption)}</span></div>
    <div class="perf"></div></div>`;
}

function staticSlide(slide) {
  if (slide.type === "overview") return overviewSlide(slide);
  const content = slide.cards.map((card) =>
    `${card.title ? `<h2>${inlineReportText(card.title)}</h2>` : ""}<div class="prose report-markdown">${renderMarkdown(card.text || "")}</div>`
  ).join("");
  return `<section class="slide" aria-hidden="true"><div class="center-col scroll">
    <h1 class="act-title">${escapeHTML(slide.section)}</h1><div class="act-rule"></div>
    ${content || '<div class="prose">本页暂无内容</div>'}
  </div></section>`;
}

function overviewSlide(slide) {
  const cover = overviewCover(slide.evidence);
  const content = slide.cards.map(card =>
    `${card.title ? `<h3>${inlineReportText(card.title)}</h3>` : ""}<div class="prose report-markdown">${renderMarkdown(card.text || "")}</div>`
  ).join("");
  return `<section class="slide" aria-hidden="true"><div class="scene scene-overview${cover ? '' : ' scene-text-only'}">
    <div class="scene-txt-wrap">
      <div class="scene-txt scroll"><h1 class="act-title">${escapeHTML(slide.section)}</h1><div class="act-rule"></div>
        <div class="overview-copy">${content || '<div class="prose"><p>本页暂无内容</p></div>'}</div>
      </div></div>
    ${cover ? `<div class="scene-left overview-cover">${cover}</div>` : ''}
  </div></section>`;
}

function overviewCover(evidence) {
  const image = evidence?.items?.find(item => item.kind === "image" && reportMediaURL(item.imageSrc))
    || (reportMediaURL(evidence?.imageSrc) ? {
      ...evidence, kind: "image",
    } : null);
  return image ? renderEvidenceCollection({items: [{...image, sourceType: 'ppt', imageAlt: image.imageAlt || "本节课 PPT 封面"}]},
    publicMedia, reportMediaURL) : "";
}

function suggestionItemCount(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const listCount = [...template.content.querySelectorAll("li")]
    .filter((item) => !item.parentElement.closest("li")).length;
  if (listCount) return listCount;
  // 主建议和备选方案也可以写成独立段落。
  return [...template.content.children]
    .filter((item) => item.tagName === "P" && item.textContent.trim()).length;
}

function issueSlide(slide) {
  const block = slide.kind === "suggestion" ? "blk-sugg" : "blk-cause";
  const body = slide.text ? renderMarkdown(slide.text) : "<p>本页暂无正文</p>";
  const count = slide.kind === "suggestion" ? suggestionItemCount(body) : 0;
  const label = count ? `${slide.partLabel} · ${count} 条` : slide.partLabel;
  const comparison = slide.evidence?.kind === 'head_orientation' ? ' scene-comparison' : '';
  return `<section class="slide" aria-hidden="true"><div class="scene${comparison}">
    <div class="scene-txt-wrap"><div class="scene-head"><b>${escapeHTML(slide.number)}</b><span>${inlineReportText(slide.dimension)}</span></div>
      <div class="scene-txt scroll"><h2>${inlineReportText(slide.title)}</h2>
        <div class="${block}"><div class="blk-label">${label}</div>
          <div class="report-markdown">${body}</div>
        </div>
      </div></div>
    <div class="scene-left">${evidenceFrame(slide)}</div>
  </div></section>`;
}

function fitComparisonFrame(scene) {
  const film = scene?.querySelector('.evidence-pair');
  if (!film) return;
  film.style.removeProperty('width');
  if (innerWidth <= 800) return;
  const frame = film.querySelector('.frame');
  const img = frame.querySelector('img');
  const image = img?.getBoundingClientRect();
  if (!image?.height) return;
  const gap = parseFloat(getComputedStyle(scene).gap) || 0;
  const margin = parseFloat(getComputedStyle(film).marginBottom) || 0;
  const available = scene.clientHeight - scene.querySelector('.scene-txt-wrap').offsetHeight - gap - margin;
  const overhead = film.offsetHeight - image.height;
  const imageHeight = Math.max(150, available - overhead);
  const sideSpace = film.offsetWidth - image.width * 2;
  // Fit both views and perforations when there is room; compact windows can scroll.
  film.style.width = `${Math.min(film.parentElement.clientWidth, imageHeight * (image.width / image.height) * 2 + sideSpace)}px`;
}

function fitEvidenceFrame(img) {
  const film = img.closest(".film");
  const frame = img.closest(".frame");
  if (film?.classList.contains('evidence-pair')) { fitComparisonFrame(film.closest('.scene-comparison')); return; }
  if (!film || !frame || film.hidden || !film.offsetWidth || !img.naturalWidth || !img.naturalHeight) return;

  // 先恢复 CSS 给出的高度上限，避免在窗口缩放后沿用上一次的尺寸。
  film.style.removeProperty("width");
  frame.style.removeProperty("height");
  const frameStyle = getComputedStyle(frame);
  const filmStyle = getComputedStyle(film);
  const paddingX = parseFloat(frameStyle.paddingLeft) + parseFloat(frameStyle.paddingRight);
  const paddingY = parseFloat(frameStyle.paddingTop) + parseFloat(frameStyle.paddingBottom);
  const borderX = parseFloat(filmStyle.borderLeftWidth) + parseFloat(filmStyle.borderRightWidth);
  const maxWidth = film.parentElement.clientWidth;
  const maxImageWidth = Math.max(1, maxWidth - paddingX - borderX);
  const maxImageHeight = Math.max(1, frame.clientHeight - paddingY);
  const scale = Math.min(maxImageWidth / img.naturalWidth, maxImageHeight / img.naturalHeight);
  const imageWidth = img.naturalWidth * scale;
  const imageHeight = img.naturalHeight * scale;
  film.style.width = `${Math.min(maxWidth, Math.max(180, imageWidth + paddingX + borderX))}px`;
  frame.style.height = `${imageHeight + paddingY}px`;
  film.removeAttribute("data-fit");
}

function renderSlides(payload) {
  slides = buildCinemaSlides(payload);
  stage.innerHTML = slides.map((slide) => slide.type === "issue"
    ? issueSlide(slide) : staticSlide(slide)).join("");
  const overview = slides.map((slide, index) => ({ slide, index })).filter(({slide}) => slide.type === "overview");
  const issues = slides.map((slide, index) => ({ slide, index })).filter(({slide}) => slide.type === "issue");
  const summary = slides.map((slide, index) => ({ slide, index })).filter(({slide}) => slide.type === "summary");
  windows = [];
  slideWindow = [];
  const issueWindow = new Map();
  slides.forEach((slide, index) => {
    let windowIndex = slide.type === "issue" ? issueWindow.get(slide.group) : undefined;
    if (windowIndex === undefined) {
      windowIndex = windows.length;
      windows.push({ type: slide.type, slide, pages: [] });
      if (slide.type === "issue") issueWindow.set(slide.group, windowIndex);
    }
    windows[windowIndex].pages.push(index);
    slideWindow[index] = windowIndex;
  });
  const chinese = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  const cell = (window, windowIndex) => {
    const slide = window.slide;
    const tipId = `film-tip-${windowIndex}`;
    if (window.type !== "issue") {
      const tip = window.type === "overview" ? "教学概览" : "改进方向";
      return `<div class="frw"><button class="fr end" type="button" data-win="${windowIndex}" aria-label="跳转到${escapeHTML(slide.section)}" aria-describedby="${tipId}"><span class="ch">${escapeHTML(slide.section)}</span></button>
        <span class="tip" id="${tipId}" role="tooltip"><b>${tip}</b></span></div>`;
    }
    const name = `问题${chinese[slide.ordinal] || slide.ordinal}`;
    const evidence = window.pages.map((index) => slides[index].evidence)
      .find((item) => item?.items?.length || safeImage(item?.imageSrc) || ['head_orientation', 'schematic'].includes(item?.kind));
    const src = safeImage(evidence?.imageSrc || evidence?.distribution?.imageSrc || evidence?.items?.find(item => item.kind === "image")?.imageSrc || evidence?.items?.find(item => item.kind === "video")?.posterSrc);
    const media = src
      ? `<span class="media"><img src="${escapeHTML(src)}" alt="" loading="lazy" /><em class="chip">${escapeHTML(evidenceKind(evidence))}</em></span>`
      : `<span class="media cap"><span class="tx">${evidence?.kind === 'schematic' ? '教学示意' : evidence?.items?.length ? '课堂视频' : '暂无图像证据'}</span></span>`;
    return `<div class="frw"><button class="fr" type="button" data-win="${windowIndex}" aria-label="跳转到${name}：${escapeHTML(slide.dimension)}" aria-describedby="${tipId}">
      ${media}<span class="nm">${name}</span></button>
      <span class="tip" id="${tipId}" role="tooltip"><span class="k">${name}</span><b>${inlineReportText(slide.dimension)}</b></span></div>`;
  };
  strip.innerHTML = `<div class="perf"></div><div class="cells">${windows.map(cell).join("")}</div><div class="perf"></div>`;
  const issueGroups = new Map();
  issues.forEach(({slide,index}) => {
    if (!issueGroups.has(slide.group)) issueGroups.set(slide.group, []);
    issueGroups.get(slide.group).push({slide,index});
  });
  $("#sideList").innerHTML = `${overview.map(({slide,index}) => `<div class="sn-block" data-idx="${index}"><button class="sn-item" type="button" data-idx="${index}"><span class="no">1</span><span class="nm">概览</span></button></div>`).join("")}
    ${issues.length ? `<div class="sn-group"><div class="sn-group-cap"><b>2</b>问题分析</div>${[...issueGroups.values()].map((items) => {
      const first = items[0];
      return `<div class="sn-block" data-group="${escapeHTML(first.slide.group)}"><button class="sn-item" type="button" data-idx="${first.index}" title="${escapeHTML(first.slide.dimension)}"><span class="no">${first.slide.number}</span><span class="nm">${inlineReportText(first.slide.dimension)}</span></button><div class="sn-sub">${items.map(({slide,index}) => `<button type="button" data-idx="${index}">${slide.partLabel}</button>`).join("")}</div></div>`;
    }).join("")}</div>` : ""}
    ${summary.map(({slide,index}) => `<div class="sn-block" data-idx="${index}"><button class="sn-item" type="button" data-idx="${index}"><span class="no">3</span><span class="nm">总结</span></button></div>`).join("")}`;

  document.querySelectorAll(".scroll").forEach((element) => {
    let timer;
    element.addEventListener("scroll", () => {
      element.classList.add("is-scrolling");
      clearTimeout(timer);
      timer = setTimeout(() => element.classList.remove("is-scrolling"), 900);
    }, { passive: true });
  });
  stage.querySelectorAll(".film img, .static-evidence img").forEach((img) => {
    if (img.closest(".film")) {
      img.addEventListener("load", () => fitEvidenceFrame(img));
      if (img.complete && img.naturalWidth) requestAnimationFrame(() => fitEvidenceFrame(img));
    }
    img.addEventListener("error", () => {
      const view = img.closest('.evidence-view');
      if (view) {
        view.querySelector('a').replaceWith(document.createTextNode('素材暂时无法加载'));
        return;
      }
      const holder = img.closest(".film, .static-evidence");
      if (holder?.classList.contains("film")) holder.outerHTML = missingEvidence("证据图片暂时无法加载");
      else holder?.remove();
    });
  });
  strip.querySelectorAll("img").forEach((img) => {
    img.addEventListener("error", () => {
      const media = img.closest(".media");
      if (media) {
        media.classList.add("cap");
        media.innerHTML = '<span class="tx">暂无图像证据</span>';
      }
    });
  });
  current = -1;
  show(0, false);
}

function show(index, setHash = true) {
  if (!slides.length) return;
  index = Math.max(0, Math.min(slides.length - 1, index));
  if (index === current) return;
  const entering = stage.querySelectorAll(".slide")[index];
  if (current >= 0 && entering) {
    entering.style.transition = "none";
    entering.style.transform = `translateX(${index > current ? 34 : -34}px)`;
    entering.style.opacity = "0";
    entering.style.visibility = "visible";
    entering.getBoundingClientRect();
    entering.style.removeProperty("transition");
    entering.style.removeProperty("transform");
    entering.style.removeProperty("opacity");
    entering.style.removeProperty("visibility");
  }
  stage.querySelectorAll(".slide").forEach((element, position) => {
    const active = position === index;
    element.classList.toggle("active", active);
    element.setAttribute("aria-hidden", String(!active));
    if (active) {
      element.querySelectorAll(".scroll").forEach((scroller) => { scroller.scrollTop = 0; });
      element.querySelector(".scene")?.scrollTo({ top: 0 });
    }
  });
  const activeWindow = slideWindow[index];
  strip.querySelectorAll(".fr").forEach((button) => {
    const position = Number(button.dataset.win);
    button.classList.toggle("cur", position === activeWindow);
    button.classList.toggle("done", position < activeWindow);
    if (position === activeWindow) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  $("#sideList").querySelectorAll(".sn-block").forEach((block) => {
    const active = slides[index].type === "issue"
      ? block.dataset.group === slides[index].group
      : Number(block.dataset.idx) === index;
    block.classList.toggle("cur", active);
    block.querySelectorAll("button[data-idx]").forEach((button) => {
      const selected = Number(button.dataset.idx) === index;
      button.classList.toggle("cur", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  });
  pauseEvidenceVideos(stage);
  bindEvidencePlayers(stage);
  fitComparisonFrame(entering?.querySelector('.scene-comparison'));
  current = index;
  const slide = slides[index];
  $("#slideLabel").innerHTML = slide.type === "issue"
    ? `${slide.number} · ${inlineReportText(slide.dimension)} <i>· ${slide.partLabel}</i>`
    : `${slide.type === "overview" ? "1 · 教学概览" : "3 · 改进方向"}`;
  $("#counter").innerHTML = `<b>${pad(activeWindow + 1)}</b> / ${pad(windows.length)}`;
  $("#prevBtn").disabled = index === 0;
  $("#nextBtn").disabled = index === slides.length - 1;
  strip.querySelector(".fr.cur")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  $("#sideList .sn-block.cur")?.scrollIntoView({ block: "nearest" });
  if (setHash) history.replaceState(null, "", `#s=${index + 1}`);
  window.dispatchEvent(new CustomEvent("report-page-change", { detail: { index } }));
  void playEvidenceVideo(entering);
}

function speechText() {
  return reportSpeechText(stage.querySelector(".slide.active"));
}

const player = new ReportTTSPlayer($("#readBtn"), $("#readLabel"), speechText, staticMode ? {
  manifest: await fetchReport(new URL("./narration-manifest.json", staticBase)),
  getPageKey: () => reportPageKey(slides[current]),
  beforePlay: () => pauseEvidenceVideos(stage),
  baseURL: staticBase,
} : {endpoint: `${API_BASE}/tts/ws`});
const controls = [staticMode ? null : $("#srcCtl"), $("#rateCtl")].filter(Boolean);
function closeMenus() {
  controls.forEach((control) => {
    control.classList.remove("is-open");
    control.setAttribute("aria-expanded", "false");
  });
}
function toggleMenu(control) {
  const open = !control.classList.contains("is-open");
  closeMenus();
  control.classList.toggle("is-open", open);
  control.setAttribute("aria-expanded", String(open));
}
controls.forEach((control) => {
  control.addEventListener("click", (event) => {
    if (event.target.closest(".ctl-menu")) return;
    toggleMenu(control);
  });
  control.addEventListener("keydown", (event) => {
    if (event.target !== control || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    toggleMenu(control);
  });
});
document.addEventListener("click", (event) => { if (!event.target.closest(".ctl")) closeMenus(); });

const rates = [0.75, 1, 1.25, 1.5, 2];
let rate = Number(localStorage.getItem("cinema-rate")) || 1;
if (!rates.includes(rate)) rate = 1;
function renderRates() {
  $("#rateVal").textContent = `${rate}x`;
  $("#rateMenu").innerHTML = rates.map((value) =>
    `<button type="button" data-rate="${value}" role="menuitemradio" aria-checked="${value === rate}" class="${value === rate ? "active" : ""}">${value}x</button>`).join("");
}
player.setRate(rate);
renderRates();
$("#rateMenu").addEventListener("click", (event) => {
  const button = event.target.closest("[data-rate]");
  if (!button) return;
  rate = Number(button.dataset.rate);
  player.setRate(rate);
  localStorage.setItem("cinema-rate", String(rate));
  renderRates();
  closeMenus();
});

let theme = document.documentElement.dataset.theme || "white";
function syncTheme() {
  document.documentElement.dataset.theme = theme;
  $("#themeBtn").setAttribute("aria-pressed", String(theme === "white"));
}
syncTheme();
$("#themeBtn").addEventListener("click", () => {
  theme = theme === "dark" ? "white" : "dark";
  localStorage.setItem("cinema-theme", theme);
  syncTheme();
});

async function fetchReport(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`报告加载失败（HTTP ${response.status}）`);
  return response.json();
}

async function resolveDefaultPayload() {
  // Prefer an existing published example; fresh checkouts have the same example in code.
  try {
    const response = await fetch(`${API_BASE}/reports`, { cache: "no-store" });
    if (response.ok) {
      const entries = await response.json();
      const builtIn = entries.find((entry) =>
        /^[a-f0-9]{32}$/.test(entry.name) && String(entry.videoName || "").startsWith(BUILT_IN_PREFIX));
      if (builtIn) {
        const payload = await fetchReport(`${API_BASE}/report?run=${encodeURIComponent(builtIn.name)}`);
        if (payload) return payload;
      }
    }
  } catch (error) { console.warn("[放映室] 查找内置示例失败", error); }
  return buildBuiltinExample();
}

async function loadReport() {
  if (staticMode) return fetchReport(new URL("./report.json", staticBase));
  if (portableBuiltin) return buildBuiltinExample();
  if (targetRun || !publicMode || new2Mode) return fetchReport(currentUrl);
  const payload = await resolveDefaultPayload();
  return payload;
}

async function loadChoices() {
  if (staticMode) {
    $("#srcCtl").removeAttribute("role");
    $("#srcCtl").removeAttribute("tabindex");
    $("#srcCtl").removeAttribute("aria-haspopup");
    $("#srcCtl .chev").style.display = "none";
    return;
  }
  let reportEntries = [];
  try {
    const response = await fetch(`${API_BASE}/reports`, { cache: "no-store" });
    if (response.ok) {
      const entries = await response.json();
      reportEntries = entries.filter((entry) => /^[a-f0-9]{32}$/.test(entry.name));
    }
  } catch (error) { console.warn("[放映室] 报告列表加载失败", error); }
  let defaultChoice = reportEntries[0]?.name;
  if (publicMode && !new2Mode) {
    const isBuiltin = entry => String(entry.videoName || "").startsWith(BUILT_IN_PREFIX);
    const publishedBuiltin = reportEntries.find(isBuiltin);
    const builtinChoice = !portableBuiltin && publishedBuiltin
      ? publishedBuiltin : {name: 'builtin', videoName: '内置示例_函数的单调性'};
    reportEntries = [builtinChoice, ...reportEntries.filter(entry => !isBuiltin(entry))];
    defaultChoice = builtinChoice.name;
  }
  const active = targetRun || defaultChoice;
  $("#srcMenu").innerHTML =
    reportEntries.map((entry) =>
      `<button type="button" data-run="${entry.name}" role="menuitem" class="${entry.name === active ? "active" : ""}">
        <span>${escapeHTML(entry.videoName || entry.name)}</span><span>${escapeHTML((entry.publishedAt || "").slice(0, 10))}</span></button>`).join("");
}
$("#srcMenu").addEventListener("click", (event) => {
  const button = event.target.closest("[data-run]");
  if (!button) return;
  const selected = button.dataset.run;
  location.href = READER_PATH + "?run=" + encodeURIComponent(selected);
});

function showMessage(message) {
  slides = [];
  windows = [];
  slideWindow = [];
  stage.innerHTML = `<section class="slide active" aria-hidden="false"><div class="center-col scroll"><h1 class="act-title">微格实训智能反馈平台</h1><div class="act-rule"></div><div class="prose"><p>${escapeHTML(message)}</p></div></div></section>`;
  strip.innerHTML = "";
  $("#sideList").innerHTML = "";
  $("#slideLabel").textContent = message;
  $("#counter").textContent = "00 / 00";
  $("#prevBtn").disabled = true;
  $("#nextBtn").disabled = true;
}

async function refreshReport() {
  try {
    const payload = await loadReport();
    if (!payload) { showMessage("暂无已发布报告"); return; }
    document.title = `微格实训智能反馈平台 · ${payload.videoName || "报告"}`;
    $("#srcName").textContent = payload.videoName || "课堂报告";
    $("#edgeVideo").textContent = payload.videoName || "课堂报告";
    renderSlides(payload);
    const hash = location.hash.match(/^#s=(\d+)$/);
    if (hash) show(Number(hash[1]) - 1, false);
    if (!slides.length) showMessage("报告中暂无可展示的页面");
  } catch (error) { showMessage(error.message); }
}

strip.addEventListener("click", (event) => {
  const button = event.target.closest(".fr[data-win]");
  if (!button) return;
  const windowIndex = Number(button.dataset.win);
  const pages = windows[windowIndex]?.pages || [];
  if (!pages.length) return;
  if (slideWindow[current] === windowIndex && pages.length > 1) {
    show(pages[(pages.indexOf(current) + 1) % pages.length]);
  } else {
    show(pages[0]);
  }
});
$("#sideList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-idx]");
  if (button) show(Number(button.dataset.idx));
});
// 侧栏滚轮用于逐页浏览；细碎的触控板事件先累计，避免一次手势跳过多页。
let sideWheelDistance = 0;
let sideWheelLastAt = 0;
let sideWheelLockedUntil = 0;
$(".sidenav").addEventListener("wheel", (event) => {
  if (!slides.length || event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  event.preventDefault();
  const now = performance.now();
  if (now - sideWheelLastAt > 240) sideWheelDistance = 0;
  sideWheelLastAt = now;
  if (now < sideWheelLockedUntil) return;
  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? $(".sidenav").clientHeight : 1;
  sideWheelDistance += event.deltaY * unit;
  if (Math.abs(sideWheelDistance) < 50) return;
  const direction = Math.sign(sideWheelDistance);
  sideWheelDistance = 0;
  const next = Math.max(0, Math.min(slides.length - 1, current + direction));
  if (next === current) return;
  sideWheelLockedUntil = now + 350;
  show(next);
}, { passive: false });
$("#prevBtn").addEventListener("click", () => show(current - 1));
$("#nextBtn").addEventListener("click", () => show(current + 1));
window.addEventListener("hashchange", () => {
  const match = location.hash.match(/^#s=(\d+)$/);
  if (match) show(Number(match[1]) - 1, false);
});
window.addEventListener("resize", () => {
  stage.querySelectorAll(".film img").forEach(fitEvidenceFrame);
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { closeMenus(); player.stop(); return; }
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.(".ctl, .sidenav, .deck, video, audio, input, textarea, select, [contenteditable]")) return;
  if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) { event.preventDefault(); show(current + 1); }
  if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); show(current - 1); }
  if (event.key === "Home") { event.preventDefault(); show(0); }
  if (event.key === "End") { event.preventDefault(); show(slides.length - 1); }
});

await Promise.all([refreshReport(), loadChoices()]);
