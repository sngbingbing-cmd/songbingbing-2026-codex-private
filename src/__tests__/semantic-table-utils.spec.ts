import { describe, expect, it } from "vitest";
import { findIncompleteItems, isIncompleteValue, parseMarkdownTable, updateMarkdownTableCell } from "../semantic-table-utils";

const sample = `# 指标口径表

| 指标 | 定义 | 计算方式 | 来源 | 生效日期 | 确认人 |
|------|------|----------|------|----------|--------|
| 收入 | 经营单元确认收入 | 待确认 | 财务系统 | 2026-01-01 | 宋冰冰 |
| 毛利 | 收入减去直接成本 | 收入-成本 | 待补充 | 2026-01-01 | |
| 收缴率 | 实际收缴/应收 | 收缴/应收 | 财务系统 | 2026-01-01 | 宋冰冰 |
`;

describe("parseMarkdownTable", () => {
  it("parses header and data rows", () => {
    const table = parseMarkdownTable(sample);
    expect(table.colNames).toEqual(["指标", "定义", "计算方式", "来源", "生效日期", "确认人"]);
    expect(table.items.length).toBe(3);
    expect(table.items[0].row["指标"]).toBe("收入");
    expect(table.items[1].row["定义"]).toBe("收入减去直接成本");
  });

  it("returns empty result for non-table content", () => {
    const table = parseMarkdownTable("# just a heading\n\nno table here");
    expect(table.colNames).toEqual([]);
    expect(table.items).toEqual([]);
  });
});

describe("isIncompleteValue", () => {
  it("detects empty values", () => {
    expect(isIncompleteValue("")).toBe(true);
    expect(isIncompleteValue("   ")).toBe(true);
  });

  it("detects placeholder markers", () => {
    expect(isIncompleteValue("待确认")).toBe(true);
    expect(isIncompleteValue("待补充")).toBe(true);
    expect(isIncompleteValue("未知")).toBe(true);
    expect(isIncompleteValue("TODO")).toBe(true);
  });

  it("treats normal text as complete", () => {
    expect(isIncompleteValue("收入-成本")).toBe(false);
    expect(isIncompleteValue("宋冰冰")).toBe(false);
  });
});

describe("findIncompleteItems", () => {
  it("finds rows with empty or placeholder cells", () => {
    const table = parseMarkdownTable(sample);
    const incomplete = findIncompleteItems(table);
    expect(incomplete.length).toBe(2);
    expect(incomplete.map((i) => i.row["指标"])).toContain("收入");
    expect(incomplete.map((i) => i.row["指标"])).toContain("毛利");
  });
});

describe("updateMarkdownTableCell", () => {
  it("updates a cell by line index and field name", () => {
    const updated = updateMarkdownTableCell(sample, 4, "计算方式", "SUM(收入)");
    const table = parseMarkdownTable(updated);
    const row = table.items.find((i) => i.row["指标"] === "收入");
    expect(row?.row["计算方式"]).toBe("SUM(收入)");
  });

  it("escapes pipe characters in input", () => {
    const updated = updateMarkdownTableCell(sample, 4, "计算方式", "a|b|c");
    const table = parseMarkdownTable(updated);
    const row = table.items.find((i) => i.row["指标"] === "收入");
    expect(row?.row["计算方式"]).toBe("a／b／c");
  });

  it("preserves unchanged rows", () => {
    const updated = updateMarkdownTableCell(sample, 4, "计算方式", "SUM(收入)");
    const table = parseMarkdownTable(updated);
    const grossProfit = table.items.find((i) => i.row["指标"] === "毛利");
    expect(grossProfit?.row["计算方式"]).toBe("收入-成本");
  });

  it("returns original content for invalid line index", () => {
    expect(updateMarkdownTableCell(sample, 999, "计算方式", "x")).toBe(sample);
  });

  it("returns original content for unknown field", () => {
    expect(updateMarkdownTableCell(sample, 5, "不存在的列", "x")).toBe(sample);
  });
});
