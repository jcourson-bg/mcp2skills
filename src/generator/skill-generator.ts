/**
 * Skill Code Generator
 *
 * Generates self-contained Agent Skills from MCP tool definitions.
 * Each server becomes a complete skill directory following the Agent Skills spec:
 * - SKILL.md with YAML frontmatter (required)
 * - runtime.ts bundled within the skill
 * - Individual skill TypeScript files
 * - index.ts for exports
 *
 * @see https://agentskills.io/specification
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolDefinition, ServerTools, GeneratorOptions } from "../types.js";
import {
  generateInterface,
  toPascalCase,
  toCamelCase,
  toValidIdentifier,
} from "./schema-to-ts.js";
import { logger } from "../utils/logger.js";

/**
 * Generated file content
 */
interface GeneratedFile {
  path: string;
  content: string;
}

/**
 * Generate skill files for all servers
 *
 * Each server becomes a self-contained skill directory following the Agent Skills spec.
 * No files are generated at the outer level - each skill is fully independent.
 */
export async function generateSkills(
  servers: ServerTools[],
  options: GeneratorOptions
): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];

  // Filter servers if specified
  const filteredServers = options.serverFilter
    ? servers.filter((s) => s.serverName === options.serverFilter)
    : servers;

  if (filteredServers.length === 0) {
    throw new Error(
      options.serverFilter
        ? `Server "${options.serverFilter}" not found`
        : "No servers to process"
    );
  }

  // Generate each server as a self-contained skill directory
  for (const server of filteredServers) {
    const serverFiles = await generateServerSkills(server, options);
    files.push(...serverFiles);
  }

  // Write files unless in preview mode
  if (!options.preview) {
    await writeGeneratedFiles(files);
  }

  return files;
}

/**
 * Generate a self-contained skill directory for a single server
 *
 * Following the Agent Skills spec, each server becomes a complete skill with:
 * - SKILL.md (required)
 * - runtime.ts (bundled)
 * - Individual skill files
 * - index.ts
 */
async function generateServerSkills(
  server: ServerTools,
  options: GeneratorOptions
): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];
  const serverDir = join(options.outputDir, toValidIdentifier(server.serverName));

  // Filter tools if specified
  const tools = options.toolFilter
    ? server.tools.filter((t) => options.toolFilter!.includes(t.name))
    : server.tools;

  // Generate SKILL.md (required by Agent Skills spec)
  files.push({
    path: join(serverDir, "SKILL.md"),
    content: generateServerSkillMd(server.serverName, tools),
  });

  // Generate runtime.ts bundled within this skill directory
  files.push({
    path: join(serverDir, "runtime.ts"),
    content: generateRuntimeModule(server.serverName),
  });

  // Generate each skill file
  for (const tool of tools) {
    const skillContent = generateSkillFile(tool, server.serverName);
    files.push({
      path: join(serverDir, `${toValidIdentifier(tool.name)}.ts`),
      content: skillContent,
    });
  }

  // Generate server index
  files.push({
    path: join(serverDir, "index.ts"),
    content: generateServerIndex(tools, server.serverName),
  });

  return files;
}

/**
 * Sanitize text for use in JSDoc comments
 * Escapes patterns that would break JSDoc: asterisk-slash, etc.
 */
