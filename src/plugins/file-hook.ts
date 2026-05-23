import type { Plugin } from "@opencode-ai/plugin";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const FileHook: Plugin = async ({ $, client, directory }) => {
  return {
    "tool.execute.after": async (input, output) => {
      if (input.tool !== "write" && input.tool !== "edit") return;

      const args = input.args as Record<string, unknown> | undefined;
      const filePath = args?.filePath as string | undefined;
      if (!filePath) return;

      if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(filePath)) return;

      // Skip bootstrapped infrastructure directories.
      // Target repos have eslint configs that ignore these, so running tooling
      // on them produces spurious "file ignored" warnings without benefit.
      // In this repo, run eslint/prettier directly when working on these files.
      if (/\.(?:opencode|ai-workflows)\//.test(filePath)) return;

      const localBin = join(directory, "node_modules", ".bin");
      const localPrettier = join(localBin, "prettier");
      const localEslint = join(localBin, "eslint");
      const localTsc = join(localBin, "tsc");

      const issues: string[] = [];

      // 1. Prettier — format the file (use local binary if installed)
      try {
        const pretty = existsSync(localPrettier)
          ? await $`${localPrettier} --write ${filePath} 2>&1`.quiet().nothrow()
          : await $`npx -p prettier prettier --write ${filePath} 2>&1`
              .quiet()
              .nothrow();
        if (pretty.exitCode !== 0) {
          issues.push(
            `[prettier] ${(pretty.stderr || pretty.stdout)
              .toString()
              .split("\n")
              .filter(Boolean)
              .slice(0, 5)
              .join("\n")
              .trim()}`,
          );
        }
      } catch {
        // prettier unavailable — skip
      }

      // 2. ESLint — lint the file (use local binary if installed)
      try {
        const lint = existsSync(localEslint)
          ? await $`${localEslint} ${filePath} 2>&1`.quiet().nothrow()
          : await $`npx -p eslint eslint ${filePath} 2>&1`.quiet().nothrow();
        if (lint.exitCode !== 0) {
          issues.push(
            `[eslint] ${(lint.stderr || lint.stdout)
              .toString()
              .split("\n")
              .filter(Boolean)
              .slice(0, 10)
              .join("\n")
              .trim()}`,
          );
        }
      } catch {
        // eslint unavailable — skip
      }

      // 3. tsc — type-check the whole project (use local binary if installed)
      try {
        const tsc = existsSync(localTsc)
          ? await $`${localTsc} --noEmit 2>&1`.quiet().nothrow()
          : await $`npx -p typescript tsc --noEmit 2>&1`.quiet().nothrow();
        if (tsc.exitCode !== 0) {
          const lines = (tsc.stderr || tsc.stdout).toString().split("\n");
          const errors = lines
            .filter((l) => l.includes("error TS"))
            .slice(0, 5);
          if (errors.length > 0) {
            issues.push(`[tsc] ${errors.join("\n")}`.trim());
          }
        }
      } catch {
        // tsc unavailable — skip
      }

      if (issues.length > 0) {
        const header = "\n\n--- Issues from lint/type check ---\n";
        const body = issues.join("\n");
        output.output += header + body;

        try {
          await client.app.log({
            body: {
              service: "file-hook",
              level: "warn",
              message: `Issues after editing ${filePath}`,
              extra: { file: filePath, issues },
            },
          });
        } catch {
          console.warn("[file-hook]", filePath, issues);
        }
      }
    },
  };
};
