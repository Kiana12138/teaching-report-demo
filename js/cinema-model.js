// 发布接口中的原因分析和修改建议各是一页；放映室按原顺序展示。
export function buildCinemaSlides(payload) {
  const data = payload?.reportData || {};
  const pages = payload?.reportPages || [];
  const slides = [];
  let issueOrdinal = 0;
  const groupNumbers = new Map();

  for (const entry of pages) {
    const part = data[entry.part];
    if (!part) continue;
    if (entry.part !== "2") {
      const overview = entry.part === "1";
      slides.push({
        type: overview ? "overview" : "summary",
        section: overview ? "概览" : "总结",
        label: entry.label || part.title || "报告",
        cards: part.staticContent?.cards || [],
        evidence: part.evidence || null,
      });
      continue;
    }

    const page = part.pages?.find((item) => item.id === entry.pageId);
    if (!page) continue;
    const match = /^issue-(\d+)-(cause|suggestion)$/.exec(page.id || "");
    const group = match ? `issue-${match[1]}` : page.id;
    if (!groupNumbers.has(group)) groupNumbers.set(group, ++issueOrdinal);
    const ordinal = groupNumbers.get(group);
    const kind = match?.[2] || (page.indicatorLabel === "修改建议" ? "suggestion" : "cause");
    const partLabel = kind === "suggestion" ? "修改建议" : "原因分析";
    const dimension = page.navCaption || page.paneTitle || page.dimension || entry.label || "课堂问题";
    const issues = page.issues?.length ? page.issues : [null];
    for (const issue of issues) {
      slides.push({
        type: "issue", group, ordinal, kind, partLabel,
        number: `2.${ordinal}`,
        label: `${dimension} · ${partLabel}`,
        dimension,
        title: issue?.title || page.title || dimension,
        text: kind === "suggestion" ? issue?.suggestion || "" : issue?.cause || "",
        evidence: issue?.evidence || page.evidence || null,
      });
    }
  }
  return slides;
}
