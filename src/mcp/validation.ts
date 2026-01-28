import { JsonSchema } from './types';
import {
  MCP_VALIDATION_ENUM_MESSAGE,
  MCP_VALIDATION_MAX_ITEMS_MESSAGE,
  MCP_VALIDATION_MIN_ITEMS_MESSAGE,
  MCP_VALIDATION_NOT_ALLOWED_MESSAGE,
  MCP_VALIDATION_REQUIRED_MESSAGE,
  MCP_VALIDATION_TYPE_MESSAGE
} from '../shared/messages';

export type ValidationResult = { ok: true } | { ok: false; message: string };

const isObject = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const typeMatches = (schemaType: JsonSchema['type'], value: unknown) => {
  if (!schemaType) return true;
  switch (schemaType) {
    case 'object':
      return isObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
};

export const validateSchema = (schema: JsonSchema, value: unknown, path = '$'): ValidationResult => {
  if (!typeMatches(schema.type, value)) {
    return { ok: false, message: MCP_VALIDATION_TYPE_MESSAGE(path, schema.type ?? 'unknown') };
  }

  if (schema.enum && !schema.enum.some((item) => item === value)) {
    return { ok: false, message: MCP_VALIDATION_ENUM_MESSAGE(path, schema.enum) };
  }

  if (schema.type === 'array' && Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      return { ok: false, message: MCP_VALIDATION_MIN_ITEMS_MESSAGE(path, schema.minItems) };
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      return { ok: false, message: MCP_VALIDATION_MAX_ITEMS_MESSAGE(path, schema.maxItems) };
    }
    if (schema.items) {
      for (let i = 0; i < value.length; i += 1) {
        const result = validateSchema(schema.items, value[i], `${path}[${i}]`);
        if (!result.ok) return result;
      }
    }
  }

  if (schema.type === 'object' && isObject(value)) {
    const obj = value as Record<string, unknown>;
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in obj)) return { ok: false, message: MCP_VALIDATION_REQUIRED_MESSAGE(path, key) };
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          const result = validateSchema(propSchema, obj[key], `${path}.${key}`);
          if (!result.ok) return result;
        }
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(obj)) {
        if (!(key in schema.properties)) {
          return { ok: false, message: MCP_VALIDATION_NOT_ALLOWED_MESSAGE(path, key) };
        }
      }
    }
  }

  return { ok: true };
};
