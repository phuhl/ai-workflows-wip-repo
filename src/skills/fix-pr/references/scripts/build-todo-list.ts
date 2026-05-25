import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

interface ReviewComment {
  id: number;
  path: string;
  line: number | null;
  body: string;
  in_reply_to_id: number | null;
  user: string;
  created_at: string;
}

interface PrComment {
  id: number;
  body: string;
  author: string;
  createdAt: string;
}

interface TodoItem {
  type: "review" | "pr_comment";
  id: number;
  text: string;
  author: string;
  path?: string;
  line?: number | null;
  triaged: boolean;
}

function gh(args: string): string {
  return execSync(`gh ${args}`, { encoding: "utf-8" }).trim();
}

function detectBotUser(): string {
  try {
    return gh("api /user -q '.login'");
  } catch {
    return "opencode[bot]";
  }
}

function isStatusComment(body: string): boolean {
  const hasKeyword = /\*\*OpenCode\*\*/i.test(body) || /opencode/i.test(body);
  const hasOutcome = /finished|failed|ended|error|started|processing/i.test(
    body,
  );
  const hasIcon = /[✅❌⚠️]/u.test(body);
  return hasKeyword || (hasOutcome && hasIcon);
}

function loadReviewComments(): ReviewComment[] {
  try {
    return JSON.parse(
      readFileSync(resolve(".ai-workflows/pr-review-comments.json"), "utf-8"),
    );
  } catch {
    return [];
  }
}

function loadPrComments(): PrComment[] {
  try {
    return JSON.parse(
      readFileSync(resolve(".ai-workflows/pr-comments.json"), "utf-8"),
    );
  } catch {
    return [];
  }
}

function hasHumanThumbsDown(
  repo: string,
  commentId: number,
  botUser: string,
): boolean {
  try {
    const reactions = JSON.parse(
      gh(
        `api "repos/${repo}/pulls/comments/${commentId}/reactions" --jq '[.[] | {user: .user.login, content}]'`,
      ),
    );
    return reactions.some(
      (r: { user: string; content: string }) =>
        r.content === "-1" && r.user !== botUser,
    );
  } catch {
    return false;
  }
}

function buildTodoList(): TodoItem[] {
  const botUser = detectBotUser();
  const repo = process.env.REPO || process.env.GITHUB_REPOSITORY || "";
  const reviewComments = loadReviewComments();
  const prComments = loadPrComments();
  const todos: TodoItem[] = [];

  const threadStarters = reviewComments.filter((c) => !c.in_reply_to_id);

  for (const comment of threadStarters) {
    const replies = reviewComments.filter(
      (r) => r.in_reply_to_id === comment.id,
    );
    const sortedReplies = [
      ...new Map(replies.map((r) => [r.id, r])).values(),
    ].sort((a, b) => a.id - b.id);
    const lastReply = sortedReplies[sortedReplies.length - 1];
    if (lastReply && lastReply.user === botUser) continue;

    const triaged =
      comment.user === botUser && hasHumanThumbsDown(repo, comment.id, botUser);

    todos.push({
      type: "review",
      id: comment.id,
      text: `Review comment from ${comment.user} on ${comment.path}:${
        comment.line ?? "?"
      } — "${comment.body.slice(0, 80)}"`,
      author: comment.user,
      path: comment.path,
      line: comment.line,
      triaged,
    });
  }

  for (const comment of prComments) {
    if (comment.author === botUser) continue;
    if (isStatusComment(comment.body)) continue;

    const hasReply = prComments.some(
      (r) => r.author === botUser && r.id !== comment.id,
    );
    if (hasReply) continue;

    todos.push({
      type: "pr_comment",
      id: comment.id,
      text: `PR comment from ${comment.author} — "${comment.body.slice(0, 80)}"`,
      author: comment.author,
      triaged: false,
    });
  }

  return todos;
}

const result = {
  bot_user: detectBotUser(),
  todos: buildTodoList(),
};
console.log(JSON.stringify(result, null, 2));
