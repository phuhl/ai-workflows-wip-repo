import { execSync } from "node:child_process";

const PR_NUMBER = process.argv[2];
if (!PR_NUMBER) {
  console.error("Usage: get-failed-ci-log <pr-number>");
  process.exit(1);
}

function gh(args: string): string {
  return execSync(`gh ${args}`, { encoding: "utf-8", stdio: "pipe" }).trim();
}

const branch = gh(`pr view ${PR_NUMBER} --json headRefName -q '.headRefName'`);

const runId = gh(
  `run list --branch "${branch}" --status failure --limit 1 --json databaseId -q '.[0].databaseId'`,
);

if (!runId) {
  console.log("No failed CI runs found for branch:", branch);
  process.exit(0);
}

const log = execSync(`gh run view ${runId} --log-failed`, {
  encoding: "utf-8",
  stdio: "pipe",
});
process.stdout.write(log);
