import type { JsonSchema } from './types';
import type { ValidationResult } from './validationTypes';
import { isObject, readRuntimeType, typeMatches } from './validationUtils';
import {
  MCP_VALIDATION_ANY_OF_MESSAGE,
  MCP_VALIDATION_ENUM_MESSAGE,
  MCP_VALIDATION_MAX_ITEMS_MESSAGE,
  MCP_VALIDATION_MIN_ITEMS_MESSAGE,
  MCP_VALIDATION_NOT_ALLOWED_MESSAGE,
  MCP_VALIDATION_REQUIRED_MESSAGE,
  MCP_VALIDATION_TYPE_MESSAGE
} from './messages';

type SchemaValidator = (schema: JsonSchema, value: unknown, path: string) => ValidationResult;

export const validateTypeRule = (
  schema: JsonSchema,
  value: unknown,
  path: string
): ValidationResult | null => {
  if (typeMatches(schema.type, value)) return null;
  return {
    ok: false,
    message: MCP_VALIDATION_TYPE_MESSAGE(path, schema.type ?? 'unknown'),
    path,
    reason: 'type',
    details: { expected: schema.type ?? 'unknown', actual: readRuntimeType(value) }
  };
};

export const validateEnumRule = (
  schema: JsonSchema,
  value: unknown,
  path: string
): ValidationResult | null => {
  if (!schema.enum || schema.enum.some((item) => item === value)) return null;
  return {
    ok: false,
    message: MCP_VALIDATION_ENUM_MESSAGE(path, schema.enum),
    path,
    reason: 'enum',
    details: { expected: schema.enum, actual: value, candidates: schema.enum }
  };
};

export const validateAnyOfRule = (
  schema: JsonSchema,
  value: unknown,
  path: string,
  validate: SchemaValidator
): ValidationResult | null => {
  if (!schema.anyOf || schema.anyOf.length === 0) return null;
  const results = schema.anyOf.map((candidate) => validate(candidate, value, path));
  if (results.some((result) => result.ok)) return null;
  const candidateKeys = schema.anyOf
    .map((candidate) => {
      if (!candidate.required || candidate.required.length === 0) return null;
      return candidate.required.length === 1 ? candidate.required[0] : candidate.required.join('+');
    })
    .filter((entry): entry is string => Boolean(entry));
  return {
    ok: false,
    message: MCP_VALIDATION_ANY_OF_MESSAGE(path, candidateKeys.length > 0 ? candidateKeys : undefined),
    path,
    reason: 'anyOf',
    details: {
      candidates: candidateKeys.length > 0 ? candidateKeys : schema.anyOf.map((candidate) => candidate.required)
    }
  };
};

export const validateArrayRule = (
  schema: JsonSchema,
  value: unknown,
  path: string,
  validate: SchemaValidator
): ValidationResult | null => {
  if (schema.type !== 'array' || !Array.isArray(value)) return null;
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    return {
      ok: false,
      message: MCP_VALIDATION_MIN_ITEMS_MESSAGE(path, schema.minItems),
      path,
      reason: 'minItems',
      details: { expected: schema.minItems, actual: value.length }
    };
  }
  if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
    return {
      ok: false,
      message: MCP_VALIDATION_MAX_ITEMS_MESSAGE(path, schema.maxItems),
      path,
      reason: 'maxItems',
      details: { expected: schema.maxItems, actual: value.length }
    };
  }
  if (!schema.items) return null;
  for (let i = 0; i < value.length; i += 1) {
    const nestedResult = validate(schema.items, value[i], `${path}[${i}]`);
    if (!nestedResult.ok) return nestedResult;
  }
  return null;
};

export const validateObjectRule = (
  schema: JsonSchema,
  value: unknown,
  path: string,
  validate: SchemaValidator
): ValidationResult | null => {
  if (schema.type !== 'object' || !isObject(value)) return null;
  if (schema.required) {
    for (const key of schema.required) {
      if (!(key in value)) {
        return {
          ok: false,
          message: MCP_VALIDATION_REQUIRED_MESSAGE(path, key),
          path: `${path}.${key}`,
          reason: 'required',
          details: { key }
        };
      }
    }
  }
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!(key in value)) continue;
      const nestedResult = validate(propSchema, value[key], `${path}.${key}`);
      if (!nestedResult.ok) return nestedResult;
    }
  }
  if (schema.additionalProperties === false && schema.properties) {
    for (const key of Object.keys(value)) {
      if (key in schema.properties) continue;
      return {
        ok: false,
        message: MCP_VALIDATION_NOT_ALLOWED_MESSAGE(path, key),
        path: `${path}.${key}`,
        reason: 'additionalProperties',
        details: { key }
      };
    }
  }
  return null;
};