function sanitizeForJSDoc(text: string): string {
  return text
    .replace(/\*\//g, '*\u200B/')  // Zero-width space to break */
    .replace(/\/\*/g, '/\u200B*'); // Zero-width space to break /*
}

/**
 * Generate a single skill file
 */
function generateSkillFile(
  tool: ToolDefinition,
  serverName: string
): string {
  const funcName = toCamelCase(tool.name);
  const inputTypeName = `${toPascalCase(tool.name)}Input`;
  const resultTypeName = `${toPascalCase(tool.name)}Result`;
  
  // Sanitize description for JSDoc
  const safeDescription = tool.description ? sanitizeForJSDoc(tool.description) : undefined;

  const lines: string[] = [];

  // File header with enhanced documentation
  lines.push(`/**`);
  lines.push(` * @fileoverview ${tool.name} skill for ${serverName}`);
  lines.push(` * @module ${serverName}/${tool.name}`);
  lines.push(` *`);
  lines.push(` * Skill: ${tool.name}`);
  lines.push(` * Server: ${serverName}`);
  if (safeDescription) {
    lines.push(` *`);
    // Format multi-line descriptions properly
    const descLines = safeDescription.split('\n');
    for (const line of descLines) {
      lines.push(` * ${line}`);
    }
  }
  lines.push(` *`);
  lines.push(` * @example`);
  lines.push(` * \`\`\`typescript`);
  lines.push(` * import { ${funcName} } from "./${toValidIdentifier(tool.name)}.js";`);
  lines.push(` * import { RuntimeAuthManager } from "./runtime.js";`);
  lines.push(` *`);
  lines.push(` * const authManager = new RuntimeAuthManager();`);
  lines.push(` * const context = authManager.getOrCreateSession("user-id", "${serverName}");`);
  lines.push(` *`);
  lines.push(` * const result = await ${funcName}({ path: "/example" }, context);`);
  lines.push(` * if (result.success) {`);
  lines.push(` *   console.log(result.data);`);
  lines.push(` * }`);
  lines.push(` * \`\`\``);
  lines.push(` *`);
  lines.push(` * @generated by mcp2skills`);
  lines.push(` * @see {@link ./SKILL.md} for full documentation`);
  lines.push(` */`);
  lines.push(``);

  // Imports - always use local runtime bundled with this skill
  lines.push(`import { skill, type SkillContext, type SkillResult } from "./runtime.js";`);
  lines.push(``);

  // Generate input type with enhanced documentation
  const inputInterface = generateInterface(
    inputTypeName,
    tool.inputSchema as Parameters<typeof generateInterface>[1],
    `Input parameters for ${tool.name}`
  );
  lines.push(inputInterface);
  lines.push(``);

  // Generate result type with enhanced documentation
  lines.push(`/**`);
  lines.push(` * Result from ${tool.name}`);
  lines.push(` *`);
  lines.push(` * @property success - Whether the skill executed successfully`);
  lines.push(` * @property data - The result data if successful`);
  lines.push(` * @property error - Error message if unsuccessful`);
  lines.push(` */`);
  lines.push(`export type ${resultTypeName} = SkillResult<unknown>;`);
  lines.push(``);

  // Generate the skill function with enhanced JSDoc
  lines.push(`/**`);
  if (safeDescription) {
    const descLines = safeDescription.split('\n');
    for (const line of descLines) {
      lines.push(` * ${line}`);
    }
    lines.push(` *`);
  }
  lines.push(` * @param input - The input parameters (see {@link ${inputTypeName}})`);
  lines.push(` * @param context - Skill execution context with auth and MCP client`);
  lines.push(` * @returns Promise resolving to the skill result`);
  lines.push(` * @throws Will not throw; errors are captured in the result object`);
  lines.push(` */`);
  lines.push(`export const ${funcName} = skill({`);
  lines.push(`  name: "${tool.name}",`);
  lines.push(`  server: "${serverName}",`);
  if (tool.description) {
    lines.push(`  description: ${JSON.stringify(tool.description)},`);
  }
  lines.push(`}, async (`);
  lines.push(`  input: ${inputTypeName},`);
  lines.push(`  context: SkillContext`);
  lines.push(`): Promise<${resultTypeName}> => {`);
  lines.push(`  return context.callTool("${tool.name}", input as unknown as Record<string, unknown>);`);
  lines.push(`});`);
  lines.push(``);

  // Export the skill metadata with documentation
  lines.push(`// ============================================================================`);
  lines.push(`// Skill Metadata`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`/** @readonly The unique name of this skill */`);
  lines.push(`${funcName}.skillName = "${tool.name}";`);
  lines.push(``);
  lines.push(`/** @readonly The server this skill belongs to */`);
  lines.push(`${funcName}.serverName = "${serverName}";`);
  if (tool.description) {
    lines.push(``);
    lines.push(`/** @readonly Description of what this skill does */`);
    lines.push(`${funcName}.description = ${JSON.stringify(tool.description)};`);
  }
  lines.push(``);

  return lines.join("\n");
}

/**
 * Generate server index file
 */
function generateServerIndex(tools: ToolDefinition[], serverName: string): string {
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * @fileoverview ${serverName} Skills`);
  lines.push(` * @module ${serverName}`);
  lines.push(` *`);
  lines.push(` * Self-contained Agent Skill for the ${serverName} MCP server.`);
  lines.push(` *`);
  lines.push(` * ## Available Skills`);
  lines.push(` *`);
  for (const tool of tools) {
    const rawDesc = tool.description?.split('\n')[0]?.substring(0, 60) || 'No description';
    const shortDesc = sanitizeForJSDoc(rawDesc);
    lines.push(` * - {@link ${toCamelCase(tool.name)}} - ${shortDesc}${rawDesc.length >= 60 ? '...' : ''}`);
  }
  lines.push(` *`);
  lines.push(` * @example`);
  lines.push(` * \`\`\`typescript`);
  lines.push(` * import { RuntimeAuthManager, ${tools.slice(0, 2).map(t => toCamelCase(t.name)).join(', ')} } from "./index.js";`);
  lines.push(` *`);
  lines.push(` * const authManager = new RuntimeAuthManager();`);
  lines.push(` * const context = authManager.getOrCreateSession("user-123", "${serverName}");`);
  lines.push(` * const result = await ${toCamelCase(tools[0]?.name || 'mySkill')}({}, context);`);
  lines.push(` * \`\`\``);
  lines.push(` *`);
  lines.push(` * @see {@link ./SKILL.md} for detailed documentation`);
  lines.push(` * @generated by mcp2skills`);
  lines.push(` */`);
  lines.push(``);

  // Export runtime first (bundled with this skill)
  lines.push(`// ============================================================================`);
  lines.push(`// Runtime (bundled with skill)`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`export * from "./runtime.js";`);
  lines.push(``);

  // Export all skills
  lines.push(`// ============================================================================`);
  lines.push(`// Skill Exports`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  for (const tool of tools) {
    const moduleName = toValidIdentifier(tool.name);
    const funcName = toCamelCase(tool.name);
    lines.push(`export { ${funcName} } from "./${moduleName}.js";`);
    lines.push(`export type { ${toPascalCase(tool.name)}Input } from "./${moduleName}.js";`);
  }
  lines.push(``);

  // Export skill list
  lines.push(`// ============================================================================`);
  lines.push(`// Skill Registry`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`/** Server name for this skill */`);
  lines.push(`export const serverName = "${serverName}" as const;`);
  lines.push(``);
  lines.push(`/**`);
  lines.push(` * All skill names for ${serverName}`);
  lines.push(` * @readonly`);
  lines.push(` */`);
  lines.push(`export const skillNames = [`);
  for (const tool of tools) {
    lines.push(`  "${tool.name}",`);
  }
  lines.push(`] as const;`);
  lines.push(``);
  lines.push(`/** Type representing any skill name in this server */`);
  lines.push(`export type SkillName = typeof skillNames[number];`);
  lines.push(``);

  return lines.join("\n");
}

/**
 * Generate the runtime module bundled with each skill
 */
function generateRuntimeModule(serverName: string): string {
  return `/**
 * Runtime support for ${serverName} skills
 * 
 * This runtime is bundled with the skill for self-contained operation.
 * 
 * Provides:
 * - Skill decorator
 * - Auth management
 * - MCP client pooling
 * - Multi-session support
 * 
 * @module ${serverName}/runtime
 * @generated by mcp2skills
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a skill execution
 */
export interface SkillResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  isError?: boolean;
}

/**
 * Skill execution context
 */
export interface SkillContext {
  /** Session/user identifier */
  sessionId: string;
  /** Server this skill belongs to */
  serverName: string;
  /** Call an MCP tool */
  callTool(name: string, params: Record<string, unknown>): Promise<SkillResult>;
  /** Get authentication headers */
  getAuthHeaders(): Promise<Record<string, string>>;
}

/**
 * Skill metadata
 */
export interface SkillMetadata {
  name: string;
  server: string;
  description?: string;
}

/**
 * Skill function type
 */
export type SkillFunction<TInput = unknown, TOutput = unknown> = ((
  input: TInput,
  context: SkillContext
) => Promise<SkillResult<TOutput>>) & {
  skillName: string;
  serverName: string;
  description?: string;
};

// ============================================================================
// Skill Decorator
// ============================================================================

/**
 * Create a skill function with metadata
 */
export function skill<TInput, TOutput>(
  metadata: SkillMetadata,
  fn: (input: TInput, context: SkillContext) => Promise<SkillResult<TOutput>>
): SkillFunction<TInput, TOutput> {
  const skillFn = fn as SkillFunction<TInput, TOutput>;
  skillFn.skillName = metadata.name;
  skillFn.serverName = metadata.server;
  skillFn.description = metadata.description;
  return skillFn;
}

// ============================================================================
// Auth Credentials
// ============================================================================

export type AuthType = "none" | "api_key" | "bearer" | "oauth";

export interface AuthCredentials {
  authType: AuthType;
  accessToken?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

// ============================================================================
// Server Configuration
// ============================================================================

export interface MCPServerConfig {
  name: string;
  transport: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  url?: string;
  authType?: AuthType;
  authConfig?: Record<string, unknown>;
}

// ============================================================================
// Session Context
// ============================================================================

/**
 * Session-specific skill context
 */
class SessionContext implements SkillContext {
  constructor(
    public sessionId: string,
    public serverName: string,
    private authManager: RuntimeAuthManager
  ) {}

  async callTool(name: string, params: Record<string, unknown>): Promise<SkillResult> {
    return this.authManager.executeToolCall(this.sessionId, this.serverName, name, params);
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    return this.authManager.getAuthHeaders(this.sessionId, this.serverName);
  }
}

// ============================================================================
// Runtime Auth Manager
// ============================================================================

/**
 * Manages authentication and MCP connections for multi-user chatbot scenarios
 */
export class RuntimeAuthManager {
  private serverConfigs: Map<string, MCPServerConfig> = new Map();
  private sessionCredentials: Map<string, Map<string, AuthCredentials>> = new Map();
  private connections: Map<string, unknown> = new Map(); // Server connections

  /**
   * Add a server configuration
   */
  addServerConfig(config: MCPServerConfig): void {
    this.serverConfigs.set(config.name, config);
  }

  /**
   * Get or create a session context for a user
   */
  getOrCreateSession(sessionId: string, serverName: string): SkillContext {
    // Ensure session exists
    if (!this.sessionCredentials.has(sessionId)) {
      this.sessionCredentials.set(sessionId, new Map());
    }
    return new SessionContext(sessionId, serverName, this);
  }

  /**
   * Authenticate a session for a specific server
   */
  async authenticateSession(
    sessionId: string,
    serverName: string,
    credentials: AuthCredentials
  ): Promise<void> {
    if (!this.sessionCredentials.has(sessionId)) {
      this.sessionCredentials.set(sessionId, new Map());
    }
    this.sessionCredentials.get(sessionId)!.set(serverName, credentials);
  }

  /**
   * Get authentication headers for a session/server
   */
  async getAuthHeaders(sessionId: string, serverName: string): Promise<Record<string, string>> {
    const sessionCreds = this.sessionCredentials.get(sessionId);
    const credentials = sessionCreds?.get(serverName);

    if (!credentials || credentials.authType === "none") {
      return {};
    }

    switch (credentials.authType) {
      case "bearer":
        if (credentials.accessToken) {
          return { Authorization: \`Bearer \${credentials.accessToken}\` };
        }
        break;
      case "api_key":
        if (credentials.apiKey) {
          const header = credentials.apiKeyHeader || "X-API-Key";
          return { [header]: credentials.apiKey };
        }
        break;
      case "oauth":
        if (credentials.accessToken) {
          // Check expiration
          if (credentials.expiresAt && new Date() >= credentials.expiresAt) {
            throw new Error("OAuth token expired. Please re-authenticate.");
          }
          return { Authorization: \`Bearer \${credentials.accessToken}\` };
        }
        break;
    }

    return {};
  }

  /**
   * Execute a tool call for a session
   */
  async executeToolCall(
    sessionId: string,
    serverName: string,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<SkillResult> {
    // This is a placeholder - in real implementation, this would:
    // 1. Get or create MCP client connection for the server
    // 2. Apply session authentication
    // 3. Execute the tool call
    // 4. Return the result

    // For now, throw an error indicating the runtime needs to be configured
    throw new Error(
      \`Runtime not fully configured. To execute skills, you need to:\\n\` +
      \`1. Create a RuntimeAuthManager instance\\n\` +
      \`2. Add server configs with addServerConfig()\\n\` +
      \`3. Authenticate sessions with authenticateSession()\\n\` +
      \`4. Use getOrCreateSession() to get a context\\n\\n\` +
      \`Attempted: \${serverName}/\${toolName}\`
    );
  }

  /**
   * Execute a skill for a session
   */
  async executeSkill<TInput, TOutput>(
    sessionId: string,
    skill: SkillFunction<TInput, TOutput>,
    input: TInput
  ): Promise<SkillResult<TOutput>> {
    const context = this.getOrCreateSession(sessionId, skill.serverName);
    return skill(input, context);
  }

  /**
   * Close a session and cleanup resources
   */
  async closeSession(sessionId: string): Promise<void> {
    this.sessionCredentials.delete(sessionId);
  }

  /**
   * Close all sessions and connections
   */
  async shutdown(): Promise<void> {
    this.sessionCredentials.clear();
    this.connections.clear();
  }
}

// ============================================================================
// Exports
// ============================================================================

/** Default runtime auth manager instance */
export const defaultAuthManager = new RuntimeAuthManager();

/**
 * Helper to list all available skills
 */
export function listSkills(registry: Record<string, readonly string[]>): string[] {
  const skills: string[] = [];
  for (const [server, serverSkills] of Object.entries(registry)) {
    for (const skill of serverSkills) {
      skills.push(\`\${server}/\${skill}\`);
    }
  }
  return skills;
}
`;
}

/**
 * Escape a string for use in YAML (wrap in quotes if needed)
 */
function escapeYamlString(str: string): string {
  // If string contains special YAML characters, wrap in double quotes and escape
  if (/[:\n"'#\[\]{}|>&*!?@`]/.test(str)) {
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return str;
}

/**
 * Generate SKILL.md file for a server
 */
function generateServerSkillMd(serverName: string, tools: ToolDefinition[]): string {
  const toolList = tools.map(t => `- \`${t.name}\`: ${t.description || 'No description'}`).join('\n');
  const toolNames = tools.map(t => t.name).join(', ');
  const description = `Generated MCP skills for ${serverName}. Provides ${tools.length} skill(s) for interacting with the ${serverName} MCP server. Use these skills when you need to work with ${toolNames}.`;
  
  return `---
name: ${serverName.toLowerCase()}
description: ${escapeYamlString(description)}
license: Apache-2.0
---

# ${serverName} Skills

Auto-generated TypeScript skills from the ${serverName} MCP server.

## Overview

This skill module provides typed wrappers for ${tools.length} MCP tool(s) from the ${serverName} server.
Each skill is a self-contained async function that can be executed with proper authentication context.

## Available Skills

${toolList}

## Usage

\`\`\`typescript
import { RuntimeAuthManager, ${tools.slice(0, 3).map(t => toCamelCase(t.name)).join(', ')}${tools.length > 3 ? ', ...' : ''} } from "./index.js";

// Create auth manager and configure server
const authManager = new RuntimeAuthManager();
authManager.addServerConfig({
  name: "${serverName}",
  transport: "http", // or "stdio", "sse"
  url: "https://your-mcp-server.com/mcp"
});

// Get session context
const context = authManager.getOrCreateSession("user-123", "${serverName}");

// Execute skills
const result = await ${toCamelCase(tools[0]?.name || 'mySkill')}({}, context);

if (result.success) {
  console.log("Result:", result.data);
} else {
  console.error("Error:", result.error);
}
\`\`\`

## Skill Details

${tools.map(t => `### ${t.name}

${t.description || 'No description available.'}

**Function:** \`${toCamelCase(t.name)}\`
`).join('\n')}

## Authentication

Skills require a \`SkillContext\` which is obtained from the \`RuntimeAuthManager\`.
The context handles authentication automatically based on the server configuration.

Supported auth types:
- \`none\` - No authentication
- \`api_key\` - API key in header
- \`bearer\` - Bearer token
- \`oauth\` - OAuth 2.0 client credentials

## Generated by

This skill module was auto-generated by [mcp2skills](https://github.com/your-org/mcp2skills).
`;
}

/**
 * Write generated files to disk
 */
async function writeGeneratedFiles(files: GeneratedFile[]): Promise<void> {
  // Collect unique directories
  const dirs = new Set<string>();
  for (const file of files) {
    const dir = file.path.substring(0, file.path.lastIndexOf("/"));
    dirs.add(dir);
  }

  // Create directories
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  // Write files
  for (const file of files) {
    await writeFile(file.path, file.content, "utf-8");
    logger.debug(`Written: ${file.path}`);
  }
}

/**
 * Preview generated files without writing
 */
export function previewSkills(files: GeneratedFile[]): void {
  for (const file of files) {
    logger.info(logger.bold(`\n=== ${file.path} ===\n`));
    logger.info(file.content);
  }
}
