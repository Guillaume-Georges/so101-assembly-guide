const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) {
      lines.push(cur.trim());
      cur = w;
    } else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, 4);
}
/** 1200x630 dark text card as SVG. */
export function card(title: string, subtitle: string): string {
  const t = wrap(title, 34);
  const s = wrap(subtitle, 64);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#111318"/>
  <rect x="0" y="0" width="14" height="630" fill="#ffb454"/>
  <text x="70" y="90" font-family="system-ui, Helvetica, Arial, sans-serif" font-size="30" fill="#9aa1ad">SO-101 Assembly Guide</text>
  ${t.map((l, i) => `<text x="70" y="${190 + i * 70}" font-family="system-ui, Helvetica, Arial, sans-serif" font-size="58" font-weight="700" fill="#e8eaf0">${esc(l)}</text>`).join('')}
  ${s.map((l, i) => `<text x="70" y="${470 + i * 40}" font-family="system-ui, Helvetica, Arial, sans-serif" font-size="30" fill="#c5cad3">${esc(l)}</text>`).join('')}
</svg>`;
}
