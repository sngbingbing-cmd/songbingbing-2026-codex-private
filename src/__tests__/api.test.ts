import { describe, it, expect } from "vitest";
import { api } from "../api";

describe("mockApi getSnapshot", () => {
  it("returns a valid AppSnapshot with all required fields", async () => {
    const snapshot = await api.getSnapshot();
    expect(snapshot).toBeDefined();
    expect(snapshot.version).toBeTruthy();
    expect(snapshot.workspacePath).toBeTruthy();
    expect(snapshot.workspaceName).toBeTruthy();
    expect(Array.isArray(snapshot.tasks)).toBe(true);
    expect(snapshot.semantic).toBeDefined();
    expect(snapshot.semantic.docs).toBeDefined();
    expect(snapshot.semantic.pending).toBeDefined();
    expect(snapshot.update).toBeDefined();
    expect(typeof snapshot.update.status).toBe("string");
  });

  it("returns a selectedTask with real coverage metrics", async () => {
    const snapshot = await api.getSnapshot();
    if (snapshot.selectedTask) {
      const task = snapshot.selectedTask;
      expect(task.sourceCoverage).toBeGreaterThanOrEqual(0);
      expect(task.sourceCoverage).toBeLessThanOrEqual(100);
      expect(task.semanticCoverage).toBeGreaterThanOrEqual(0);
      expect(task.semanticCoverage).toBeLessThanOrEqual(100);
      expect(typeof task.sourceCoverage).toBe("number");
      expect(typeof task.semanticCoverage).toBe("number");
    }
  });
});

describe("mockApi createTask", () => {
  it("creates a task and adds it to snapshot", async () => {
    const task = await api.createTask("测试任务");
    expect(task).toBeDefined();
    expect(task.name).toBeTruthy();
    expect(task.id).toBeTruthy();
    expect(task.stage).toBe("data");
    expect(task.rawFiles).toBeDefined();
    expect(task.outputs).toBeDefined();
  });
});

describe("mockApi generatePrompt", () => {
  it("generates an analysis prompt with task path", async () => {
    const prompt = await api.generatePrompt("test-task-id", "analysis");
    expect(prompt).toContain("调度单");
    expect(prompt).toContain("test-task-id");
  });

  it("generates a reanalysis prompt", async () => {
    const prompt = await api.generatePrompt("test-task-id", "reanalysis");
    expect(prompt).toContain("重分析");
  });
});

describe("mockApi checkForUpdates", () => {
  it("returns current status", async () => {
    const result = await api.checkForUpdates();
    expect(result.status).toBe("current");
  });
});
