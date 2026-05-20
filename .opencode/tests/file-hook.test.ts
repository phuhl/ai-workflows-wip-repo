import { describe, it, expect, vi, type Mock } from "vitest";
import { FileHook } from "../plugins/file-hook";

function mockShell(exitCode: number, stdout = "", stderr = "") {
  const proc: any = Promise.resolve({ exitCode, stdout, stderr });
  proc.exitCode = exitCode;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.nothrow = vi.fn().mockReturnValue(proc);
  proc.quiet = vi.fn().mockReturnValue(proc);
  const fn = vi.fn().mockReturnValue(proc) as Mock & { nothrow?: Mock };
  fn.nothrow = proc.nothrow;
  fn.quiet = proc.quiet;
  return fn;
}

function setupHook(logs: any[] = []) {
  const $ = mockShell(0);
  const client = {
    app: {
      log: vi.fn(async (entry: any) => {
        logs.push(entry);
      }),
    },
  };
  return { $, client, logs };
}

function makeInput(tool: string, args?: Record<string, unknown>) {
  return { tool, input: { tool, args }, args };
}

function makeOutput(
  title = "Edited file",
  output = "File written.",
  metadata: any = {},
) {
  return { title, output, metadata };
}

describe("file-hook", () => {
  it("does nothing for non-write/edit tools", async () => {
    const { $, client, logs } = setupHook();
    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });
    const output = makeOutput();

    await hooks["tool.execute.after"]?.(makeInput("read"), output as any);
    await hooks["tool.execute.after"]?.(makeInput("glob"), output as any);
    await hooks["tool.execute.after"]?.(makeInput("bash"), output as any);

    expect(logs).toHaveLength(0);
    expect(output.output).toBe("File written.");
  });

  it("does nothing when filePath is missing", async () => {
    const { $, client, logs } = setupHook();
    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });
    const output = makeOutput();

    await hooks["tool.execute.after"]?.(makeInput("write", {}), output as any);

    expect(logs).toHaveLength(0);
    expect(output.output).toBe("File written.");
  });

  it("does nothing for non-JS/TS file extensions", async () => {
    const { $, client, logs } = setupHook();
    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });
    const out1 = makeOutput();
    const out2 = makeOutput();
    const out3 = makeOutput();

    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/readme.md" }),
      out1 as any,
    );
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/config.json" }),
      out2 as any,
    );
    await hooks["tool.execute.after"]?.(
      makeInput("edit", { filePath: "/src/styles.css" }),
      out3 as any,
    );

    expect(logs).toHaveLength(0);
  });

  it("triggers for .ts files on write", async () => {
    const { $, client, logs } = setupHook();
    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });
    const output = makeOutput();

    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/index.ts" }),
      output as any,
    );

    expect(logs).toHaveLength(0);
    expect(output.output).toBe("File written.");
  });

  it("triggers for .tsx files on edit", async () => {
    const { $, client, logs } = setupHook();
    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });
    const output = makeOutput();

    await hooks["tool.execute.after"]?.(
      makeInput("edit", { filePath: "/src/Component.tsx" }),
      output as any,
    );

    expect(logs).toHaveLength(0);
    expect(output.output).toBe("File written.");
  });

  it("skips files in .opencode/ and .ai-workflows/ directories", async () => {
    const { $, client, logs } = setupHook();
    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });

    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/home/user/.opencode/plugins/file-hook.ts" }),
      makeOutput() as any,
    );
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/home/user/.opencode/skills/_shared/scripts/post-review-reply.ts" }),
      makeOutput() as any,
    );
    await hooks["tool.execute.after"]?.(
      makeInput("edit", { filePath: "/tmp/.opencode/foo.ts" }),
      makeOutput() as any,
    );
    await hooks["tool.execute.after"]?.(
      makeInput("edit", { filePath: "/tmp/.ai-workflows/bar.ts" }),
      makeOutput() as any,
    );

    expect(logs).toHaveLength(0);
  });

  it("triggers for .js, .jsx, .mjs, .cjs", async () => {
    const { $, client, logs } = setupHook();
    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });

    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/util.js" }),
      makeOutput() as any,
    );
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/comp.jsx" }),
      makeOutput() as any,
    );
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/run.mjs" }),
      makeOutput() as any,
    );
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/legacy.cjs" }),
      makeOutput() as any,
    );

    expect(logs).toHaveLength(0);
  });

  it("logs issues when prettier fails", async () => {
    const logs: any[] = [];
    const $ = mockShell(1, "", "prettier error: syntax issue");
    const client = {
      app: { log: vi.fn(async (entry: any) => logs.push(entry)) },
    };

    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });
    const output = makeOutput();
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/broken.ts" }),
      output as any,
    );

    expect(logs).toHaveLength(1);
    expect(logs[0].body.extra.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("[prettier]")]),
    );
    expect(output.output).toContain("--- Issues from lint/type check ---");
    expect(output.output).toContain("[prettier]");
  });

  it("logs issues when eslint fails", async () => {
    const logs: any[] = [];
    const $ = mockShell(1, "", "error: no-unused-vars");
    const client = {
      app: { log: vi.fn(async (entry: any) => logs.push(entry)) },
    };

    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });
    const output = makeOutput();
    await hooks["tool.execute.after"]?.(
      makeInput("edit", { filePath: "/src/lint-error.ts" }),
      output as any,
    );

    expect(logs).toHaveLength(1);
    expect(logs[0].body.extra.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("[eslint]")]),
    );
    expect(output.output).toContain("[eslint]");
  });

  it("logs issues when tsc fails", async () => {
    const logs: any[] = [];
    const tscOutput =
      "src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.\n" +
      "src/index.ts(20,3): error TS2345: Argument of type 'string' is not assignable.\n";
    const $ = mockShell(1, "", tscOutput);
    const client = {
      app: { log: vi.fn(async (entry: any) => logs.push(entry)) },
    };

    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });
    const output = makeOutput();
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/type-error.ts" }),
      output as any,
    );

    expect(logs).toHaveLength(1);
    expect(logs[0].body.extra.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("[tsc]")]),
    );
    expect(output.output).toContain("[tsc]");
  });

  it("collects issues from multiple failing tools", async () => {
    const logs: any[] = [];
    const $ = mockShell(
      1,
      "",
      "prettier: syntax error\nerror TS1234: type error\n",
    );
    const client = {
      app: { log: vi.fn(async (entry: any) => logs.push(entry)) },
    };

    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });
    const output = makeOutput();
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/all-broken.ts" }),
      output as any,
    );

    expect(logs).toHaveLength(1);
    const issues = logs[0].body.extra.issues as string[];
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("[prettier]"),
        expect.stringContaining("[eslint]"),
        expect.stringContaining("[tsc]"),
      ]),
    );
    expect(output.output).toContain("[prettier]");
    expect(output.output).toContain("[eslint]");
    expect(output.output).toContain("[tsc]");
  });

  it("does not log when all tools pass", async () => {
    const logs: any[] = [];
    const $ = mockShell(0);
    const client = {
      app: { log: vi.fn(async (entry: any) => logs.push(entry)) },
    };

    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });
    const output = makeOutput();
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/clean.ts" }),
      output as any,
    );

    expect(logs).toHaveLength(0);
    expect(output.output).not.toContain("--- Issues from lint/type check ---");
  });

  it("survives unavailable tools (catch block)", async () => {
    const logs: any[] = [];
    const $ = vi.fn().mockImplementation(() => {
      throw new Error("prettier not found");
    }) as any;
    const client = {
      app: { log: vi.fn(async (entry: any) => logs.push(entry)) },
    };

    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });
    const output = makeOutput();
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/safe.ts" }),
      output as any,
    );

    expect(logs).toHaveLength(0);
    expect(output.output).not.toContain("--- Issues from lint/type check ---");
  });

  it("suppresses terminal output via quiet()", async () => {
    const logs: any[] = [];
    const $ = mockShell(0);
    const client = {
      app: { log: vi.fn(async (entry: any) => logs.push(entry)) },
    };

    const hooks = await FileHook({
      $: $ as any,
      client: client as any,
      directory: "/tmp",
    });
    const output = makeOutput();
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/quiet.ts" }),
      output as any,
    );

    // Verify .quiet() was called on each shell invocation
    expect($.mock.results[0]?.value.quiet).toHaveBeenCalled();
  });
});
