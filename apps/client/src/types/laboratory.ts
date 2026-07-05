export interface Stance {
  id: string;
  name: string;
  template: string;
  position: "A" | "B";
  briefing: string;
  icon: string;
  color: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  stance: Stance;
  systemPrompt: string;
  model: string;
  leader?: boolean;
}

export interface VariantRunResult {
  status: "pending" | "running" | "completed" | "failed";
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  negotiationRounds?: number;
  escalationsToLeader?: number;
  agreementReached?: boolean;
  finalOutput: string;
  scores?: {
    taskQuality: number;
    efficiencyScore: number;
    negotiationScore?: number;
    globalScore: number;
    judgeReasoning?: string;
    criteriaScores?: Record<string, number>;
  };
}

export interface Variant {
  type: "single" | "multi_no_leader" | "multi_with_leader";
  channelId?: string;
  activeSessionId?: string | null;
  agents: Agent[];
  result?: VariantRunResult;
}

export interface Experiment {
  id: string;
  name: string;
  taskPrompt: string;
  status: "designing" | "running" | "completed" | "failed";
  positions: Stance[];
  judge: {
    criteria: string[];
    autoEvaluate: boolean;
  };
  variants: {
    single: Variant;
    multiNoLeader: Variant;
    multiWithLeader: Variant;
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  blueprintId?: string;
}

export interface Blueprint {
  id: string;
  name: string;
  description: string;
  testCases: {
    id: string;
    name: string;
    description: string;
    taskPrompt: string;
  }[];
}
