import type { JsonSchema } from '@ashfox/runtime/transport/mcp/types';

const SERVICE_QUERY_MATCH_ENUM = ['exact', 'prefix', 'contains'] as const;
const SERVICE_WORKSPACE_FIELD_ENUM = ['any', 'workspaceId', 'name', 'createdBy', 'memberAccountId'] as const;
const SERVICE_USER_FIELD_ENUM = ['any', 'accountId', 'displayName', 'email', 'localLoginId', 'githubLogin'] as const;

const BASE_QUERY_LIMIT_SCHEMA: JsonSchema = {
  type: 'number',
  minimum: 1,
  maximum: 100
};

export const serviceToolSchemas: Record<string, JsonSchema> = {
  service_list_workspaces: {
    type: 'object',
    additionalProperties: false,
    properties: {
      q: { type: 'string' },
      field: { type: 'string', enum: SERVICE_WORKSPACE_FIELD_ENUM },
      match: { type: 'string', enum: SERVICE_QUERY_MATCH_ENUM },
      memberAccountId: { type: 'string' },
      limit: BASE_QUERY_LIMIT_SCHEMA,
      cursor: { type: 'string' }
    }
  },
  service_list_users: {
    type: 'object',
    additionalProperties: false,
    properties: {
      q: { type: 'string' },
      field: { type: 'string', enum: SERVICE_USER_FIELD_ENUM },
      match: { type: 'string', enum: SERVICE_QUERY_MATCH_ENUM },
      workspaceId: { type: 'string' },
      limit: BASE_QUERY_LIMIT_SCHEMA,
      cursor: { type: 'string' }
    }
  },
  service_list_user_workspaces: {
    type: 'object',
    additionalProperties: false,
    required: ['accountId'],
    properties: {
      accountId: { type: 'string' }
    }
  },
  service_set_user_roles: {
    type: 'object',
    additionalProperties: false,
    required: ['accountId', 'systemRoles'],
    properties: {
      accountId: { type: 'string' },
      systemRoles: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['system_admin', 'cs_admin']
        }
      }
    }
  },
  service_get_config: {
    type: 'object',
    additionalProperties: false,
    properties: {}
  },
  service_update_smtp: {
    type: 'object',
    additionalProperties: false,
    properties: {
      enabled: { type: 'boolean' },
      host: { type: 'string' },
      port: { type: 'number', minimum: 1, maximum: 65535 },
      secure: { type: 'boolean' },
      username: { type: 'string' },
      password: { type: 'string' },
      fromEmail: { type: 'string' },
      fromName: { type: 'string' }
    }
  },
  service_update_github_auth: {
    type: 'object',
    additionalProperties: false,
    properties: {
      enabled: { type: 'boolean' },
      clientId: { type: 'string' },
      clientSecret: { type: 'string' },
      callbackUrl: { type: 'string' },
      scopes: { type: 'string' }
    }
  }
};
