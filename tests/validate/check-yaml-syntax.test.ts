import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function validateYaml(content: string, filePath: string): string | null {
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for tabs (YAML uses spaces)
    if (line.match(/^\t/)) {
      return `Line ${i + 1}: tab indentation (use spaces)`;
    }
  }

  // Check for inconsistent indentation of sibling mapping keys.
  // For each parent key, find all direct children and verify they
  // all share the same indentation.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === "") continue;
    if (line.trim().startsWith("#")) continue;

    const parentIndent = line.length - line.trimStart().length;

    // Must be a mapping key (not a scalar, not a list item)
    if (!/^\s*[\w-]+:/.test(line) || /^\s*- /.test(line.trim())) continue;

    // Skip block scalar keys whose children are literal content
    if (/\|\s*$/.test(line.trimEnd()) || />\s*$/.test(line.trimEnd())) continue;

    // Find first direct child and record its indent
    let firstChildIndent = -1;
    let childLineNum = -1;
    for (let k = i + 1; k < lines.length; k++) {
      const childLine = lines[k];
      if (!childLine || childLine.trim() === "") continue;
      if (childLine.trim().startsWith("#")) continue;

      const childIndent = childLine.length - childLine.trimStart().length;

      // Below parent — not a child
      if (childIndent <= parentIndent) break;

      // This is the first direct child
      if (firstChildIndent === -1) {
        firstChildIndent = childIndent;
        childLineNum = k;
        break;
      }
    }

    if (firstChildIndent === -1) continue;

    // Find next sibling of this key (at parentIndent)
    let siblingLine = -1;
    for (let k = i + 1; k < lines.length; k++) {
      const childLine = lines[k];
      if (!childLine || childLine.trim() === "") continue;
      if (childLine.trim().startsWith("#")) continue;

      const childIndent = childLine.length - childLine.trimStart().length;

      if (childIndent === parentIndent) {
        siblingLine = k;
        break;
      }
      // Below parent — reached a different scope
      if (childIndent < parentIndent) break;
    }

    const endLine = siblingLine !== -1 ? siblingLine : lines.length;

    // Scan direct children (at firstChildIndent) for inconsistent siblings
    // that are also at different indents within this parent's scope.
    // Also skip lines within block scalars.
    let inBlockScalar = false;
    let blockScalarBase = -1;
    let directChildCount = 0;

    for (let k = childLineNum; k < endLine; k++) {
      const childLine = lines[k];
      if (!childLine || childLine.trim() === "") continue;
      if (childLine.trim().startsWith("#")) continue;

      const childIndent = childLine.length - childLine.trimStart().length;

      // Exiting block scalar
      if (inBlockScalar && childIndent <= blockScalarBase) {
        inBlockScalar = false;
        blockScalarBase = -1;
      }

      // Inside block scalar — skip
      if (inBlockScalar) continue;

      // Enter block scalar
      if (
        childIndent === firstChildIndent &&
        (/\|\s*$/.test(childLine.trimEnd()) ||
          />\s*$/.test(childLine.trimEnd()))
      ) {
        inBlockScalar = true;
        blockScalarBase = childIndent;
        continue;
      }

      // Skip grandchildren (more indented than direct children)
      if (childIndent > firstChildIndent) continue;

      // Direct child at the expected indent — count it
      if (childIndent === firstChildIndent) {
        directChildCount++;
        continue;
      }

      // Found a line at an indent BETWEEN parentIndent and firstChildIndent
      // that is NOT at the expected direct child level — this is an error
      if (childIndent > parentIndent && childIndent < firstChildIndent) {
        return `${filePath} line ${k + 1}: child indent ${childIndent} differs from expected ${firstChildIndent} (under parent at line ${i + 1})`;
      }

      // At or below parent indent — scope ended
      if (childIndent <= parentIndent) break;
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
      const error = validateYaml(content, file);
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

      const error = validateYaml(fm, file);
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
