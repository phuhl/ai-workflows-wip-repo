import { describe, it, expect, vi, type Mock } from "vitest"
import { FileHook } from "../plugins/file-hook"

function mockShell(exitCode: number, stdout = "", stderr = "") {
  const proc: any = Promise.resolve({ exitCode, stdout, stderr })
  proc.exitCode = exitCode
  proc.stdout = stdout
  proc.stderr = stderr
  proc.nothrow = vi.fn().mockReturnValue(proc)
  const fn = vi.fn().mockReturnValue(proc) as Mock & { nothrow?: Mock }
  fn.nothrow = proc.nothrow
  return fn
}

function setupHook(logs: any[] = []) {
  const $ = mockShell(0)
  const client = {
    app: {
      log: vi.fn(async (entry: any) => {
        logs.push(entry)
      }),
    },
  }
  return { $, client, logs }
}

function makeInput(tool: string, args?: Record<string, unknown>) {
  return { tool, input: { tool, args }, args }
}

describe("file-hook", () => {
  it("does nothing for non-write/edit tools", async () => {
    const { $, client, logs } = setupHook()
    const hooks = await FileHook({ $: $ as any, client: client as any, directory: "/tmp" })

    await hooks["tool.execute.after"]?.(makeInput("read"), undefined as any)
    await hooks["tool.execute.after"]?.(makeInput("glob"), undefined as any)
    await hooks["tool.execute.after"]?.(makeInput("bash"), undefined as any)

    expect(logs).toHaveLength(0)
  })

  it("does nothing when filePath is missing", async () => {
    const { $, client, logs } = setupHook()
    const hooks = await FileHook({ $: $ as any, client: client as any, directory: "/tmp" })

    await hooks["tool.execute.after"]?.(makeInput("write", {}), undefined as any)

    expect(logs).toHaveLength(0)
  })

  it("does nothing for non-JS/TS file extensions", async () => {
    const { $, client, logs } = setupHook()
    const hooks = await FileHook({ $: $ as any, client: client as any, directory: "/tmp" })

    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/readme.md" }),
      undefined as any,
    )
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/config.json" }),
      undefined as any,
    )
    await hooks["tool.execute.after"]?.(
      makeInput("edit", { filePath: "/src/styles.css" }),
      undefined as any,
    )

    expect(logs).toHaveLength(0)
  })

  it("triggers for .ts files on write", async () => {
    const { $, client, logs } = setupHook()
    const hooks = await FileHook({ $: $ as any, client: client as any, directory: "/tmp" })

    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/index.ts" }),
      undefined as any,
    )

    expect(logs).toHaveLength(0) // all tools succeed (exit 0)
  })

  it("triggers for .tsx files on edit", async () => {
    const { $, client, logs } = setupHook()
    const hooks = await FileHook({ $: $ as any, client: client as any, directory: "/tmp" })

    await hooks["tool.execute.after"]?.(
      makeInput("edit", { filePath: "/src/Component.tsx" }),
      undefined as any,
    )

    expect(logs).toHaveLength(0)
  })

  it("triggers for .js, .jsx, .mjs, .cjs", async () => {
    const { $, client, logs } = setupHook()
    const hooks = await FileHook({ $: $ as any, client: client as any, directory: "/tmp" })

    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/util.js" }),
      undefined as any,
    )
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/comp.jsx" }),
      undefined as any,
    )
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/run.mjs" }),
      undefined as any,
    )
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/legacy.cjs" }),
      undefined as any,
    )

    expect(logs).toHaveLength(0)
  })

  it("logs issues when prettier fails", async () => {
    const logs: any[] = []
    const $ = mockShell(1, "", "prettier error: syntax issue")
    const client = {
      app: { log: vi.fn(async (entry: any) => logs.push(entry)) },
    }

    const hooks = await FileHook({ $: $ as any, client: client as any, directory: "/tmp" })
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/broken.ts" }),
      undefined as any,
    )

    expect(logs).toHaveLength(1)
    expect(logs[0].body.extra.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("[prettier]")]),
    )
  })

  it("logs issues when eslint fails", async () => {
    const logs: any[] = []
    const $ = mockShell(1, "", "error: no-unused-vars")
    const client = {
      app: { log: vi.fn(async (entry: any) => logs.push(entry)) },
    }

    const hooks = await FileHook({ $: $ as any, client: client as any, directory: "/tmp" })
    await hooks["tool.execute.after"]?.(
      makeInput("edit", { filePath: "/src/lint-error.ts" }),
      undefined as any,
    )

    expect(logs).toHaveLength(1)
    expect(logs[0].body.extra.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("[eslint]")]),
    )
  })

  it("logs issues when tsc fails", async () => {
    const logs: any[] = []
    const tscOutput =
      "src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.\n" +
      "src/index.ts(20,3): error TS2345: Argument of type 'string' is not assignable.\n"
    const $ = mockShell(1, "", tscOutput)
    const client = {
      app: { log: vi.fn(async (entry: any) => logs.push(entry)) },
    }

    const hooks = await FileHook({ $: $ as any, client: client as any, directory: "/tmp" })
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/type-error.ts" }),
      undefined as any,
    )

    expect(logs).toHaveLength(1)
    expect(logs[0].body.extra.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("[tsc]")]),
    )
  })

  it("collects issues from multiple failing tools", async () => {
    const logs: any[] = []
    const $ = mockShell(1, "", "prettier can't parse\nTS1234: type error\n")
    const client = {
      app: { log: vi.fn(async (entry: any) => logs.push(entry)) },
    }

    const hooks = await FileHook({ $: $ as any, client: client as any, directory: "/tmp" })
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/all-broken.ts" }),
      undefined as any,
    )

    expect(logs).toHaveLength(1)
    const issues = logs[0].body.extra.issues as string[]
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("[prettier]"),
        expect.stringContaining("[eslint]"),
        expect.stringContaining("[tsc]"),
      ]),
    )
  })

  it("does not log when all tools pass", async () => {
    const logs: any[] = []
    const $ = mockShell(0)
    const client = {
      app: { log: vi.fn(async (entry: any) => logs.push(entry)) },
    }

    const hooks = await FileHook({ $: $ as any, client: client as any, directory: "/tmp" })
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/clean.ts" }),
      undefined as any,
    )

    expect(logs).toHaveLength(0)
  })

  it("survives unavailable tools (catch block)", async () => {
    const logs: any[] = []
    const $ = vi.fn().mockImplementation(() => {
      throw new Error("prettier not found")
    }) as any
    const client = {
      app: { log: vi.fn(async (entry: any) => logs.push(entry)) },
    }

    const hooks = await FileHook({ $: $ as any, client: client as any, directory: "/tmp" })
    await hooks["tool.execute.after"]?.(
      makeInput("write", { filePath: "/src/safe.ts" }),
      undefined as any,
    )

    expect(logs).toHaveLength(0)
  })
})
