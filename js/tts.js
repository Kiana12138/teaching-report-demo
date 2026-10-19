function cleanMarkdown(value) {
  return String(value ?? "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s*-\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function functionValueToSpeech(_match, argument) {
  return `${mathAtomToSpeech(argument)}对应的函数值`;
}

function mathAtomToSpeech(value) {
  return String(value)
    .trim()
    .replace(/x(?:₁|_1)/g, "x一")
    .replace(/x(?:₂|_2)/g, "x二")
    .replace(/t(?:₁|_1)/g, "t一")
    .replace(/t(?:₂|_2)/g, "t二")
    .replace(/([a-zA-Z])²/g, "$1的平方")
    .replace(/([a-zA-Z])³/g, "$1的立方");
}

/**
 * 将当前项目常见的高中数学表达式转换为适合中文 TTS 的说法。
 * 规则只改读法，不补充原文没有的数学结论。
 */
export function mathToSpeech(value) {
  let text = cleanMarkdown(value);

  const phraseRules = [
    [/y\s*=\s*1\s*\/\s*x/g, "y等于x分之一"],
    [/y\s*=\s*x²/g, "y等于x的平方"],
    [/y\s*=\s*-\s*2/g, "y等于负二"],
    [/y\s*=\s*x(?![a-zA-Z0-9_₀-₉²³])/g, "y等于x"],
    [/f\s*\(\s*(x(?:₁|₂|_1|_2)|t(?:₁|₂|_1|_2)|\d+)\s*\)/g, functionValueToSpeech],
    [/(\d+)\s*[–—]\s*(\d+)/g, "$1到$2"],
    [/板书\s*\/\s*PPT/g, "板书或PPT"],
    [/压缩\s*\/\s*替换/g, "压缩或替换"]
  ];

  for (const [pattern, replacement] of phraseRules) {
    text = text.replace(pattern, replacement);
  }

  const symbolRules = [
    [/x(?:₁|_1)/g, "x一"],
    [/x(?:₂|_2)/g, "x二"],
    [/t(?:₁|_1)/g, "t一"],
    [/t(?:₂|_2)/g, "t二"],
    [/([a-zA-Z])²/g, "$1的平方"],
    [/([a-zA-Z])³/g, "$1的立方"],
    [/≤/g, "小于等于"],
    [/≥/g, "大于等于"],
    [/≠/g, "不等于"],
    [/∈/g, "属于"],
    [/∀/g, "对于任意"],
    [/→/g, "到"],
    [/∞/g, "无穷大"],
    [/</g, "小于"],
    [/>/g, "大于"],
    [/=/g, "等于"],
    [/\//g, "或"]
  ];

  for (const [pattern, replacement] of symbolRules) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\s*，\s*/g, "，")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
