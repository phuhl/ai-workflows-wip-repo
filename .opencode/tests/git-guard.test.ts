import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: mockExecSync,
}));

import { GitGuard } from "../plugins/git-guard";

function setupHook(logs: any[] = []) {
  const client = {
    app: {
      log: vi.fn(async (entry: any) => {
        logs.push(entry);
      }),
    },
  };
  return { client, logs };
}

function makeInput(command: string) {
  return {
    tool: "bash",
    args: { command },
    input: { tool: "bash", args: { command } },
  };
}

describe("git-guard", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it("does nothing for non-bash tools", async () => {
    const { client, logs } = setupHook();
    const hooks = await GitGuard({ client: client as any });

    await hooks["tool.execute.after"]?.(
      { tool: "read", input: { tool: "read" }, args: {} },
      undefined as any,
    );
    await hooks["tool.execute.after"]?.(
      { tool: "write", input: { tool: "write" }, args: {} },
      undefined as any,
    );

    expect(mockExecSync).not.toHaveBeenCalled();
    expect(logs).toHaveLength(0);
  });

  it("does nothing for non-git bash commands", async () => {
    const { client, logs } = setupHook();
    const hooks = await GitGuard({ client: client as any });

    await hooks["tool.execute.after"]?.(
      makeInput("npm install"),
      undefined as any,
    );
    await hooks["tool.execute.after"]?.(
      makeInput("git status"),
      undefined as any,
    );
    await hooks["tool.execute.after"]?.(
      makeInput("git push origin main"),
      undefined as any,
    );

    expect(mockExecSync).not.toHaveBeenCalled();
    expect(logs).toHaveLength(0);
  });

  it("triggers on git add", async () => {
    const { client, logs } = setupHook();
    mockExecSync.mockReturnValue("");

    const hooks = await GitGuard({ client: client as any });
    await hooks["tool.execute.after"]?.(
      makeInput("git add src/file.ts"),
      undefined as any,
    );

    expect(mockExecSync).toHaveBeenCalledWith(
      "git diff --cached --diff-filter=A --name-only",
      { encoding: "utf-8" },
    );
    expect(logs).toHaveLength(0);
  });

  it("triggers on git commit", async () => {
    const { client, logs } = setupHook();
    mockExecSync.mockReturnValue("");

    const hooks = await GitGuard({ client: client as any });
    await hooks["tool.execute.after"]?.(
      makeInput('git commit -m "feat: add feature"'),
      undefined as any,
    );

    expect(mockExecSync).toHaveBeenCalled();
    expect(logs).toHaveLength(0);
  });

  it("triggers on git add with flags", async () => {
    const { client, logs } = setupHook();
    mockExecSync.mockReturnValue("");

    const hooks = await GitGuard({ client: client as any });
    await hooks["tool.execute.after"]?.(
      makeInput("git add -p"),
      undefined as any,
    );

    expect(mockExecSync).toHaveBeenCalled();
  });

  it("triggers on git add even with leading spaces (trim handles it)", async () => {
    const { client, logs } = setupHook();
    mockExecSync.mockReturnValue("");

    const hooks = await GitGuard({ client: client as any });
    await hooks["tool.execute.after"]?.(
      makeInput("  git add file.ts"),
      undefined as any,
    );

    expect(mockExecSync).toHaveBeenCalled();
  });

  it("unstages files in protected directories", async () => {
    const { client, logs } = setupHook();
    mockExecSync.mockReturnValueOnce(
      ".ai-workflows/skills/foo/SKILL.md\n.opencode/skills/bar/SKILL.md\nsrc/app.ts\n",
    );

    const hooks = await GitGuard({ client: client as any });
    await hooks["tool.execute.after"]?.(
      makeInput("git add ."),
      undefined as any,
    );

    expect(logs).toHaveLength(1);
    expect(logs[0].body.message).toContain("Unstaged");
    expect(logs[0].body.extra.unstaged).toEqual([
      ".ai-workflows/skills/foo/SKILL.md",
      ".opencode/skills/bar/SKILL.md",
    ]);

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("git reset --"),
    );
    const resetCall = mockExecSync.mock.calls.find((call: any[]) =>
      call[0].includes("git reset"),
    );
    expect(resetCall).toBeDefined();
  });

  it("unstages files in .opencode/plugins/", async () => {
    const { client, logs } = setupHook();
    mockExecSync.mockReturnValueOnce(
      ".opencode/plugins/custom.ts\nsrc/ok.ts\n",
    );

    const hooks = await GitGuard({ client: client as any });
    await hooks["tool.execute.after"]?.(
      makeInput("git add .opencode/plugins/custom.ts src/ok.ts"),
      undefined as any,
    );

    expect(logs).toHaveLength(1);
    expect(logs[0].body.extra.unstaged).toEqual([
      ".opencode/plugins/custom.ts",
    ]);
  });

  it("leaves non-protected files alone", async () => {
    const { client, logs } = setupHook();
    mockExecSync.mockReturnValueOnce(
      "src/app.ts\nsrc/lib.ts\ndocs/readme.md\n",
    );

    const hooks = await GitGuard({ client: client as any });
    await hooks["tool.execute.after"]?.(
      makeInput("git add src/"),
      undefined as any,
    );

    expect(logs).toHaveLength(0);
  });

  it("survives git error gracefully", async () => {
    const { client, logs } = setupHook();
    mockExecSync.mockImplementation(() => {
      throw new Error("not a git repository");
    });

    const hooks = await GitGuard({ client: client as any });
    await hooks["tool.execute.after"]?.(
      makeInput("git add file.ts"),
      undefined as any,
    );

    expect(logs).toHaveLength(0);
  });

  it("handles empty command string", async () => {
    const { client, logs } = setupHook();

    const hooks = await GitGuard({ client: client as any });
    await hooks["tool.execute.after"]?.(makeInput(""), undefined as any);

    expect(mockExecSync).not.toHaveBeenCalled();
    expect(logs).toHaveLength(0);
  });
});
