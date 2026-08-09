import type { AiKey } from '@/domain/schema';

/**
 * A key-shaped string for tests. Long enough to pass the schema's length bound,
 * obviously fake so it can never be mistaken for a real one in a diff.
 */
export const TEST_AI_KEY: AiKey = {
  provider: 'anthropic',
  key: 'sk-ant-api03-THIS-IS-NOT-A-REAL-KEY-0123456789',
};
