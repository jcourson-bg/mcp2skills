/**
 * Core types for MCP to Skills CLI tool
 *
 * These types define the configuration, tool definitions, and authentication
 * structures used throughout the tool.
 */

import { z } from "zod";

// ============================================================================
// Authentication Configuration
// ============================================================================

/**
 * Supported authentication types for MCP servers
 */
export const AuthTypeSchema = z.enum(["none", "api_key", "bearer", "oauth"]);
export type AuthType = z.infer<typeof AuthTypeSchema>;

/**
 * API Key authentication configuration
 */
export const ApiKeyAuthConfigSchema = z.object({
  /** The API key value (or use env_var) */
  api_key: z.string().optional(),
  /** Environment variable name containing the API key */
  env_var: z.string().optional(),
  /** Header name for the API key (default: X-API-Key) */
  header_name: z.string().default("X-API-Key"),
  /** Prefix for the header value (e.g., "Api-Key ") */
  header_prefix: z.string().default(""),
});
export type ApiKeyAuthConfig = z.infer<typeof ApiKeyAuthConfigSchema>;

/**
 * Bearer token authentication configuration
 */
export const BearerAuthConfigSchema = z.object({
  /** The bearer token (or use env_var) */
  token: z.string().optional(),
  /** Environment variable name containing the token */
  env_var: z.string().optional(),
});
export type BearerAuthConfig = z.infer<typeof BearerAuthConfigSchema>;

/**
 * OAuth 2.0 authentication configuration
 */
export const OAuthAuthConfigSchema = z.object({
  /** OAuth client ID */
  client_id: z.string(),
  /** OAuth client secret */
  client_secret: z.string().optional(),
  /** Token endpoint URL */
  token_url: z.string(),
  /** Authorization endpoint URL (for authorization code flow) */
  authorization_url: z.string().optional(),
  /** Requested scopes */
  scopes: z.array(z.string()).default([]),
  /** OAuth flow type */
  flow: z.enum(["client_credentials", "authorization_code"]).default("client_credentials"),
});
export type OAuthAuthConfig = z.infer<typeof OAuthAuthConfigSchema>;

/**
 * Union of all auth config types
 */
export const AuthConfigSchema = z.union([
  ApiKeyAuthConfigSchema,
  BearerAuthConfigSchema,
  OAuthAuthConfigSchema,
  z.object({}), // No auth
]);
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

// ============================================================================
// Transport Configuration
// ============================================================================

/**
 * Supported transport types
 */
export const TransportTypeSchema = z.enum(["stdio", "sse", "http"]);
export type TransportType = z.infer<typeof TransportTypeSchema>;

/**
 * Stdio transport configuration
 */
export const StdioTransportConfigSchema = z.object({
  transport: z.literal("stdio"),
  /** Command to execute */
  command: z.string(),
  /** Arguments for the command */
  args: z.array(z.string()).default([]),
  /** Environment variables */
  env: z.record(z.string()).optional(),
  /** Working directory */
  cwd: z.string().optional(),
});
export type StdioTransportConfig = z.infer<typeof StdioTransportConfigSchema>;

/**
 * SSE transport configuration (legacy)
 */
export const SseTransportConfigSchema = z.object({
  transport: z.literal("sse"),
  /** Server URL */
  url: z.string().url(),
  /** Authentication type */
  auth_type: AuthTypeSchema.optional(),
  /** Authentication configuration */
  auth_config: AuthConfigSchema.optional(),
});
export type SseTransportConfig = z.infer<typeof SseTransportConfigSchema>;

/**
 * HTTP transport configuration (streamable HTTP)
 */
export const HttpTransportConfigSchema = z.object({
  transport: z.literal("http"),
  /** Server URL */
  url: z.string().url(),
  /** Authentication type */
  auth_type: AuthTypeSchema.optional(),
  /** Authentication configuration */
  auth_config: AuthConfigSchema.optional(),
});
export type HttpTransportConfig = z.infer<typeof HttpTransportConfigSchema>;

