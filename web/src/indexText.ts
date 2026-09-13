const MD_IMAGE = /!\[([^\]]*?)\]\([^)]*\)/g;
const MD_LINK = /\[([^\]]*?)\]\([^)]*\)/g;
const HTML_A = /<a\b[^>]*>(.*?)<\/a>/gis;
const AUTO_LINK = /<https?:\/\/[^>\s]+>/gi;
const BARE_URL = /(?:https?:\/\/|www\.)[^\s\]<>）】"']+/gi;

function visibleLabel(text: string) {
  const label = (text || "").trim();
  if (!label) return "";
  BARE_URL.lastIndex = 0;
  const whole = new RegExp(`^(?:${BARE_URL.source})$`, "i");
  return whole.test(label) ? "" : label;
}

/** Match server `index_text`: unwrap links/images, keep other markdown. */
export function indexText(text: string) {
  let out = (text || "").replace(HTML_A, (_, inner: string) => visibleLabel(inner.replace(/<[^>]+>/g, "")));
  out = out.replace(MD_IMAGE, (_, alt: string) => visibleLabel(alt));
  out = out.replace(MD_LINK, (_, label: string) => visibleLabel(label));
  out = out.replace(AUTO_LINK, "");
  return out.replace(BARE_URL, "");
}
