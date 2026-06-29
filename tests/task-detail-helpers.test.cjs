const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildValidationItems, uncheckedItems } = require('../electron/task-detail-helpers.cjs');

describe('Task validation aggregation', () => {
  it('reads unchecked questions from 验证清单', () => {
    assert.deepEqual(uncheckedItems('# 验证清单\n- [x] 已确认\n- [ ] 待确认口径\n- [ ] 待补充原因'), ['待确认口径', '待补充原因']);
  });

  it('combines missing docs, receipt unresolved and checklist questions', () => {
    const items = buildValidationItems({
      requiredDocs: [{ name: '来源清单.md', filled: false }, { name: '分析请求.md', filled: true }],
      receipt: { unresolved: ['行政费用上涨原因待确认'] },
      checklistContent: '- [ ] 现金流口径待确认',
      feedbackFiles: [],
    });
    assert.deepEqual(items.map((item) => item.source), ['来源清单.md', '首次分析回执', '验证清单.md']);
    assert.ok(items.every((item) => item.status === 'pending'));
  });

  it('labels unresolved questions from a reanalysis receipt', () => {
    const items = buildValidationItems({ receipt: { kind: 'reanalysis', unresolved: ['新问题'] } });
    assert.equal(items[0].source, '重分析回执');
  });

  it('marks a question resolved when matching feedback exists', () => {
    const items = buildValidationItems({
      receipt: { unresolved: ['项目亏损原因待确认'] },
      feedbackFiles: ['feedback-receipt-0-1782720000000.md'],
    });
    assert.equal(items[0].status, 'resolved');
  });

  it('deduplicates identical receipt and checklist questions', () => {
    const items = buildValidationItems({
      receipt: { unresolved: ['收缴率下降原因待确认？'] },
      checklistContent: '- [ ] 收缴率下降原因待确认',
    });
    assert.equal(items.length, 1);
  });
});
