import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SKILLS_DIR = ".opencode/skills";

interface Rule {
  pattern: RegExp;
  tool: string;
  severity: "error" | "warn";
  label: string;
}

const RULES: Rule[] = [
  {
    pattern: /Skill\(/,
    tool: "Skill",
    severity: "error",
    label: "uses Skill() cross-skill invocation",
  },
  {
    pattern: /Task\(/,
    tool: "Task",
    severity: "error",
    label: "uses Task() subagent invocation",
  },
  {
    pattern: /context-summary\.md/,
    tool: "Task",
    severity: "error",
    label: "references context-summary.md (requires Task subagent)",
  },
  {
    pattern: /_shared\/scripts\//,
    tool: "Bash",
    severity: "error",
    label: "references shared scripts under _shared/scripts/",
  },
  {
    pattern: /npx tsx/,
    tool: "Bash",
    severity: "error",
    label: "runs npx tsx (requires Bash)",
  },
  {
    pattern: /\bgh\s+(pr|issue|api|run|repo|auth)\b/,
    tool: "Bash",
    severity: "warn",
    label: "invokes gh CLI (likely requires Bash)",
  },
  {
    pattern: /subagent/,
    tool: "Task",
    severity: "warn",
    label: "mentions subagents (likely requires Task)",
  },
  {
    pattern: /\bWebFetch\b/,
    tool: "WebFetch",
    severity: "warn",
    label: "mentions WebFetch tool",
  },
  {
    pattern: /\bTodowrite\b/,
    tool: "Todowrite",
    severity: "warn",
    label: "mentions Todowrite tool",
  },
];

function parseAllowedTools(content: string): string[] {
  const lines = content.split("\n");
  if (lines[0].trim() !== "---") return [];

  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (endIdx === -1) return [];

  for (let i = 1; i < endIdx; i++) {
    const line = lines[i];
    const match = line.match(/^allowed-tools:\s*(.+)/);
    if (match) {
      return match[1]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function bodyWithoutFrontmatter(content: string): string {
  const lines = content.split("\n");
  if (lines[0].trim() !== "---") return content;

  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (endIdx === -1) return content;

  return lines.slice(endIdx + 1).join("\n");
}

function hasTool(allowedTools: string[], tool: string): boolean {
  return allowedTools.includes(tool);
}

function checkSkill(skillDir: string): {
  dir: string;
  errors: string[];
  warnings: string[];
} {
  const dirName = path.basename(skillDir);
  const result = {
    dir: dirName,
    errors: [] as string[],
    warnings: [] as string[],
  };

  const skillFile = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillFile)) return result;

  const skillContent = fs.readFileSync(skillFile, "utf-8");
  const allowedTools = parseAllowedTools(skillContent);

  // Collect all .md files in the skill directory (SKILL.md + references/*.md)
  let combinedBody = bodyWithoutFrontmatter(skillContent);

  const referencesDir = path.join(skillDir, "references");
  if (fs.existsSync(referencesDir)) {
    const refFiles = fs
      .readdirSync(referencesDir)
      .filter((f) => f.endsWith(".md"));
    for (const refFile of refFiles) {
      combinedBody +=
        "\n" + fs.readFileSync(path.join(referencesDir, refFile), "utf-8");
    }
  }

  // Also check scripts/ subdirectory if it exists
  const scriptsDir = path.join(skillDir, "scripts");
  if (fs.existsSync(scriptsDir)) {
    const scriptFiles = fs
      .readdirSync(scriptsDir)
      .filter((f) => f.endsWith(".md"));
    for (const sf of scriptFiles) {
      combinedBody +=
        "\n" + fs.readFileSync(path.join(scriptsDir, sf), "utf-8");
    }
  }

  for (const rule of RULES) {
    if (rule.pattern.test(combinedBody)) {
      if (!hasTool(allowedTools, rule.tool)) {
        const msg = `${rule.label} but '${rule.tool}' not in allowed-tools`;
        if (rule.severity === "error") {
          result.errors.push(msg);
        } else {
          result.warnings.push(msg);
        }
      }
    }
  }

  return result;
}

describe("Skill tool requirement validation", () => {
  it("skills declare all tools required by their instructions", () => {
    if (!fs.existsSync(SKILLS_DIR)) {
      return;
    }

    const entries = fs.readdirSync(SKILLS_DIR);
    const skillDirs = entries.filter((e) => {
      const fullPath = path.join(SKILLS_DIR, e);
      return !e.startsWith("_") && fs.statSync(fullPath).isDirectory();
    });

    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (const dir of skillDirs) {
      const fullPath = path.join(SKILLS_DIR, dir);
      const result = checkSkill(fullPath);

      for (const e of result.errors) {
        allErrors.push(`${result.dir}: ${e}`);
      }
      for (const w of result.warnings) {
        allWarnings.push(`${result.dir}: ${w}`);
      }
    }

    if (allWarnings.length > 0) {
      console.log("Warnings:", allWarnings);
    }

    if (allErrors.length > 0) {
      expect(allErrors).toEqual([]);
    }
  });
});
