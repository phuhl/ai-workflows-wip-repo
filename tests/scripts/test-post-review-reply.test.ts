import { describe, it, expect, vi, beforeEach } from "vitest";
import * as childProcess from "node:child_process";

vi.mock("node:child_process", async () => {
  const actual =
    await vi.importActual<typeof childProcess>("node:child_process");
  return { ...actual, execSync: vi.fn() };
});

const execSyncMock = vi.mocked(childProcess.execSync);

describe("postReviewReply", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exits 1 with no arguments", async () => {
    const { postReviewReply } =
      await import("../../.opencode/skills/_shared/scripts/post-review-reply");
    const result = postReviewReply(0, 0, "");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Usage:");
  });

  it("exits 2 when repo not determinable", async () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("gh failed");
    });

    const { postReviewReply } =
      await import("../../.opencode/skills/_shared/scripts/post-review-reply");
    const result = postReviewReply(42, 12345, "This is a reply");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("could not determine repository");
  });

  it("posts a reply successfully with explicit repo", async () => {
    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      // The actual gh api call — succeed
      return "";
    });

    const { postReviewReply } =
      await import("../../.opencode/skills/_shared/scripts/post-review-reply");
    const result = postReviewReply(
      42,
      12345,
      "This is a reply",
      "test-org/test-repo",
    );
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Reply posted");
  });

  it("posts a reply successfully with auto-detected repo", async () => {
    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      return "";
    });

    const { postReviewReply } =
      await import("../../.opencode/skills/_shared/scripts/post-review-reply");
    const result = postReviewReply(42, 12345, "This is a reply");
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Reply posted");
  });

  it("exits 3 when gh api fails", async () => {
    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      if (cmdStr.includes("api")) {
        throw new Error("API error");
      }
      return "";
    });

    const { postReviewReply } =
      await import("../../.opencode/skills/_shared/scripts/post-review-reply");
    const result = postReviewReply(
      42,
      12345,
      "This is a reply",
      "test-org/test-repo",
    );
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("failed to post reply");
  });
});
