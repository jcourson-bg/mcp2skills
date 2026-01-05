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
import type { ToolDefinition, ServerTools, GeneratorOptions, MCPServerConfig } from "../types.js";
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
 * - config.json (server connection details)
 * - runtime.ts (functional MCP client)
 * - run.ts (CLI for LLMs to execute)
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

  // Generate config.json with server connection details
  files.push({
    path: join(serverDir, "config.json"),
    content: generateConfigJson(server),
  });

  // Generate runtime.ts with functional MCP client
  files.push({
    path: join(serverDir, "runtime.ts"),
    content: generateRuntimeModule(server.serverName, server.serverConfig),
  });

  // Generate run.ts CLI for LLMs to execute tools directly
  files.push({
    path: join(serverDir, "run.ts"),
    content: generateRunScript(server.serverName, tools),
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
 * Generate config.json with server connection details
 */
function generateConfigJson(server: ServerTools): string {
  // Cast to record for flexible property access
  const config = server.serverConfig as Record<string, unknown>;
  
  // Determine auth env var name
  const serverEnvPrefix = server.serverName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  let authEnvVar = `${serverEnvPrefix}_ACCESS_TOKEN`;
  
  const authConfig = config.auth_config as Record<string, unknown> | undefined;
  if (authConfig && typeof authConfig.env_var === 'string') {
    authEnvVar = authConfig.env_var;
  }
  
  const configObj: Record<string, unknown> = {
    serverName: server.serverName,
    transport: config.transport || 'sse',
    authType: config.auth_type || 'none',
    authEnvVar: authEnvVar,
  };
  
  // Add transport-specific config
  if (config.url) {
    configObj.url = config.url;
  }
  if (config.command) {
    configObj.command = config.command;
    configObj.args = (config.args as string[]) || [];
  }
  
  return JSON.stringify(configObj, null, 2);
}

/**
 * Generate run.ts CLI script for LLMs to execute tools directly
 */
function generateRunScript(serverName: string, tools: ToolDefinition[]): string {
  const toolNames = tools.map(t => t.name);
  
  return `#!/usr/bin/env bun
/**
 * CLI runner for ${serverName} skills
 * 
 * Usage:
 *   bun run.ts <tool-name> '<json-args>'
 * 
 * Examples:
 *   bun run.ts ${toolNames[0] || 'my-tool'} '{}'
 *   bun run.ts ${toolNames[0] || 'my-tool'} '{"param": "value"}'
 * 
 * Environment:
 *   Set the auth token in the environment variable specified in config.json
 * 
 * @generated by mcp2skills
 */

import { callTool } from "./runtime.js";

const AVAILABLE_TOOLS = ${JSON.stringify(toolNames, null, 2)};

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log("Usage: bun run.ts <tool-name> [json-args]");
    console.log("\\nAvailable tools:");
    AVAILABLE_TOOLS.forEach(t => console.log("  - " + t));
    process.exit(1);
  }
  
  const toolName = args[0];
  const toolArgs = args[1] ? JSON.parse(args[1]) : {};
  
  if (!AVAILABLE_TOOLS.includes(toolName)) {
    console.error("Unknown tool: " + toolName);
    console.log("\\nAvailable tools:");
    AVAILABLE_TOOLS.forEach(t => console.log("  - " + t));
    process.exit(1);
  }
  
  try {
    console.log("Calling " + toolName + "...");
    const result = await callTool(toolName, toolArgs);
    
    if (result.success) {
      console.log("\\n✅ Success:");
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.error("\\n❌ Error:", result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("\\n❌ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
`;
}

/**
 * Generate the runtime module with functional MCP client
 */
function generateRuntimeModule(serverName: string, serverConfig: MCPServerConfig): string {
  // Cast to record for flexible property access
  const config = serverConfig as Record<string, unknown>;
  
  // Determine auth env var name
  const serverEnvPrefix = serverName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  let authEnvVar = `${serverEnvPrefix}_ACCESS_TOKEN`;
  
  const authConfig = config.auth_config as Record<string, unknown> | undefined;
  if (authConfig && typeof authConfig.env_var === 'string') {
    authEnvVar = authConfig.env_var;
  }
  
  // Get URL for SSE/HTTP transports
  const serverUrl = (config.url as string) || '';
  const authType = (config.auth_type as string) || 'none';
  
  return `/**
 * Runtime for ${serverName} skills
 * 
 * This is a functional MCP client that connects to the server and executes tools.
 * 
 * Configuration:
 * - Server URL: ${serverUrl || '(stdio transport)'}
 * - Auth Type: ${authType}
 * - Auth Env Var: ${authEnvVar}
 * 
 * @module ${serverName}/runtime
 * @generated by mcp2skills
 */

import config from "./config.json";

// ============================================================================
// Types
// ============================================================================

export interface SkillResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SkillContext {
  sessionId: string;
  serverName: string;
  callTool(name: string, params: Record<string, unknown>): Promise<SkillResult>;
  getAuthHeaders(): Promise<Record<string, string>>;
}

export interface SkillMetadata {
  name: string;
  server: string;
  description?: string;
}

export type SkillFunction<TInput = unknown, TOutput = unknown> = ((
  input: TInput,
  context: SkillContext
) => Promise<SkillResult<TOutput>>) & {
  skillName: string;
  serverName: string;
  description?: string;
};

// ============================================================================
// Configuration
// ============================================================================

const SERVER_NAME = "${serverName}";
const SERVER_URL = config.url || "${serverUrl}";
const AUTH_TYPE = config.authType || "${authType}";
const AUTH_ENV_VAR = config.authEnvVar || "${authEnvVar}";

// ============================================================================
// Auth
// ============================================================================

function getAuthToken(): string | undefined {
  return process.env[AUTH_ENV_VAR];
}

function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return {};
  
  switch (AUTH_TYPE) {
    case "bearer":
    case "oauth":
      return { "Authorization": \`Bearer \${token}\` };
    case "api_key":
      return { "X-API-Key": token };
    default:
      return {};
  }
}

// ============================================================================
// MCP Client (SSE Transport)
// ============================================================================

let messageId = 1;
let sessionUrl: string | null = null;

async function initSession(): Promise<string> {
  if (sessionUrl) return sessionUrl;
  
  const headers = getAuthHeaders();
  
  // For SSE, we first need to establish a connection and get the session endpoint
  const response = await fetch(SERVER_URL, {
    method: "GET",
    headers: {
      ...headers,
      "Accept": "text/event-stream",
    },
  });
  
  if (!response.ok) {
    throw new Error(\`Failed to connect: \${response.status} \${response.statusText}\`);
  }
  
  // Read the SSE stream to get the endpoint event
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  
  const decoder = new TextDecoder();
  let buffer = "";
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\\n");
    buffer = lines.pop() || "";
    
    for (const line of lines) {
      if (line.startsWith("event: endpoint")) {
        // Next line should have the data
        continue;
      }
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data.startsWith("/")) {
          // This is the message endpoint path
          const baseUrl = new URL(SERVER_URL);
          sessionUrl = \`\${baseUrl.origin}\${data}\`;
          reader.cancel();
          return sessionUrl;
        }
      }
    }
  }
  
  throw new Error("Failed to get session endpoint from SSE");
}

async function sendJsonRpc(method: string, params: Record<string, unknown>): Promise<unknown> {
  const endpoint = await initSession();
  const headers = getAuthHeaders();
  
  const request = {
    jsonrpc: "2.0",
    id: messageId++,
    method,
    params,
  };
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(\`MCP request failed: \${response.status} \${text}\`);
  }
  
  const result = await response.json();
  
  if (result.error) {
    throw new Error(result.error.message || JSON.stringify(result.error));
  }
  
  return result.result;
}

// ============================================================================
// Tool Execution
// ============================================================================

export async function callTool(name: string, args: Record<string, unknown>): Promise<SkillResult> {
  try {
    const token = getAuthToken();
    if (!token && AUTH_TYPE !== "none") {
      return {
        success: false,
        error: \`Authentication required. Set \${AUTH_ENV_VAR} environment variable.\`,
      };
    }
    
    const result = await sendJsonRpc("tools/call", {
      name,
      arguments: args,
    });
    
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Skill Decorator
// ============================================================================

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
// Context Factory
// ============================================================================

export function createContext(sessionId: string = "default"): SkillContext {
  return {
    sessionId,
    serverName: SERVER_NAME,
    callTool: (name, params) => callTool(name, params),
    getAuthHeaders: async () => getAuthHeaders(),
  };
}

// ============================================================================
// RuntimeAuthManager (for compatibility)
// ============================================================================

export class RuntimeAuthManager {
  getOrCreateSession(sessionId: string, _serverName?: string): SkillContext {
    return createContext(sessionId);
  }
  
  async authenticateSession(_sessionId: string, _serverName: string, _credentials: unknown): Promise<void> {
    // Auth is handled via environment variables
    console.log("Note: Auth is handled via " + AUTH_ENV_VAR + " environment variable");
  }
}

export const defaultAuthManager = new RuntimeAuthManager();
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

## Quick Start (CLI)

The simplest way to use this skill is via the \`run.ts\` CLI:

\`\`\`bash
# Set auth token if required
export ${serverName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_ACCESS_TOKEN="your-token"

# Run a tool
bun run.ts ${tools[0]?.name || 'tool-name'} '{"param": "value"}'
\`\`\`

## Programmatic Usage

\`\`\`typescript
import { callTool } from "./runtime.js";

// Call a tool directly
const result = await callTool("${tools[0]?.name || 'my-tool'}", { param: "value" });

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