// ============================================================================
// MCP Server Configuration
// ============================================================================

/**
 * Complete MCP server configuration
 */
export const MCPServerConfigSchema = z.discriminatedUnion("transport", [
  StdioTransportConfigSchema,
  SseTransportConfigSchema,
  HttpTransportConfigSchema,
]);
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

/**
 * Named server configuration (with server name as key)
 */
export const MCPServersConfigSchema = z.object({
  mcpServers: z.record(z.string(), MCPServerConfigSchema),
});
export type MCPServersConfig = z.infer<typeof MCPServersConfigSchema>;

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * JSON Schema type for tool parameters
 */
export const JsonSchemaPropertySchema: z.ZodType<Record<string, unknown>> = z.record(z.unknown());

/**
 * Tool parameter definition from MCP
 */
export const ToolParameterSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  required: z.boolean().default(false),
  schema: JsonSchemaPropertySchema,
});
export type ToolParameter = z.infer<typeof ToolParameterSchema>;

/**
 * Complete tool definition from MCP
 */
export const ToolDefinitionSchema = z.object({
  /** Tool name */
  name: z.string(),
  /** Tool description */
  description: z.string().optional(),
  /** Input schema (JSON Schema) */
  inputSchema: z.object({
    type: z.literal("object").optional(),
    properties: z.record(z.unknown()).optional(),
    required: z.array(z.string()).optional(),
    additionalProperties: z.boolean().optional(),
  }).passthrough(),
  /** Output schema (JSON Schema) - optional */
  outputSchema: z.record(z.unknown()).optional(),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

/**
 * Server tools collection
 */
export interface ServerTools {
  serverName: string;
  serverConfig: MCPServerConfig;
  tools: ToolDefinition[];
}

// ============================================================================
// Skill Generation Options
// ============================================================================

/**
 * Options for skill code generation
 */
export interface GeneratorOptions {
  /** Output directory for generated skills */
  outputDir: string;
  /** Only generate for specific server */
  serverFilter?: string;
  /** Only generate for specific tools */
  toolFilter?: string[];
  /** Generate with inline runtime (no external dependencies) */
  inlineRuntime: boolean;
  /** Generate TypeScript (true) or JavaScript (false) */
  typescript: boolean;
  /** Add JSDoc comments */
  includeJsdoc: boolean;
  /** Preview mode (don't write files) */
  preview: boolean;
}

// ============================================================================
// Runtime Types (for generated skills)
// ============================================================================

/**
 * Skill execution context
 */
export interface SkillContext {
  /** User/session ID for multi-user scenarios */
  sessionId: string;
  /** Server name this skill belongs to */
  serverName: string;
  /** Get authentication headers for requests */
  getAuthHeaders(): Promise<Record<string, string>>;
  /** Execute an MCP tool call */
  callTool(toolName: string, params: Record<string, unknown>): Promise<ToolCallResult>;
}

/**
 * Result of a tool call
 */
export interface ToolCallResult {
  success: boolean;
  content: unknown;
  error?: string;
  isError?: boolean;
}

/**
 * Credentials for runtime authentication
 */
export interface AuthCredentials {
  authType: AuthType;
  accessToken?: string;
  apiKey?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

// ============================================================================
// CLI Types
// ============================================================================

/**
 * CLI global options
 */
export interface GlobalOptions {
  verbose: boolean;
  quiet: boolean;
  config?: string;
}

/**
 * Connect command options
 */
export interface ConnectOptions extends GlobalOptions {
  args?: string;
  env?: string[];
}

/**
 * List tools command options
 */
export interface ListToolsOptions extends GlobalOptions {
  format: "table" | "json" | "tree";
  server?: string;
}

/**
 * Generate command options
 */
export interface GenerateOptions extends GlobalOptions {
  output: string;
  server?: string;
  tools?: string[];
  preview: boolean;
  typescript: boolean;
  inlineRuntime: boolean;
}

/**
 * Inspect command options
 */
export interface InspectOptions extends GlobalOptions {
  server?: string;
}
