import { describe, it, expect, vi, beforeEach } from "vitest";
import * as childProcess from "node:child_process";

vi.mock("node:child_process", async () => {
  const actual =
    await vi.importActual<typeof childProcess>("node:child_process");
  return { ...actual, execSync: vi.fn() };
});

const execSyncMock = vi.mocked(childProcess.execSync);

describe("checkOffSubtask", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exits 1 with no arguments", async () => {
    const { checkOffSubtask } =
      await import("../../.opencode/skills/_shared/scripts/check-off-subtask");
    const result = checkOffSubtask("", "");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Usage:");
  });

  it("exits 1 with missing subtask text", async () => {
    const { checkOffSubtask } =
      await import("../../.opencode/skills/_shared/scripts/check-off-subtask");
    const result = checkOffSubtask("42", "");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("exits 2 when repo not determinable", async () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("gh failed");
    });

    const { checkOffSubtask } =
      await import("../../.opencode/skills/_shared/scripts/check-off-subtask");
    const result = checkOffSubtask("42", "Open draft PR");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
  });

  it("exits 3 when no subtasks comment found", async () => {
    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      if (cmdStr.includes("issue view")) {
        return "";
      }
      return "";
    });

    const { checkOffSubtask } =
      await import("../../.opencode/skills/_shared/scripts/check-off-subtask");
    const result = checkOffSubtask("42", "Open draft PR", "test-org/test-repo");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("No subtasks comment found");
  });

  it("checks off subtask successfully", async () => {
    const subtaskBody = `## Subtasks
- [ ] Write stubs and failing tests
- [ ] Implement logic to pass tests
- [ ] Update docs / README if needed
- [ ] Open draft PR
- [ ] Fix issues found in audit`;

    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      if (cmdStr.includes("issue view")) {
        return JSON.stringify({ id: "1", body: subtaskBody });
      }
      if (cmdStr.includes("api") && cmdStr.includes("comments")) {
        return "12345";
      }
      return "";
    });

    const { checkOffSubtask } =
      await import("../../.opencode/skills/_shared/scripts/check-off-subtask");
    const result = checkOffSubtask("42", "Open draft PR", "test-org/test-repo");
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Checked off: Open draft PR");
  });

  it("warns when subtask text not found", async () => {
    const body = `## Subtasks
- [ ] Write stubs and failing tests
- [ ] Implement logic to pass tests`;

    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      if (cmdStr.includes("issue view")) {
        return JSON.stringify({ id: "1", body });
      }
      if (cmdStr.includes("api") && cmdStr.includes("comments")) {
        return "12345";
      }
      return "";
    });

    const { checkOffSubtask } =
      await import("../../.opencode/skills/_shared/scripts/check-off-subtask");
    const result = checkOffSubtask(
      "42",
      "Nonexistent Task",
      "test-org/test-repo",
    );
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Warning:");
  });
});
