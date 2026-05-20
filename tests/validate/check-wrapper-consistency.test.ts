import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const WORKFLOWS_DIR = ".github/workflows";
const WRAPPERS_DIR = "wrappers";

function extractWorkflowName(uses: string): string {
  // Handles: org/repo/.github/workflows/reusable-xxx.yml@master
  // And: ./.github/workflows/reusable-xxx.yml
  let name = uses;
  name = name.replace(/.*\/\.github\/workflows\//, "");
  name = name.replace(/\.github\/workflows\//, "");
  name = name.replace(/@.*/, "");
  return name;
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

function findUsesLines(content: string): string[] {
  const lines = content.split("\n");
  return lines
    .filter((l) => l.match(/^\s+uses:/))
    .map((l) => l.replace(/.*uses:\s*/, "").trim());
}

describe("Wrapper → reusable workflow consistency", () => {
  it("all wrapper uses: references point to existing workflow files", () => {
    const wrapperFiles = findYamlFiles(WRAPPERS_DIR);
    const failures: string[] = [];

    for (const wrapper of wrapperFiles) {
      const content = fs.readFileSync(wrapper, "utf-8");
      const usesLines = findUsesLines(content);

      for (const uses of usesLines) {
        const workflowName = extractWorkflowName(uses);
        const workflowPath = path.join(WORKFLOWS_DIR, workflowName);

        if (!fs.existsSync(workflowPath)) {
          failures.push(`${wrapper} → ${workflowName} (file not found)`);
        }
      }
    }

    if (failures.length > 0) {
      expect(failures).toEqual([]);
    }
  });

  it("master router internal refs point to existing workflow files", () => {
    const masterRouter = path.join(
      WORKFLOWS_DIR,
      "reusable-opencode-master.yml",
    );
    if (!fs.existsSync(masterRouter)) return;

    const content = fs.readFileSync(masterRouter, "utf-8");
    const usesLines = findUsesLines(content);
    const failures: string[] = [];

    for (const uses of usesLines) {
      if (uses.includes("reusable-opencode-master")) continue;

      const workflowName = extractWorkflowName(uses);
      const workflowPath = path.join(WORKFLOWS_DIR, workflowName);

      if (!fs.existsSync(workflowPath)) {
        failures.push(`master-router → ${workflowName} (file not found)`);
      }
    }

    if (failures.length > 0) {
      expect(failures).toEqual([]);
    }
  });
});
