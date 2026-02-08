import { errorMessage } from '../../logging';
import { err } from '../../shared/tooling/toolResponse';
import { validateSchema } from '@ashfox/contracts/mcpSchemas/validation';
import { markSchemaValidated } from '@ashfox/contracts/mcpSchemas/validationFlag';
import {
  MCP_TOOL_EXECUTION_FAILED,
  MCP_TOOL_NAME_REQUIRED,
  MCP_UNKNOWN_TOOL
} from '../../shared/messages';
import type { JsonRpcMessage, JsonRpcResponse } from './types';
import type { McpSession } from './session';
import type { RpcContext, RpcOutcome } from './routerRpcTypes';
import {
  isRecord,
  jsonRpcError,
  jsonRpcResult,
  makeTextContent,
  toCallToolResult
} from './routerUtils';

type ToolCallParams = {
  name: string | null;
  args: Record<string, unknown>;
};

const readToolCallParams = (message: JsonRpcMessage): ToolCallParams => {
  const params = isRecord(message.params) ? message.params : {};
  const name = typeof params.name === 'string' ? params.name : null;
  const args = isRecord(params.arguments) ? params.arguments : {};
  return { name, args };
};

const buildSchemaValidationResult = (
  name: string,
  validation: Extract<ReturnType<typeof validateSchema>, { ok: false }>
): ReturnType<typeof toCallToolResult> => {
  const toolError = err('invalid_payload', validation.message, {
    reason: 'schema_validation',
    path: validation.path,
    rule: validation.reason,
    ...(validation.details ?? {}),
    tool: name
  });
  return toCallToolResult(toolError);
};

export const handleToolCall = async (
  ctx: RpcContext,
  message: JsonRpcMessage,
  session: McpSession,
  id: JsonRpcResponse['id']
): Promise<RpcOutcome> => {
  const { name, args } = readToolCallParams(message);
  if (!name) {
    return { type: 'response', response: jsonRpcError(id, -32602, MCP_TOOL_NAME_REQUIRED), status: 400 };
  }
  const tool = ctx.toolRegistry.map.get(name);
  if (!tool) {
    return { type: 'response', response: jsonRpcError(id, -32602, MCP_UNKNOWN_TOOL(name)), status: 400 };
  }
  const schema = tool.inputSchema ?? null;
  if (schema) {
    const validation = validateSchema(schema, args);
    if (!validation.ok) {
      return {
        type: 'response',
        response: jsonRpcResult(id, buildSchemaValidationResult(name, validation)),
        status: 200
      };
    }
    markSchemaValidated(args);
  }

  ctx.sessions.touch(session);
  try {
    const response = await ctx.executor.callTool(name, args);
    return { type: 'response', response: jsonRpcResult(id, toCallToolResult(response)), status: 200 };
  } catch (error) {
    const messageText = errorMessage(error, MCP_TOOL_EXECUTION_FAILED);
    ctx.log.error('tool execution failed', { tool: name, message: messageText });
    return {
      type: 'response',
      response: jsonRpcResult(id, { isError: true, content: makeTextContent(messageText) }),
      status: 200
    };
  }
};
