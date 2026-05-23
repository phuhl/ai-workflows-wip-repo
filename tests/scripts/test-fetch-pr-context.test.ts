import { describe, it, expect, vi, beforeEach } from "vitest";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";

vi.mock("node:child_process", async () => {
  const actual =
    await vi.importActual<typeof childProcess>("node:child_process");
  return { ...actual, execSync: vi.fn() };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs");
  return {
    ...actual,
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

const execSyncMock = vi.mocked(childProcess.execSync);
const mkdirSyncMock = vi.mocked(fs.mkdirSync);
const existsSyncMock = vi.mocked(fs.existsSync);
const readFileSyncMock = vi.mocked(fs.readFileSync);
const writeFileSyncMock = vi.mocked(fs.writeFileSync);

describe("fetchPrContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exits 1 with no PR number", async () => {
    const { fetchPrContext } =
      await import("../../.opencode/skills/_shared/scripts/fetch-pr-context");
    const result = fetchPrContext("");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Usage:");
    expect(result.output).toContain("PR number is required");
  });

  it("exits 1 with empty PR number", async () => {
    const { fetchPrContext } =
      await import("../../.opencode/skills/_shared/scripts/fetch-pr-context");
    const result = fetchPrContext("", "42");
    expect(result.exitCode).toBe(1);
  });

  it("exits 2 when repo not determinable", async () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("gh failed");
    });

    const { fetchPrContext } =
      await import("../../.opencode/skills/_shared/scripts/fetch-pr-context");
    const result = fetchPrContext("123");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
  });

  it("exits 2 when PR not found", async () => {
    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      throw new Error("gh failed");
    });

    const { fetchPrContext } =
      await import("../../.opencode/skills/_shared/scripts/fetch-pr-context");
    const result = fetchPrContext("999");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
  });

  it("saves PR body and generates review-context", async () => {
    const prBody = "This PR removes backwards-compat code as agreed.";
    const prComments = JSON.stringify([
      { author: "dev1", body: "comment body", createdAt: "2024-01-01" },
    ]);
    const prReviewComments = JSON.stringify([
      {
        id: 1,
        path: "src/foo.ts",
        line: 42,
        body: "looks good",
        in_reply_to_id: null,
        user: "reviewer",
        author_association: "MEMBER",
        createdAt: "2024-01-02",
      },
    ]);

    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("title")) {
        return "My PR Title";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("body")) {
        return prBody;
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("headRefName")) {
        return "42-my-feature";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("baseRefName")) {
        return "master";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("comments")) {
        return prComments;
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("reviews")) {
        return JSON.stringify([
          { author: "reviewer", state: "APPROVED", body: "" },
        ]);
      }
      if (cmdStr.includes("pulls") && cmdStr.includes("comments")) {
        return prReviewComments;
      }
      if (cmdStr.includes("git diff")) {
        return "src/foo.ts\nsrc/bar.ts";
      }
      if (cmdStr.includes("git checkout")) {
        return "";
      }
      return "";
    });

    readFileSyncMock.mockImplementation((_p: unknown) => {
      return "// intentional removal of backwards compat\nconst x = 1;\n/* block comment */\nconst y = 2;";
    });
    existsSyncMock.mockImplementation((_p: unknown) => true);

    const { fetchPrContext } =
      await import("../../.opencode/skills/_shared/scripts/fetch-pr-context");
    const result = fetchPrContext("123");

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.files).toContain("pr-body.md");
    expect(result.files).toContain("pr-comments.json");
    expect(result.files).toContain("review-context.md");
    expect(result.output).toContain("[fetch-pr-context] Saved pr-body.md");
    expect(result.output).toContain(
      "[fetch-pr-context] Generated review-context.md",
    );
  });

  it("saves issue body when issue number provided", async () => {
    const prBody = "some pr body";
    const issueBody = "Remove all backwards-compat paths.";
    const issueTitle = "Remove backwards compat";
    const issueComments = JSON.stringify([
      {
        author: "dev1",
        body: "Agreed, no need for old API",
        createdAt: "2024-01-01",
      },
    ]);

    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("title")) {
        return "My PR Title";
      }
      if (
        cmdStr.includes("pr view") &&
        cmdStr.includes("body") &&
        !cmdStr.includes("--json comments")
      ) {
        return prBody;
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("headRefName")) {
        return "42-my-feature";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("baseRefName")) {
        return "master";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("reviews")) {
        return "[]";
      }
      if (cmdStr.includes("pulls") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("issue view") && cmdStr.includes("title")) {
        return issueTitle;
      }
      if (cmdStr.includes("issue view") && cmdStr.includes("body")) {
        return issueBody;
      }
      if (cmdStr.includes("issue view") && cmdStr.includes("comments")) {
        return issueComments;
      }
      if (cmdStr.includes("git diff")) {
        return "src/foo.ts";
      }
      if (cmdStr.includes("git checkout")) {
        return "";
      }
      return "";
    });

    existsSyncMock.mockImplementation((_p: unknown) => true);
    readFileSyncMock.mockImplementation(
      (_p: unknown) => "// some comment\nconst x = 1;",
    );

    const { fetchPrContext } =
      await import("../../.opencode/skills/_shared/scripts/fetch-pr-context");
    const result = fetchPrContext("123", "42");

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.files).toContain("issue-body.md");
    expect(result.files).toContain("issue-comments.json");
    expect(result.output).toContain("[fetch-pr-context] Saved issue-body.md");
  });

  it("extracts code comments from changed files", async () => {
    const prBody = "some pr body";

    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("title")) {
        return "PR Title";
      }
      if (
        cmdStr.includes("pr view") &&
        cmdStr.includes("body") &&
        !cmdStr.includes("--json comments")
      ) {
        return prBody;
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("headRefName")) {
        return "42-feat";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("baseRefName")) {
        return "master";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("reviews")) {
        return "[]";
      }
      if (cmdStr.includes("pulls") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("git diff")) {
        return "src/foo.ts\nsrc/bar.py";
      }
      if (cmdStr.includes("git checkout")) {
        return "";
      }
      return "";
    });

    existsSyncMock.mockImplementation((_p: unknown) => true);

    let callCount = 0;
    readFileSyncMock.mockImplementation((_p: unknown) => {
      callCount++;
      if (callCount === 1) {
        return "// this removes backwards compat\n/* block of reasoning */\nconst x = 1;";
      }
      return "# no backwards compat needed\nprint('hello')";
    });

    const { fetchPrContext } =
      await import("../../.opencode/skills/_shared/scripts/fetch-pr-context");
    const result = fetchPrContext("123");

    expect(result.ok).toBe(true);
    expect(result.files).toContain("code-comments.md");
    expect(result.output).toContain(
      "[fetch-pr-context] Saved code-comments.md",
    );
  });

  it("handles no changed files gracefully", async () => {
    const prBody = "minimal pr";

    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("title")) {
        return "PR Title";
      }
      if (
        cmdStr.includes("pr view") &&
        cmdStr.includes("body") &&
        !cmdStr.includes("--json comments")
      ) {
        return prBody;
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("headRefName")) {
        return "42-feat";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("baseRefName")) {
        return "master";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("reviews")) {
        return "[]";
      }
      if (cmdStr.includes("pulls") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("git diff")) {
        throw new Error("no diff");
      }
      return "";
    });

    existsSyncMock.mockImplementation((_p: unknown) => false);

    const { fetchPrContext } =
      await import("../../.opencode/skills/_shared/scripts/fetch-pr-context");
    const result = fetchPrContext("123");

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.files).not.toContain("changed-files.txt");
    expect(result.files).not.toContain("code-comments.md");
  });

  it("auto-detects linked issue via GraphQL", async () => {
    const prBody = "some pr body";
    const issueBody = "Remove all backwards-compat paths.";
    const issueTitle = "Remove backwards compat";
    const graphqlOutput = "42";

    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      if (cmdStr.includes("api graphql")) {
        return graphqlOutput;
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("title")) {
        return "PR Title";
      }
      if (
        cmdStr.includes("pr view") &&
        cmdStr.includes("body") &&
        !cmdStr.includes("--json comments")
      ) {
        return prBody;
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("headRefName")) {
        return "my-feature";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("baseRefName")) {
        return "master";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("reviews")) {
        return "[]";
      }
      if (cmdStr.includes("pulls") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("issue view") && cmdStr.includes("title")) {
        return issueTitle;
      }
      if (cmdStr.includes("issue view") && cmdStr.includes("body")) {
        return issueBody;
      }
      if (cmdStr.includes("issue view") && cmdStr.includes("comments")) {
        return JSON.stringify([
          {
            author: "dev1",
            body: "Agreed, we can drop old API",
            createdAt: "2024-01-01",
          },
        ]);
      }
      if (cmdStr.includes("git diff")) {
        return "src/foo.ts";
      }
      if (cmdStr.includes("git checkout")) {
        return "";
      }
      return "";
    });

    existsSyncMock.mockImplementation((_p: unknown) => true);
    readFileSyncMock.mockImplementation(
      (_p: unknown) => "// intentional: no backwards compat\nconst x = 1;",
    );

    const { fetchPrContext } =
      await import("../../.opencode/skills/_shared/scripts/fetch-pr-context");
    const result = fetchPrContext("123");

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.files).toContain("issue-body.md");
    expect(result.files).toContain("issue-comments.json");
  });

  it("falls back to branch name when GraphQL returns no linked issues", async () => {
    const prBody = "fix the thing";
    const issueBody = "Please fix the thing.";

    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      if (cmdStr.includes("api graphql")) {
        return "";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("title")) {
        return "PR Title";
      }
      if (
        cmdStr.includes("pr view") &&
        cmdStr.includes("body") &&
        !cmdStr.includes("--json comments")
      ) {
        return prBody;
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("headRefName")) {
        return "99-fix-thing";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("baseRefName")) {
        return "master";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("reviews")) {
        return "[]";
      }
      if (cmdStr.includes("pulls") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("issue view") && cmdStr.includes("title")) {
        return "Fix the thing";
      }
      if (cmdStr.includes("issue view") && cmdStr.includes("body")) {
        return issueBody;
      }
      if (cmdStr.includes("issue view") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("git diff")) {
        return "src/foo.ts";
      }
      if (cmdStr.includes("git checkout")) {
        return "";
      }
      return "";
    });

    existsSyncMock.mockImplementation((_p: unknown) => true);
    readFileSyncMock.mockImplementation((_p: unknown) => "const x = 1;");

    const { fetchPrContext } =
      await import("../../.opencode/skills/_shared/scripts/fetch-pr-context");
    const result = fetchPrContext("123");

    expect(result.ok).toBe(true);
    expect(result.files).toContain("issue-body.md");
  });

  it("falls back to PR body closes syntax when branch name has no issue prefix", async () => {
    const prBody = "Closes #77 — this removes legacy stuff";
    const issueBody = "Get rid of legacy module.";

    execSyncMock.mockImplementation((cmd: unknown) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("repo view")) {
        return "test-org/test-repo";
      }
      if (cmdStr.includes("api graphql")) {
        return "";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("title")) {
        return "PR Title";
      }
      if (
        cmdStr.includes("pr view") &&
        cmdStr.includes("body") &&
        !cmdStr.includes("--json comments")
      ) {
        return prBody;
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("headRefName")) {
        return "fix-legacy-stuff";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("baseRefName")) {
        return "master";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("pr view") && cmdStr.includes("reviews")) {
        return "[]";
      }
      if (cmdStr.includes("pulls") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("issue view") && cmdStr.includes("title")) {
        return "Remove legacy";
      }
      if (cmdStr.includes("issue view") && cmdStr.includes("body")) {
        return issueBody;
      }
      if (cmdStr.includes("issue view") && cmdStr.includes("comments")) {
        return "[]";
      }
      if (cmdStr.includes("git diff")) {
        return "src/foo.ts";
      }
      if (cmdStr.includes("git checkout")) {
        return "";
      }
      return "";
    });

    existsSyncMock.mockImplementation((_p: unknown) => true);
    readFileSyncMock.mockImplementation((_p: unknown) => "const x = 1;");

    const { fetchPrContext } =
      await import("../../.opencode/skills/_shared/scripts/fetch-pr-context");
    const result = fetchPrContext("123");

    expect(result.ok).toBe(true);
    expect(result.files).toContain("issue-body.md");
  });
});
