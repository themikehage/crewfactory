export const SessionPrefix = {
  EXEC: "exec_",
  DELEGATE: "del_",
  SUBAGENT: "sub_",
  LAB: "lab_",
  BENCHMARK: "bench_",
  BENCH_CLONE: "tmp_bench_",
  GENERATE: "generate_",
} as const;

export type SessionPrefixValue = typeof SessionPrefix[keyof typeof SessionPrefix];
