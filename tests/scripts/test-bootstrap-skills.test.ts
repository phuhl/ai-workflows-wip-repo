import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { bootstrapSkills } from "../../scripts/bootstrap-skills";

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "test-bootstrap-"));
}

function writeFile(dir: string, relativePath: string, content: string): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

describe("bootstrapSkills", () => {
  it("copies shared skills only", () => {
    const tmp = tmpdir();
    try {
      const shared = path.join(tmp, "shared");
      const out = path.join(tmp, "out-skills");
      writeFile(shared, "skill-a/content.txt", "shared");

      bootstrapSkills({
        sharedDir: shared,
        localDir: "/nonexistent",
        outDir: out,
      });

      expect(fs.existsSync(path.join(out, "skill-a", "content.txt"))).toBe(
        true,
      );
      expect(
        fs.readFileSync(path.join(out, "skill-a", "content.txt"), "utf-8"),
      ).toBe("shared");
      expect(fs.existsSync(path.join(out, ".gitignore"))).toBe(true);
      expect(fs.readFileSync(path.join(out, ".gitignore"), "utf-8")).toContain(
        "*",
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("local overrides shared", () => {
    const tmp = tmpdir();
    try {
      const shared = path.join(tmp, "shared");
      const local = path.join(tmp, "local");
      const out = path.join(tmp, "out");
      writeFile(shared, "skill-x/conf.txt", "shared-version");
      writeFile(local, "skill-x/conf.txt", "local-version");

      bootstrapSkills({ sharedDir: shared, localDir: local, outDir: out });

      expect(fs.existsSync(path.join(out, "skill-x", "conf.txt"))).toBe(true);
      expect(
        fs.readFileSync(path.join(out, "skill-x", "conf.txt"), "utf-8"),
      ).toBe("local-version");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("copies local-only skills", () => {
    const tmp = tmpdir();
    try {
      const local = path.join(tmp, "local");
      const out = path.join(tmp, "out");
      writeFile(local, "skill-y/data.txt", "local-only");

      bootstrapSkills({
        sharedDir: "/nonexistent",
        localDir: local,
        outDir: out,
      });

      expect(fs.existsSync(path.join(out, "skill-y", "data.txt"))).toBe(true);
      expect(
        fs.readFileSync(path.join(out, "skill-y", "data.txt"), "utf-8"),
      ).toBe("local-only");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles local-dir equals out-dir", () => {
    const tmp = tmpdir();
    try {
      const local = path.join(tmp, "local");
      writeFile(local, "skill-z/val.txt", "same-dir-test");

      bootstrapSkills({
        sharedDir: "/nonexistent",
        localDir: local,
        outDir: local,
      });

      expect(fs.existsSync(path.join(local, "skill-z", "val.txt"))).toBe(true);
      expect(
        fs.readFileSync(path.join(local, "skill-z", "val.txt"), "utf-8"),
      ).toBe("same-dir-test");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("bootstraps plugins", () => {
    const tmp = tmpdir();
    try {
      // Match the real CI layout:
      // sharedDir = .ai-workflows/src/skills (ends in /skills)
      // sharedPluginsDir = .ai-workflows/src/plugins  (sibling of skills)
      // outDir = .opencode/skills (ends in /skills)
      // outPluginsDir = .opencode/plugins (sibling of skills, computed)
      const sharedSkills = path.join(tmp, "shared", "skills");
      writeFile(sharedSkills, "skill-p/info.txt", "plugin-skill");

      const sharedPlugins = path.join(tmp, "shared", "plugins");
      writeFile(sharedPlugins, "shared.ts", "shared-plugin");

      const outSkills = path.join(tmp, "out", "skills");

      bootstrapSkills({
        sharedDir: sharedSkills,
        localDir: "/nonexistent",
        outDir: outSkills,
      });

      // outPluginsDir = tmp/out/plugins
      const outPlugins = path.join(tmp, "out", "plugins");
      expect(fs.existsSync(path.join(outPlugins, "shared.ts"))).toBe(true);
      expect(fs.readFileSync(path.join(outPlugins, "shared.ts"), "utf-8")).toBe(
        "shared-plugin",
      );
      expect(fs.existsSync(path.join(outPlugins, ".gitignore"))).toBe(true);
      // Verify skill was also copied
      expect(fs.existsSync(path.join(outSkills, "skill-p", "info.txt"))).toBe(
        true,
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles empty outDir gracefully", () => {
    // Empty outDir should throw since we can't write to empty path
    expect(() => {
      bootstrapSkills({ sharedDir: "", localDir: "", outDir: "" });
    }).toThrow();
  });
});
