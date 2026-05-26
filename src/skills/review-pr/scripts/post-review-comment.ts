import { execSync } from "node:child_process";

export function postReviewComment(
  prNumber: number,
  commitId: string,
  filePath: string,
  line: number,
  side: string,
  body: string,
): void {
  const runId = process.env.GITHUB_RUN_ID;
  const repo = process.env.GITHUB_REPOSITORY || process.env.GH_REPO || "";

  let runLink = "";
  if (runId && repo) {
    runLink = `\n\n[Run ${runId}](https://github.com/${repo}/actions/runs/${runId})`;
  }

  const payload = {
    commit_id: commitId,
    path: filePath,
    body: body + runLink,
    line,
    side,
  };

  const json = JSON.stringify(payload);

  if (!repo) {
    throw new Error("Missing repo context — set GITHUB_REPOSITORY or GH_REPO");
  }

  execSync(`gh api "repos/${repo}/pulls/${prNumber}/comments" --input -`, {
    input: json,
    encoding: "utf-8",
    stdio: "inherit",
  });
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length < 6) {
    console.log(
      "Usage: <script> <pr-number> <commit-id> <path> <line> <side> <body>",
    );
    process.exit(1);
  }

  const [prNumberArg, commitId, filePath, lineArg, side, body] = args;
  postReviewComment(
    parseInt(prNumberArg, 10),
    commitId,
    filePath,
    parseInt(lineArg, 10),
    side,
    body,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
