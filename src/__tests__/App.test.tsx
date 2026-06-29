import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { App } from "../App";

afterEach(() => cleanup());

describe("App component smoke test", () => {
  it("renders loading state initially", () => {
    render(<App />);
    const loading = document.querySelector(".app-loading");
    const title = screen.queryByText(/AI原生数据分析工作台/i);
    expect(loading || title).toBeTruthy();
  });

  it("renders main UI after data loads", async () => {
    render(<App />);
    // "AI原生数据分析工作台" appears in both title bar and task path — use findAllByText
    const matches = await screen.findAllByText(/AI原生数据分析工作台/i, {}, { timeout: 8000 });
    expect(matches.length).toBeGreaterThanOrEqual(1);
  }, 15000);

  it("renders 7 stage navigation buttons after loading", async () => {
    render(<App />);
    const stageOne = await screen.findByText("01", {}, { timeout: 8000 });
    expect(stageOne).toBeInTheDocument();
    expect(screen.getByText("概览")).toBeInTheDocument();
    expect(screen.getByText("资料")).toBeInTheDocument();
    expect(screen.getByText("分析")).toBeInTheDocument();
    expect(screen.getByText("验证回流")).toBeInTheDocument();
    expect(screen.getByText("交付")).toBeInTheDocument();
  }, 15000);

  it("renders global rail navigation with title attributes", async () => {
    render(<App />);
    await screen.findByTitle("任务", {}, { timeout: 8000 });
    expect(screen.getByTitle("任务")).toBeInTheDocument();
    expect(screen.getByTitle("语义")).toBeInTheDocument();
    expect(screen.getByTitle("评测")).toBeInTheDocument();
    expect(screen.getByTitle("设置")).toBeInTheDocument();
  }, 15000);

  it("renders workspace switcher button", async () => {
    render(<App />);
    const ws = await screen.findByText("示例工作区", {}, { timeout: 8000 });
    expect(ws).toBeInTheDocument();
  }, 15000);
});
