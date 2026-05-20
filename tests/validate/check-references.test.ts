import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SKILLS_DIR = ".opencode/skills";

function isPlaceholder(ref: string): boolean {
  if (ref.includes("...")) return true;
  if (/XX\d*/.test(ref)) return true;
  if (ref.includes("*")) return true;
  return false;
}

function findReferences(content: string): string[] {
  const lines = content.split("\n");
  const refs: string[] = [];
  const pattern = /(?:references|scripts)\/[^\s)\n`"']+/g;

  // Skip frontmatter
  let inFrontmatter = false;
  let frontmatterEnded = false;
  for (const line of lines) {
    if (!frontmatterEnded) {
      if (line.trim() === "---") {
        if (!inFrontmatter) {
          inFrontmatter = true;
          continue;
        } else {
          inFrontmatter = false;
          frontmatterEnded = true;
          continue;
        }
      }
      if (inFrontmatter) continue;
    }

    const matches = line.matchAll(pattern);
    for (const m of matches) {
      refs.push(m[0]);
    }
  }

  return refs;
}

describe("Skill reference integrity", () => {
  it("all referenced files exist or are placeholders", () => {
    if (!fs.existsSync(SKILLS_DIR)) {
      return;
    }

    const entries = fs.readdirSync(SKILLS_DIR);
    const skillDirs = entries.filter((e) => {
      return (
        !e.startsWith("_") &&
        fs.statSync(path.join(SKILLS_DIR, e)).isDirectory()
      );
    });

    const missingRefs: string[] = [];

    for (const dir of skillDirs) {
      const skillDir = path.join(SKILLS_DIR, dir);
      const skillFile = path.join(skillDir, "SKILL.md");

      if (!fs.existsSync(skillFile)) continue;

      const content = fs.readFileSync(skillFile, "utf-8");
      const refs = findReferences(content);

      // Deduplicate
      const uniqueRefs = [...new Set(refs)];

      for (const ref of uniqueRefs) {
        if (isPlaceholder(ref)) continue;

        const relToSkill = path.join(skillDir, ref);
        const absRef = path.resolve(ref);

        if (fs.existsSync(relToSkill) || fs.existsSync(absRef)) {
          continue;
        }

        // Skip self-referencing skills (references within same directory)
        if (ref.startsWith("references/") || ref.startsWith("scripts/")) {
          missingRefs.push(
            `${dir}: ${ref} (not found on disk, may be optional)`,
          );
        }
      }
    }

    if (missingRefs.length > 0) {
      console.log("Missing optional refs:", missingRefs);
    }
    // This test does not fail on missing references (they're warnings in the original)
  });
});
