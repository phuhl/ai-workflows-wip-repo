import { describe, it, expect, vi, beforeEach } from "vitest";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const fixturesDir = path.resolve(process.cwd(), "tests/fixtures");

vi.mock("node:child_process", async () => {
  const actual =
    await vi.importActual<typeof childProcess>("node:child_process");
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

const execSyncMock = vi.mocked(childProcess.execSync);

function mockGhApi(fixturePath: string | null): void {
  execSyncMock.mockImplementation((cmd: unknown) => {
    const cmdStr = String(cmd);
    if (cmdStr.includes("repo view")) {
      return "test-org/test-repo";
    }
    if (cmdStr.includes("api") && cmdStr.includes("comments")) {
      if (fixturePath === null) {
        return "[]";
      }
      return fs.readFileSync(fixturePath, "utf-8");
    }
    throw new Error(`Unexpected command: ${cmdStr}`);
  });
}

describe("verifyNoUnresolvedComments", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("passes with no comments", async () => {
    mockGhApi(null);
    const { verifyComments } =
      await import("../../scripts/verify-no-unresolved-comments");
    const result = verifyComments(42, "test-org/test-repo");
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("passes with only bot comments", async () => {
    mockGhApi(path.join(fixturesDir, "pr-comments-bot-only.json"));
    const { verifyComments } =
      await import("../../scripts/verify-no-unresolved-comments");
    const result = verifyComments(42, "test-org/test-repo");
    expect(result.ok).toBe(true);
    expect(result.output).toContain("last reply is from opencode[bot]");
  });

  it("fails with unresolved human comments", async () => {
    mockGhApi(path.join(fixturesDir, "pr-comments-unresolved.json"));
    const { verifyComments } =
      await import("../../scripts/verify-no-unresolved-comments");
    const result = verifyComments(42, "test-org/test-repo");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("UNRESOLVED:");
    expect(result.output).toContain("src/foo.ts");
  });

  it("passes with resolved comments (last reply is opencode[bot])", async () => {
    mockGhApi(path.join(fixturesDir, "pr-comments-resolved.json"));
    const { verifyComments } =
      await import("../../scripts/verify-no-unresolved-comments");
    const result = verifyComments(42, "test-org/test-repo");
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("handles gh API failure gracefully", async () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("gh api failed");
    });
    const { verifyComments } =
      await import("../../scripts/verify-no-unresolved-comments");
    const result = verifyComments(42, "test-org/test-repo");
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });
});
