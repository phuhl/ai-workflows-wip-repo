export interface E2EContext {
  repo: string;
  repoUrl: string;
  issueNumber?: number;
  prNumber?: number;
  branchName?: string;
  metadata: Record<string, string>;
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  message: string;
}

export interface ScenarioSpec {
  name: string;
  description: string;
  timeoutMs: number;
  checkJob?: string;
  setup: (ctx: E2EContext) => Promise<void>;
  trigger: (ctx: E2EContext) => Promise<void>;
  wait: (ctx: E2EContext) => Promise<void>;
  assertions: (ctx: E2EContext) => Promise<AssertionResult[]>;
  cleanup: (ctx: E2EContext) => Promise<void>;
}

export interface TokenUsageEntry {
  skill: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  source: "opencode" | "estimated";
}

export interface ScenarioResult {
  name: string;
  passed: boolean;
  assertions: AssertionResult[];
  error?: string;
  durationMs: number;
  tokenUsage?: TokenUsageEntry[];
}

export interface Comment {
  id: number;
  body: string;
  author: string;
  createdAt: string;
}

export interface PrInfo {
  number: number;
  title: string;
  body: string;
  state: string;
  isDraft: boolean;
  headRefName: string;
  baseRefName: string;
  labels: { name: string }[];
  author: { login: string; isBot: boolean };
  mergeable: string;
}

export interface WorkflowRun {
  databaseId: number;
  name: string;
  status: string;
  conclusion: string | null;
  headBranch: string;
  createdAt: string;
}

export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}
