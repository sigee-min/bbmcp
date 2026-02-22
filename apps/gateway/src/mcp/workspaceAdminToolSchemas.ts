import type { JsonSchema } from '@ashfox/runtime/transport/mcp/types';

const ACL_EFFECT_ENUM = ['inherit', 'allow', 'deny'] as const;

const REQUIRED_ACCOUNT_ID_SCHEMA: JsonSchema = {
  type: 'string'
};

export const workspaceAdminToolSchemas: Record<string, JsonSchema> = {
  workspace_get_metrics: {
    type: 'object',
    additionalProperties: false,
    properties: {}
  },
  workspace_list_members: {
    type: 'object',
    additionalProperties: false,
    properties: {}
  },
  workspace_upsert_member: {
    type: 'object',
    additionalProperties: false,
    required: ['accountId', 'roleIds'],
    properties: {
      accountId: REQUIRED_ACCOUNT_ID_SCHEMA,
      roleIds: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'string'
        }
      }
    }
  },
  workspace_delete_member: {
    type: 'object',
    additionalProperties: false,
    required: ['accountId'],
    properties: {
      accountId: REQUIRED_ACCOUNT_ID_SCHEMA
    }
  },
  workspace_list_roles: {
    type: 'object',
    additionalProperties: false,
    properties: {}
  },
  workspace_upsert_role: {
    type: 'object',
    additionalProperties: false,
    required: ['name'],
    properties: {
      roleId: {
        type: 'string'
      },
      name: {
        type: 'string'
      }
    }
  },
  workspace_delete_role: {
    type: 'object',
    additionalProperties: false,
    required: ['roleId'],
    properties: {
      roleId: {
        type: 'string'
      }
    }
  },
  workspace_set_default_member_role: {
    type: 'object',
    additionalProperties: false,
    required: ['roleId'],
    properties: {
      roleId: {
        type: 'string'
      }
    }
  },
  workspace_list_acl_rules: {
    type: 'object',
    additionalProperties: false,
    properties: {}
  },
  workspace_upsert_acl_rule: {
    type: 'object',
    additionalProperties: false,
    required: ['roleIds', 'read', 'write'],
    properties: {
      ruleId: {
        type: 'string'
      },
      folderId: {
        type: 'string'
      },
      roleIds: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'string'
        }
      },
      read: {
        type: 'string',
        enum: ACL_EFFECT_ENUM
      },
      write: {
        type: 'string',
        enum: ACL_EFFECT_ENUM
      }
    }
  },
  workspace_delete_acl_rule: {
    type: 'object',
    additionalProperties: false,
    required: ['ruleId'],
    properties: {
      ruleId: {
        type: 'string'
      }
    }
  }
};
