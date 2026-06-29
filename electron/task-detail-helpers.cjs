function normalizeQuestion(value) {
  return String(value || '')
    .replace(/^[-*\s]+/, '')
    .replace(/[？?。；;，,：:\s]/g, '')
    .toLowerCase();
}

function uncheckedItems(content) {
  return String(content || '')
    .split('\n')
    .map((line) => line.match(/^\s*-\s*\[\s\]\s*(.+?)\s*$/)?.[1])
    .filter(Boolean);
}

function buildValidationItems({ requiredDocs = [], receipt = null, checklistContent = '', feedbackFiles = [] }) {
  const candidates = [];

  requiredDocs.filter((doc) => !doc.filled).forEach((doc, index) => {
    candidates.push({
      id: `missing-${index}`,
      title: `${doc.name}尚未补充`,
      description: '这是可选补齐项，不阻塞分析；补充后可提高结论边界和可信度。',
      source: doc.name,
    });
  });

  const unresolved = Array.isArray(receipt?.unresolved) ? receipt.unresolved : [];
  const receiptLabel = receipt?.kind === 'reanalysis' ? '重分析回执' : '首次分析回执';
  unresolved.forEach((title, index) => {
    candidates.push({
      id: `receipt-${index}`,
      title: String(title),
      description: `${receiptLabel}提出的待确认问题。补充事实、口径或附件后可再次分析。`,
      source: receiptLabel,
    });
  });

  uncheckedItems(checklistContent).forEach((title, index) => {
    candidates.push({
      id: `checklist-${index}`,
      title: String(title),
      description: '验证清单中的待确认项。',
      source: '验证清单.md',
    });
  });

  const seen = new Set();
  return candidates.filter((item) => {
    const key = normalizeQuestion(item.title);
    const duplicate = [...seen].some((existing) => key === existing || (key.length >= 10 && existing.length >= 10 && (key.includes(existing) || existing.includes(key))));
    if (!key || duplicate) return false;
    seen.add(key);
    return true;
  }).map((item) => ({
    ...item,
    status: feedbackFiles.some((name) => name.startsWith(`feedback-${item.id}-`)) ? 'resolved' : 'pending',
  }));
}

module.exports = { buildValidationItems, normalizeQuestion, uncheckedItems };
