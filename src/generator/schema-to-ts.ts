/**
 * JSON Schema to TypeScript type generator
 *
 * Converts JSON Schema definitions to TypeScript interfaces
 * for strongly-typed skill parameters.
 */

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: (string | number | boolean)[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
  description?: string;
  default?: unknown;
  format?: string;
  additionalProperties?: boolean | JsonSchema;
  nullable?: boolean;
}

/**
 * Convert a JSON Schema type to TypeScript type string
 */
function jsonTypeToTs(schema: JsonSchema, indent = 0): string {
  // Handle nullable
  const nullable = schema.nullable ? " | null" : "";

  // Handle type arrays (e.g., ["string", "null"])
  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((t) => t !== "null");
    const hasNull = schema.type.includes("null");
    const tsTypes = types.map((t) => primitiveToTs(t)).join(" | ");
    return hasNull ? `${tsTypes} | null` : tsTypes;
  }

  // Handle enums
  if (schema.enum) {
    return schema.enum.map((v) => JSON.stringify(v)).join(" | ") + nullable;
  }

  // Handle oneOf/anyOf
  if (schema.oneOf) {
    return schema.oneOf.map((s) => jsonTypeToTs(s, indent)).join(" | ") + nullable;
  }
  if (schema.anyOf) {
    return schema.anyOf.map((s) => jsonTypeToTs(s, indent)).join(" | ") + nullable;
  }

  // Handle allOf (intersection)
  if (schema.allOf) {
    return schema.allOf.map((s) => jsonTypeToTs(s, indent)).join(" & ") + nullable;
  }

  // Handle objects
  if (schema.type === "object" || schema.properties) {
    return objectToTs(schema, indent) + nullable;
  }

  // Handle arrays
  if (schema.type === "array") {
    if (schema.items) {
      return `(${jsonTypeToTs(schema.items, indent)})[]${nullable}`;
    }
    return `unknown[]${nullable}`;
  }

  // Handle primitives
  if (schema.type) {
    return primitiveToTs(schema.type as string) + nullable;
  }

  // Default to unknown
  return "unknown";
}

/**
 * Convert primitive JSON Schema type to TypeScript
 */
function primitiveToTs(type: string): string {
  switch (type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "object":
      return "Record<string, unknown>";
    case "array":
      return "unknown[]";
    default:
      return "unknown";
  }
}

/**
 * Convert JSON Schema object to TypeScript interface body
 */
function objectToTs(schema: JsonSchema, indent = 0): string {
  const props = schema.properties;
  if (!props || Object.keys(props).length === 0) {
    if (schema.additionalProperties === false) {
      return "Record<string, never>";
    }
    if (typeof schema.additionalProperties === "object") {
      return `Record<string, ${jsonTypeToTs(schema.additionalProperties, indent)}>`;
    }
    return "Record<string, unknown>";
  }

  const required = new Set(schema.required || []);
  const padding = "  ".repeat(indent + 1);
  const closePadding = "  ".repeat(indent);

  const lines = Object.entries(props).map(([key, propSchema]) => {
    const optional = required.has(key) ? "" : "?";
    const type = jsonTypeToTs(propSchema, indent + 1);
    const safeName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
    return `${padding}${safeName}${optional}: ${type};`;
  });

  return `{\n${lines.join("\n")}\n${closePadding}}`;
}

/**
 * Generate TypeScript interface from JSON Schema
 */
export function generateInterface(
  name: string,
  schema: JsonSchema,
  description?: string
): string {
  const props = schema.properties;
  if (!props || Object.keys(props).length === 0) {
    // Empty or no properties - use type alias
    const doc = description ? `/** ${description} */\n` : "";
    return `${doc}export type ${name} = Record<string, unknown>;`;
  }

  const required = new Set(schema.required || []);
  const lines: string[] = [];

  // Add description
  if (description) {
    lines.push(`/**`);
    lines.push(` * ${description}`);
    lines.push(` */`);
  }

  lines.push(`export interface ${name} {`);

  for (const [key, propSchema] of Object.entries(props)) {
    const optional = required.has(key) ? "" : "?";
    const type = jsonTypeToTs(propSchema, 1);
    const safeName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;

    // Add property description
    if (propSchema.description) {
      lines.push(`  /** ${propSchema.description} */`);
    }

    lines.push(`  ${safeName}${optional}: ${type};`);
  }

  lines.push(`}`);

  return lines.join("\n");
}

/**
 * Generate a TypeScript type from JSON Schema (inline)
 */
export function schemaToTsType(schema: JsonSchema): string {
  return jsonTypeToTs(schema, 0);
}

/**
 * Sanitize a string to be a valid TypeScript identifier
 */
export function toValidIdentifier(name: string): string {
  // Replace hyphens and special chars with underscores
  let identifier = name.replace(/[^a-zA-Z0-9_$]/g, "_");

  // Ensure it doesn't start with a number
  if (/^[0-9]/.test(identifier)) {
    identifier = "_" + identifier;
  }

  // Handle reserved words
  const reserved = new Set([
    "break", "case", "catch", "class", "const", "continue", "debugger",
    "default", "delete", "do", "else", "enum", "export", "extends", "false",
    "finally", "for", "function", "if", "import", "in", "instanceof", "new",
    "null", "return", "super", "switch", "this", "throw", "true", "try",
    "typeof", "var", "void", "while", "with", "yield", "let", "static",
    "implements", "interface", "package", "private", "protected", "public",
  ]);

  if (reserved.has(identifier)) {
    identifier = identifier + "_";
  }

  return identifier;
}

/**
 * Convert tool name to PascalCase for interface name
 */
export function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

/**
 * Convert tool name to camelCase for function name
 */
export function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
