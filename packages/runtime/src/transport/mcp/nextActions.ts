import type { NextAction, NextActionArgs, NextActionValueRef } from '@ashfox/contracts/types/internal';

export const refTool = (tool: string, pointer: string, note?: string): NextActionValueRef => ({
  $ref: {
    kind: 'tool',
    tool,
    pointer,
    ...(note ? { note } : {})
  }
});

export const refUser = (hint: string): NextActionValueRef => ({
  $ref: {
    kind: 'user',
    hint
  }
});

export const callTool = (
  tool: string,
  args: NextActionArgs,
  reason: string,
  priority: number = 1
): NextAction => ({
  type: 'call_tool',
  tool,
  arguments: args,
  reason,
  priority
});

export const readResource = (uri: string, reason: string, priority: number = 1): NextAction => ({
  type: 'read_resource',
  uri,
  reason,
  priority
});

export const askUser = (question: string, reason: string, priority: number = 1): NextAction => ({
  type: 'ask_user',
  question,
  reason,
  priority
});




