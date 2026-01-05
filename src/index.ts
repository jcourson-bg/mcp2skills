/**
 * MCP to Skills - Convert MCP servers into reusable chatbot skills
 *
 * This package provides:
 * - MCP client with multiple transport support (stdio, SSE, HTTP)
 * - Authentication providers (API Key, Bearer, OAuth)
 * - Skill code generator for TypeScript
 * - Runtime support for skill execution in chatbots
 *
 * @example CLI Usage
 * ```bash
 * # Initialize configuration
 * mcp2skills init
 *
 * # Test connection to a server
 * mcp2skills connect "npx" --args "-y,@modelcontextprotocol/server-filesystem,/tmp"
 *
 * # List available tools
 * mcp2skills list-tools -c mcp-servers.json
 *
 * # Generate skills
 * mcp2skills generate mcp-servers.json -o generated_skills
 * ```
 *
 * @example Programmatic Usage
 * ```typescript
 * import { createMCPClient, loadConfig } from "mcp2skills";
 * import { generateSkills } from "mcp2skills/generator";
 *
 * // Load configuration
 * const config = await loadConfig("mcp-servers.json");
 *
 * // Connect to a server
 * const client = createMCPClient("filesystem", config.mcpServers.filesystem);
 * await client.connect();
 *
 * // List tools
 * const tools = await client.listTools();
 * console.log(tools);
 *
 * // Disconnect
 * await client.disconnect();
 * ```
 */

// Client exports
export {
  MCPClient,
  createMCPClient,
  connectStdio,
  type ConnectionState,
} from "./client/mcp-client.js";

export { loadConfig, validateConfig } from "./client/config.js";

export {
  createAuthProvider,
  NoAuthProvider,
  ApiKeyAuthProvider,
  BearerAuthProvider,
  OAuthAuthProvider,
  type AuthProvider,
} from "./client/auth.js";

// Generator exports
export { generateSkills, previewSkills } from "./generator/skill-generator.js";

export {
  generateInterface,
  schemaToTsType,
  toValidIdentifier,
  toPascalCase,
  toCamelCase,
} from "./generator/schema-to-ts.js";

// Type exports
export type {
  // Auth types
  AuthType,
  ApiKeyAuthConfig,
  BearerAuthConfig,
  OAuthAuthConfig,
  AuthConfig,
  // Transport types
  TransportType,
  StdioTransportConfig,
  SseTransportConfig,
  HttpTransportConfig,
  // Server types
  MCPServerConfig,
  MCPServersConfig,
  // Tool types
  ToolParameter,
  ToolDefinition,
  ServerTools,
  // Generator types
  GeneratorOptions,
  // Runtime types
  SkillContext,
  ToolCallResult,
  AuthCredentials,
} from "./types.js";

// Zod schemas for validation
export {
  AuthTypeSchema,
  ApiKeyAuthConfigSchema,
  BearerAuthConfigSchema,
  OAuthAuthConfigSchema,
  AuthConfigSchema,
  TransportTypeSchema,
  StdioTransportConfigSchema,
  SseTransportConfigSchema,
  HttpTransportConfigSchema,
  MCPServerConfigSchema,
  MCPServersConfigSchema,
  ToolDefinitionSchema,
} from "./types.js";
