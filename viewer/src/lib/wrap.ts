/**
 * Split text after `/`, `_` and `#` so a renderer can put a <wbr> between the pieces.
 * Browsers never break inside an unspaced token such as an upstream file path, so one such token
 * sets a table column's minimum width and squeezes the other columns on a phone. <wbr> adds a
 * break opportunity without adding a character, so copied text stays exact.
 */
export function breakPoints(text: string): string[] {
  return text.split(/(?<=[/_#])/);
}
