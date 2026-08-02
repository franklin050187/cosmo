const ALLOWED_TAGS = new Set(["b", "i", "u", "a", "br", "strong", "em"]);
const ALLOWED_ATTRS = new Set(["href", "title", "target"]);

const PROTOCOL_RE = /^(https?|mailto):/i;

function isSafeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith("/") || v.startsWith("#") || v.startsWith("mailto:")) return true;
  return PROTOCOL_RE.test(v);
}

export function sanitizeHtml(html: string): string {
  return html.replace(/<[^>]*>/g, (tag) => {
    const lower = tag.toLowerCase();
    if (lower.startsWith("</")) {
      const tagName = lower.slice(2, -1).trim().split(/\s+/)[0];
      return ALLOWED_TAGS.has(tagName) ? tag : "";
    }
    if (lower.startsWith("<br")) return "<br>";
    const match = lower.match(/^<(\w+)/);
    if (!match) return "";
    const tagName = match[1];
    if (!ALLOWED_TAGS.has(tagName)) return "";
    const attrs: string[] = [];
    const attrRe = /(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*'([^']*)'|(\w+)\s*=\s*([^\s"'>]+)/g;
    let attrMatch;
    while ((attrMatch = attrRe.exec(tag)) !== null) {
      const name = attrMatch[1] || attrMatch[3] || attrMatch[5];
      let value = attrMatch[2] ?? attrMatch[4] ?? attrMatch[6] ?? "";
      if (!name || !ALLOWED_ATTRS.has(name)) continue;
      if (name === "href" && !isSafeUrl(value)) continue;
      attrs.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
    }
    return attrs.length ? `<${tagName} ${attrs.join(" ")}>` : `<${tagName}>`;
  });
}
