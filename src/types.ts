export type Agent = 'claude' | 'codex' | 'cursor';
export interface UsageEvent {
  agent: Agent;
  sessionId: string;
  timestamp: string; // ISO
  model: string;
  inputTokens: number; // non-cached input
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number; // includes reasoning
  project?: string;
  estimated?: boolean;
}
