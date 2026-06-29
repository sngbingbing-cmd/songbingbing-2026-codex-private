const fs = require('node:fs');
const path = require('node:path');
const {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');

function inlineRuns(text) {
  const runs = [];
  String(text || '').split(/(\*\*[^*]+\*\*)/g).filter(Boolean).forEach((part) => {
    const bold = part.startsWith('**') && part.endsWith('**');
    runs.push(new TextRun({ text: bold ? part.slice(2, -2) : part, bold, font: 'Arial' }));
  });
  return runs;
}

function tableFromLines(lines) {
  const rows = lines
    .filter((line, index) => index !== 1 || !/^\|[\s:|-]+\|$/.test(line.trim()))
    .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, rowIndex) => new TableRow({
      children: cells.map((cell) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: cell, bold: rowIndex === 0, font: 'Arial' })] })],
      })),
    })),
  });
}

function markdownToDocxChildren(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const children = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith('|') && lines[index + 1]?.trim().startsWith('|')) {
      const tableLines = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) tableLines.push(lines[index++]);
      index -= 1;
      children.push(tableFromLines(tableLines));
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
      children.push(new Paragraph({ heading: levels[heading[1].length - 1], children: inlineRuns(heading[2]) }));
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: inlineRuns(bullet[1]) }));
      continue;
    }
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (numbered) {
      children.push(new Paragraph({ numbering: { reference: 'report-numbering', level: 0 }, children: inlineRuns(numbered[1]) }));
      continue;
    }
    children.push(new Paragraph({ children: inlineRuns(line), spacing: { after: line ? 100 : 40 } }));
  }
  return children;
}

async function exportMarkdownToWord(markdownPath, outputPath, title) {
  const markdown = fs.readFileSync(markdownPath, 'utf8');
  const doc = new Document({
    numbering: {
      config: [{ reference: 'report-numbering', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }] }],
    },
    sections: [{
      properties: {},
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: title, bold: true, font: 'Arial' })] }),
        ...markdownToDocxChildren(markdown),
      ],
    }],
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, await Packer.toBuffer(doc));
  return outputPath;
}

module.exports = { exportMarkdownToWord, markdownToDocxChildren };
