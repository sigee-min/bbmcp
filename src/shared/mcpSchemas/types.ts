export type JsonSchema = {
  type?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  description?: string;
  title?: string;
  examples?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  anyOf?: JsonSchema[];
  enum?: ReadonlyArray<string | number | boolean | null>;
  additionalProperties?: boolean;
  minProperties?: number;
  minItems?: number;
  maxItems?: number;
};
