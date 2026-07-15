export interface SubagentConfig {
  maxDepth: number;
}

export const DEFAULT_SUBAGENT_CONFIG: SubagentConfig = {
  maxDepth: 1,
};

export function getAppConfig() {
  const envMaxDepth = process.env.CREWFACTORY_SUBAGENT_MAX_DEPTH;
  const parsedDepth = envMaxDepth !== undefined ? parseInt(envMaxDepth, 10) : undefined;
  const maxDepth = parsedDepth !== undefined && !isNaN(parsedDepth) ? parsedDepth : DEFAULT_SUBAGENT_CONFIG.maxDepth;

  return {
    subagent: {
      maxDepth,
    },
  };
}
