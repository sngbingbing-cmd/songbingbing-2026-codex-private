export interface MarkdownTableRow {
  lineIdx: number;
  row: Record<string, string>;
}

export interface ParsedMarkdownTable {
  colNames: string[];
  dataRows: string[];
  items: MarkdownTableRow[];
}

const INCOMPLETE_MARKERS = /待确认|待补充|未知|todo/i;

export function parseMarkdownTable(content: string): ParsedMarkdownTable {
  const lines = content.split('\n');
  const headerLine = lines.find((l) => /^\s*\|.+\|\s*$/.test(l));
  if (!headerLine) return { colNames: [], dataRows: [], items: [] };
  const colNames = headerLine.split('|').slice(1, -1).map((c) => c.trim());
  if (colNames.length === 0) return { colNames: [], dataRows: [], items: [] };
  const headerIdx = lines.indexOf(headerLine);
  const dataRows = lines.slice(headerIdx + 2).filter((l) => /^\s*\|.+\|\s*$/.test(l) && !/^\|[\s:|-]+\|$/.test(l.trim()));
  const items = dataRows.map((l, idx) => {
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    const row: Record<string, string> = {};
    colNames.forEach((c, i) => { if (i < cells.length) row[c] = cells[i]; });
    return { lineIdx: idx + headerIdx + 2, row };
  }).filter((o) => Object.keys(o.row).length > 0);
  return { colNames, dataRows, items };
}

export function isIncompleteValue(value: string): boolean {
  return !value.trim() || INCOMPLETE_MARKERS.test(value);
}

export function findIncompleteItems(table: ParsedMarkdownTable): MarkdownTableRow[] {
  const { colNames, items } = table;
  return items.filter((item) => colNames.some((c) => isIncompleteValue(item.row[c] || '')));
}

export function updateMarkdownTableCell(content: string, lineIdx: number, field: string, value: string): string {
  const lines = content.split('\n');
  const headerLine = lines.find((l) => /^\s*\|.+\|\s*$/.test(l));
  if (!headerLine) return content;
  const colNames = headerLine.split('|').slice(1, -1).map((c) => c.trim());
  const colIdx = colNames.indexOf(field);
  if (colIdx < 0 || lineIdx < 0 || lineIdx >= lines.length) return content;

  const cells = lines[lineIdx].split('|').slice(1, -1);
  if (colIdx >= cells.length) return content;

  cells[colIdx] = ' ' + String(value).replace(/\|/g, '／').replace(/[\r\n]+/g, ' ').trim() + ' ';
  lines[lineIdx] = '|' + cells.join('|') + '|';
  return lines.join('\n');
}
