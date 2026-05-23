import { describe, it, expect, vi, beforeEach } from "vitest";
import * as childProcess from "node:child_process";

vi.mock("node:child_process", async () => {
  const actual =
    await vi.importActual<typeof childProcess>("node:child_process");
  return { ...actual, execSync: vi.fn() };
});

const execSyncMock = vi.mocked(childProcess.execSync);

describe("syncBaseBranch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exits 1 with no issue number", async () => {
    execSyncMock.mockImplementation((_cmd: unknown) => {
      return "";
    });
    const { syncBaseBranch } =
      await import("../../src/skills/_shared/scripts/sync-base-branch");
    const result = syncBaseBranch("");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Usage:");
  });

  it("exits 1 with empty issue number", async () => {
    const { syncBaseBranch } =
      await import("../../src/skills/_shared/scripts/sync-base-branch");
    const result = syncBaseBranch("");
    expect(result.exitCode).toBe(1);
  });

  it("exits 2 when no PR found", async () => {
    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("pr list")) {
        return "";
      }
      return "";
    });

    const { syncBaseBranch } =
      await import("../../src/skills/_shared/scripts/sync-base-branch");
    const result = syncBaseBranch("42");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("No open PR found");
  });

  it("exits 3 on merge conflict", async () => {
    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("pr list")) {
        return "123";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("baseRefName")) {
        return "master";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("headRefName")) {
        return "42-my-feature";
      }
      if (cmdStr.includes("git merge")) {
        const err = new Error("CONFLICT") as Error & {
          stdout: string;
          stderr: string;
        };
        err.stdout = "CONFLICT (content): Merge conflict in shared.txt";
        err.stderr = "Automatic merge failed";
        throw err;
      }
      return "";
    });

    const { syncBaseBranch } =
      await import("../../src/skills/_shared/scripts/sync-base-branch");
    const result = syncBaseBranch("42");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("Merge conflicts detected");
  });

  it("succeeds on clean merge", async () => {
    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("pr list")) {
        return "123";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("baseRefName")) {
        return "master";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("headRefName")) {
        return "42-feat";
      }
      if (cmdStr.includes("git merge")) {
        return "Already up to date.";
      }
      return "";
    });

    const { syncBaseBranch } =
      await import("../../src/skills/_shared/scripts/sync-base-branch");
    const result = syncBaseBranch("42");
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Base branch merged successfully");
  });
});
