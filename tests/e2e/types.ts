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
  setup: (ctx: E2EContext) => Promise<void>;
  trigger: (ctx: E2EContext) => Promise<void>;
  wait: (ctx: E2EContext) => Promise<void>;
  assertions: (ctx: E2EContext) => Promise<AssertionResult[]>;
  cleanup: (ctx: E2EContext) => Promise<void>;
}

export interface ScenarioResult {
  name: string;
  passed: boolean;
  assertions: AssertionResult[];
  error?: string;
  durationMs: number;
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
  id: number;
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
