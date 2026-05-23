import type { ScenarioSpec } from "../types";
import { happyPath } from "./happy-path";
import { planOnly } from "./plan-only";
import { fixPr } from "./fix-pr";
import { codeReview } from "./code-review";
import { userDo } from "./user-do";
import { autofixExhausted } from "./autofix-exhausted";
import { completeGate } from "./complete-gate";

export const allScenarios: Record<string, ScenarioSpec> = {
  "happy-path": happyPath,
  "plan-only": planOnly,
  "fix-pr": fixPr,
  "code-review": codeReview,
  "user-do": userDo,
  "autofix-exhausted": autofixExhausted,
  "complete-gate": completeGate,
};

export const scenarioNames = Object.keys(allScenarios);
