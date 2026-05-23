import { execSync } from "node:child_process";

const USAGE = "Usage: check-off-subtask <issue-number> <subtask-text> [repo]";

export interface CheckOffResult {
  ok: boolean;
  exitCode: number;
  output: string;
}

function ghCli(args: string): { stdout: string; ok: boolean } {
  try {
    const stdout = execSync(`gh ${args}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return { stdout: stdout.trim(), ok: true };
  } catch {
    return { stdout: "", ok: false };
  }
}

export function checkOffSubtask(
  issueNumber: string,
  subtaskText: string,
  repoArg?: string,
): CheckOffResult {
  if (!issueNumber || !subtaskText) {
    return {
      ok: false,
      exitCode: 1,
      output: `${USAGE}\nError: issue number and subtask text are required`,
    };
  }

  // Determine repo
  let repo = repoArg;
  if (!repo) {
    const repoResult = ghCli(
      "repo view --json nameWithOwner -q .nameWithOwner",
    );
    if (!repoResult.ok || !repoResult.stdout) {
      return {
        ok: false,
        exitCode: 2,
        output:
          "Error: could not determine repository. Pass it as the third argument.",
      };
    }
    repo = repoResult.stdout.trim();
  }

  // Get issue body to find subtasks comment
  const issueResult = ghCli(
    `issue view ${issueNumber} --json body --jq ".body" --repo "${repo}"`,
  );

  if (!issueResult.ok) {
    return {
      ok: false,
      exitCode: 2,
      output: `Error: could not fetch issue #${issueNumber}`,
    };
  }

  const body = issueResult.stdout;

  // Find subtasks section in issue body
  const subtasksMatch = body.match(/## Subtasks[\s\S]*?(?=\n## |\n*$)/);
  if (!subtasksMatch) {
    return {
      ok: false,
      exitCode: 3,
      output: "No subtasks comment found on the issue.",
    };
  }

  const subtasksText = subtasksMatch[0];

  // Find the line containing the subtask text
  const lines = subtasksText.split("\n");
  const taskLineIdx = lines.findIndex((l) => l.includes(subtaskText));

  if (taskLineIdx === -1) {
    return {
      ok: true,
      exitCode: 0,
      output: `Warning: subtask text "${subtaskText}" not found in subtasks section. No changes made.`,
    };
  }

  // Check off the checkbox
  const originalLine = lines[taskLineIdx];
  lines[taskLineIdx] = originalLine.replace("- [ ]", "- [x]");

  // Reconstruct the issue body with updated subtasks
  const beforeSubtasks = body.substring(0, body.indexOf(subtasksText));
  const afterSubtasks = body.substring(
    body.indexOf(subtasksText) + subtasksText.length,
  );
  const newBody = beforeSubtasks + lines.join("\n") + afterSubtasks;

  // Find the subtasks comment ID on the issue
  const commentsResult = ghCli(
    `api "repos/${repo}/issues/${issueNumber}/comments" --jq ".[] | select(.body | contains(\\"## Subtasks\\")) | .id"`,
  );

  if (commentsResult.ok && commentsResult.stdout) {
    const commentId = commentsResult.stdout.trim().split("\n")[0];
    if (commentId) {
      const updatedBody = newBody.replace(/"/g, '\\"').replace(/\n/g, "\\n");

      const patchResult = ghCli(
        `api "repos/${repo}/issues/comments/${commentId}" --method PATCH --field 'body=${updatedBody}'`,
      );
      if (!patchResult.ok) {
        return {
          ok: false,
          exitCode: 4,
          output: `Error: failed to update comment ${commentId}`,
        };
      }
    }
  } else {
    // No subtasks comment exists; update the issue body directly
    // Check if subtasks are in issue body (not a comment)
    if (body.includes("## Subtasks")) {
      // Update issue directly (limited scenario)
      const updatedBody = newBody.replace(/"/g, '\\"').replace(/\n/g, "\\n");
      const patchResult = ghCli(
        `api "repos/${repo}/issues/${issueNumber}" --method PATCH --field 'body=${updatedBody}'`,
      );
      if (!patchResult.ok) {
        return {
          ok: false,
          exitCode: 4,
          output: `Error: failed to update issue #${issueNumber}`,
        };
      }
    }
  }

  return {
    ok: true,
    exitCode: 0,
    output: `Checked off: ${subtaskText}`,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const [issueNumber, subtaskText, repo] = args;
  const result = checkOffSubtask(issueNumber || "", subtaskText || "", repo);
  console.log(result.output);
  process.exit(result.exitCode);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
