const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { exportMarkdownToWord } = require('../electron/word-export.cjs');

describe('Word report export', () => {
  it('creates a real docx package from Markdown', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'word-export-'));
    const source = path.join(root, '报告.md');
    const output = path.join(root, '报告.docx');
    fs.writeFileSync(source, '# 经营分析\n\n- 结论一\n\n| 指标 | 数值 |\n|---|---|\n| 收入 | 100 |', 'utf8');
    await exportMarkdownToWord(source, output, '经营分析');
    const file = fs.readFileSync(output);
    assert.ok(file.length > 1000);
    assert.equal(file.subarray(0, 2).toString(), 'PK');
  });
});
