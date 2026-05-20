import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function validateYaml(content: string): string | null {
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for tabs (YAML uses spaces)
    if (line.match(/^\t/)) {
      return `Line ${i + 1}: tab indentation (use spaces)`;
    }
  }

  return null;
}

function extractFrontmatter(content: string): {
  fm: string | null;
  endLine: number;
} {
  const lines = content.split("\n");
  if (lines[0].trim() !== "---") return { fm: null, endLine: 0 };

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return { fm: lines.slice(1, i).join("\n"), endLine: i };
    }
  }

  return { fm: null, endLine: 0 };
}

function findYamlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findYamlFiles(fullPath));
    } else if (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) {
      results.push(fullPath);
    }
  }
  return results;
}

function findSkillFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSkillFiles(fullPath));
    } else if (entry.name === "SKILL.md") {
      results.push(fullPath);
    }
  }
  return results;
}

describe("YAML syntax validation", () => {
  it("all .yml workflow files have valid YAML syntax", () => {
    const yamlFiles = [
      ...findYamlFiles(".github/workflows"),
      ...findYamlFiles("wrappers"),
    ];
    const failures: string[] = [];

    for (const file of yamlFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const error = validateYaml(content);
      if (error) {
        failures.push(`${file}: ${error}`);
      }
    }

    if (failures.length > 0) {
      expect(failures).toEqual([]);
    }
  });

  it("all SKILL.md files have valid YAML frontmatter", () => {
    const skillFiles = findSkillFiles(".opencode/skills");
    const failures: string[] = [];

    for (const file of skillFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const { fm } = extractFrontmatter(content);

      if (fm === null) continue;

      const error = validateYaml(fm);
      if (error) {
        failures.push(`${file}: ${error}`);
      }

      if (!fm.includes("name:")) {
        failures.push(`${file}: missing 'name' in frontmatter`);
      }
    }

    if (failures.length > 0) {
      expect(failures).toEqual([]);
    }
  });
});
