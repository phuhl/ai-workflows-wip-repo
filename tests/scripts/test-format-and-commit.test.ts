import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { formatAndCommit } from "../../src/skills/_shared/scripts/format-and-commit";

function setupRepo(dir: string): string {
  const workdir = path.join(dir, "workdir");
  fs.mkdirSync(workdir, { recursive: true });

  const cwd = process.cwd();
  process.chdir(workdir);

  execSync("git init --quiet");
  execSync('git config user.email "test@test.com"');
  execSync('git config user.name "Test"');
  fs.writeFileSync("README.md", "initial");
  execSync("git add README.md");
  execSync("git commit -m initial --quiet");

  // Create bare remote
  const remote = path.join(dir, "remote.git");
  execSync(`git init --quiet --bare ${remote}`);
  execSync(`git remote add origin ${remote}`);
  execSync("git push --quiet origin master");

  process.chdir(cwd);
  return workdir;
}

describe("formatAndCommit", () => {
  let originalCwd: string;

  beforeAll(() => {
    originalCwd = process.cwd();
  });

  it("exits 1 with no message", () => {
    const result = formatAndCommit("", ["file.txt"]);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("exits 1 when no files provided", () => {
    const result = formatAndCommit("msg", []);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("successfully commits and pushes files", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "test-fac-"));
    try {
      const workdir = setupRepo(tmp);
      process.chdir(workdir);

      fs.writeFileSync("file1.txt", "new content");
      fs.writeFileSync("file2.txt", "more content");

      const result = formatAndCommit("feat: test commit (#42)", [
        "file1.txt",
        "file2.txt",
      ]);

      if (!result.ok) {
        console.error("Output:", result.output);
      }
      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);

      const commitMsg = execSync("git log -1 --format=%s", {
        encoding: "utf-8",
      }).trim();
      expect(commitMsg).toBe("feat: test commit (#42)");

      const committedFiles = execSync(
        "git diff-tree --no-commit-id --name-only -r HEAD",
        {
          encoding: "utf-8",
        },
      ).trim();
      expect(committedFiles).toContain("file1.txt");
      expect(committedFiles).toContain("file2.txt");
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles single file commit", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "test-fac-"));
    try {
      const workdir = setupRepo(tmp);
      process.chdir(workdir);

      fs.writeFileSync("only.txt", "single file content");

      const result = formatAndCommit("fix: single file test", ["only.txt"]);

      expect(result.ok).toBe(true);

      const commitMsg = execSync("git log -1 --format=%s", {
        encoding: "utf-8",
      }).trim();
      expect(commitMsg).toBe("fix: single file test");
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles special characters in commit message", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "test-fac-"));
    try {
      const workdir = setupRepo(tmp);
      process.chdir(workdir);

      fs.writeFileSync("f.txt", "special");

      const msg = "fix: special chars — em-dash & quotes 'test' (#99)";
      const result = formatAndCommit(msg, ["f.txt"]);

      expect(result.ok).toBe(true);

      const commitMsg = execSync("git log -1 --format=%s", {
        encoding: "utf-8",
      }).trim();
      expect(commitMsg).toBe(msg);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports error for non-existent file", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "test-fac-"));
    try {
      const workdir = setupRepo(tmp);
      process.chdir(workdir);

      const result = formatAndCommit("fix: bad file", ["nonexistent.txt"]);

      expect(result.ok).toBe(false);
      expect(result.output).toContain("did not match");
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
