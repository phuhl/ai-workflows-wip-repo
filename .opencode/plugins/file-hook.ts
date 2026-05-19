import type { Plugin } from "@opencode-ai/plugin"

export const FileHook: Plugin = async ({ $, client, directory }) => {
  return {
    "tool.execute.after": async (input, _output) => {
      if (input.tool !== "write" && input.tool !== "edit") return

      const args = input.args as Record<string, unknown> | undefined
      const filePath = args?.filePath as string | undefined
      if (!filePath) return

      if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(filePath)) return

      const issues: string[] = []

      // 1. Prettier — format the file
      try {
        const pretty = await $`npx prettier --write ${filePath} 2>&1`.nothrow()
        if (pretty.exitCode !== 0) {
          issues.push(
            `[prettier] ${(pretty.stderr || pretty.stdout)
              .toString()
              .trim()}`
          )
        }
      } catch {
        // prettier unavailable — skip
      }

      // 2. ESLint — lint the file
      try {
        const lint = await $`npx eslint ${filePath} 2>&1`.nothrow()
        if (lint.exitCode !== 0) {
          issues.push(
            `[eslint] ${(lint.stderr || lint.stdout)
              .toString()
              .trim()}`
          )
        }
      } catch {
        // eslint unavailable — skip
      }

      // 3. tsc — type-check the whole project
      try {
        const tsc = await $`npx tsc --noEmit 2>&1`.nothrow()
        if (tsc.exitCode !== 0) {
          const lines = (tsc.stderr || tsc.stdout).toString().split("\n")
          const errors = lines
            .filter((l) => l.includes("error TS"))
            .slice(0, 5)
          issues.push(`[tsc] ${errors.join("\n")}`.trim())
        }
      } catch {
        // tsc unavailable — skip
      }

      if (issues.length > 0) {
        try {
          await client.app.log({
            body: {
              service: "file-hook",
              level: "warn",
              message: `Issues after editing ${filePath}`,
              extra: { file: filePath, issues },
            },
          })
        } catch {
          console.warn("[file-hook]", filePath, issues)
        }
      }
    },
  }
}
