import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SKILLS_DIR = ".opencode/skills";

interface FrontmatterResult {
  dir: string;
  ok: boolean;
  warnings: string[];
  errors: string[];
}

interface YamlFrontmatter {
  name?: string;
  description?: string;
  "allowed-tools"?: string;
  context?: string;
  agent?: string;
}

function parseFrontmatter(content: string): YamlFrontmatter | null {
  const lines = content.split("\n");
  if (lines[0].trim() !== "---") return null;

  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (endIdx === -1) return null;

  const yamlLines = lines.slice(1, endIdx);
  const result: YamlFrontmatter = {};

  for (const line of yamlLines) {
    const match = line.match(/^(\S+):\s*(.*)/);
    if (match) {
      result[match[1] as keyof YamlFrontmatter] = match[2].trim();
    }
  }

  return result;
}

function checkSkill(dir: string): FrontmatterResult {
  const dirName = path.basename(dir);
  const result: FrontmatterResult = {
    dir: dirName,
    ok: true,
    warnings: [],
    errors: [],
  };

  const skillFile = path.join(dir, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    result.errors.push("missing SKILL.md");
    result.ok = false;
    return result;
  }

  const content = fs.readFileSync(skillFile, "utf-8");
  if (!content.startsWith("---")) {
    result.errors.push("SKILL.md does not start with ---");
    result.ok = false;
    return result;
  }

  const fm = parseFrontmatter(content);
  if (!fm) {
    result.errors.push("no frontmatter found");
    result.ok = false;
    return result;
  }

  if (!fm.name) {
    result.errors.push("missing 'name'");
  } else if (fm.name !== dirName) {
    result.errors.push(
      `name '${fm.name}' does not match directory '${dirName}'`,
    );
  }

  if (!fm.description) {
    result.errors.push("missing 'description'");
  }

  if (!fm["allowed-tools"]) {
    result.errors.push("missing 'allowed-tools'");
  }

  if (!fm.context) {
    result.warnings.push("missing 'context'");
  }

  if (!fm.agent) {
    result.errors.push("missing 'agent' field (required per AGENTS.md)");
  }

  if (result.errors.length > 0) {
    result.ok = false;
  }

  return result;
}

describe("Skill frontmatter validation", () => {
  it("all skills have valid frontmatter", () => {
    if (!fs.existsSync(SKILLS_DIR)) {
      return;
    }

    const entries = fs.readdirSync(SKILLS_DIR);
    const skillDirs = entries.filter((e) => {
      const fullPath = path.join(SKILLS_DIR, e);
      return !e.startsWith("_") && fs.statSync(fullPath).isDirectory();
    });

    const failures: string[] = [];
    const warnings: string[] = [];

    for (const dir of skillDirs) {
      const fullPath = path.join(SKILLS_DIR, dir);
      const result = checkSkill(fullPath);

      if (!result.ok) {
        failures.push(`${dir}: ${result.errors.join(", ")}`);
      }
      for (const w of result.warnings) {
        warnings.push(`${dir}: ${w}`);
      }
    }

    // Warnings are logged but not failures
    if (warnings.length > 0) {
      console.log("Warnings:", warnings);
    }

    if (failures.length > 0) {
      expect(failures).toEqual([]);
    }
  });
});
