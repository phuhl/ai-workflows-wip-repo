import type { Plugin } from "@opencode-ai/plugin";
import { execSync } from "node:child_process";

// ".opencode/skills/", ".opencode/plugins/" are not dangerous in this
// context. This plugin is for work within the ai-workflows repo, not
// for the consumer repository
const DANGEROUS_PREFIXES = [".ai-workflows/", ".env"];

export const GitGuard: Plugin = async ({ client }) => {
  return {
    "tool.execute.after": async (input, _output) => {
      if (input.tool !== "bash") return;

      const args = input.args as Record<string, unknown> | undefined;
      const cmd = (args?.command as string | undefined) || "";

      if (!/^git\s+(add|commit)\b/.test(cmd.trim())) return;

      try {
        const stdout = execSync(
          "git diff --cached --diff-filter=A --name-only",
          { encoding: "utf-8" },
        );
        const stagedFiles = stdout.trim().split("\n").filter(Boolean);
        const dangerous = stagedFiles.filter((f) =>
          DANGEROUS_PREFIXES.some((p) => f.startsWith(p)),
        );

        if (dangerous.length > 0) {
          execSync(`git reset -- ${dangerous.map((f) => `"${f}"`).join(" ")}`);

          await client.app.log({
            body: {
              service: "git-guard",
              level: "warn",
              message: `Unstaged ${dangerous.length} newly-added protected file(s)`,
              extra: { unstaged: dangerous },
            },
          });
        }
      } catch {
        // git unavailable — skip silently
      }
    },
  };
};
