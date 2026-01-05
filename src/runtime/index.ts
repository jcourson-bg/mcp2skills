/**
 * Runtime support for generated skills
 *
 * This module provides the infrastructure needed to execute generated skills
 * in a chatbot environment with proper authentication and session management.
 *
 * Key components:
 * - RuntimeAuthManager: Manages authentication for multi-user scenarios
 * - SkillContext: Execution context for skill functions
 * - MCP connection pooling for efficient server access
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

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

/**
 * Authentication type
 */
export type AuthType = "none" | "api_key" | "bearer" | "oauth";

/**
 * Authentication credentials for a session
 */
export interface AuthCredentials {
  authType: AuthType;
  accessToken?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

/**
 * MCP Server configuration for runtime
 */
export interface MCPServerConfig {
  name: string;
  transport: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  authType?: AuthType;
  authConfig?: {
    token?: string;
    apiKey?: string;
    headerName?: string;
    envVar?: string;
  };
}

// ============================================================================
// Skill Decorator
// ============================================================================

/**
 * Create a skill function with metadata
 *
 * @example
 * ```typescript
 * export const readFile = skill({
 *   name: "read_file",
 *   server: "filesystem",
 *   description: "Read a file from disk"
 * }, async (input: ReadFileInput, context: SkillContext) => {
 *   return context.callTool("read_file", input);
 * });
 * ```
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
// Connection Pool
// ============================================================================

interface PooledConnection {
  client: Client;
  transport: Transport;
  lastUsed: Date;
  serverName: string;
}

/**
 * Manages pooled connections to MCP servers
 */
class ConnectionPool {
  private connections: Map<string, PooledConnection> = new Map();
  private configs: Map<string, MCPServerConfig> = new Map();

  addConfig(config: MCPServerConfig): void {
    this.configs.set(config.name, config);
  }

  async getConnection(serverName: string): Promise<Client> {
    // Check for existing connection
    const existing = this.connections.get(serverName);
    if (existing) {
      existing.lastUsed = new Date();
      return existing.client;
    }

    // Get config
    const config = this.configs.get(serverName);
    if (!config) {
      throw new Error(`No configuration found for server: ${serverName}`);
    }

    // Create new connection
    const transport = await this.createTransport(config);
    const client = new Client(
      { name: "mcp2skills-runtime", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);

    this.connections.set(serverName, {
      client,
      transport,
      lastUsed: new Date(),
      serverName,
    });

    return client;
  }

  async closeConnection(serverName: string): Promise<void> {
    const conn = this.connections.get(serverName);
    if (conn) {
      await conn.client.close();
      this.connections.delete(serverName);
    }
  }

  async closeAll(): Promise<void> {
    for (const conn of this.connections.values()) {
      await conn.client.close();
    }
    this.connections.clear();
  }

  private async createTransport(config: MCPServerConfig): Promise<Transport> {
    switch (config.transport) {
      case "stdio":
        if (!config.command) {
          throw new Error(`Stdio transport requires command for ${config.name}`);
        }
        return new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: config.env,
        });

      case "sse":
        if (!config.url) {
          throw new Error(`SSE transport requires url for ${config.name}`);
        }
        return new SSEClientTransport(new URL(config.url));

      case "http":
        if (!config.url) {
          throw new Error(`HTTP transport requires url for ${config.name}`);
        }
        return new StreamableHTTPClientTransport(new URL(config.url));

      default:
        throw new Error(`Unknown transport: ${config.transport}`);
    }
  }
}

// ============================================================================
// Session Context Implementation
// ============================================================================

/**
 * Session-specific skill execution context
 */
class SessionContextImpl implements SkillContext {
  constructor(
    public readonly sessionId: string,
    public readonly serverName: string,
    private readonly authManager: RuntimeAuthManager
  ) {}

  async callTool(
    name: string,
    params: Record<string, unknown>
  ): Promise<SkillResult> {
    return this.authManager.executeToolCall(
      this.sessionId,
      this.serverName,
      name,
      params
    );
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
 *
 * @example
 * ```typescript
 * const authManager = new RuntimeAuthManager();
 *
 * // Add server configuration
 * authManager.addServerConfig({
 *   name: "filesystem",
 *   transport: "stdio",
 *   command: "npx",
 *   args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
 * });
 *
 * // Authenticate a user session
 * await authManager.authenticateSession("user-123", "api-server", {
 *   authType: "bearer",
 *   accessToken: "user-specific-token"
 * });
 *
 * // Execute a skill
 * const context = authManager.getOrCreateSession("user-123", "filesystem");
 * const result = await readFile({ path: "/tmp/test.txt" }, context);
 * ```
 */
export class RuntimeAuthManager {
  private connectionPool = new ConnectionPool();
  private sessionCredentials: Map<string, Map<string, AuthCredentials>> =
    new Map();

  /**
   * Add a server configuration
   */
  addServerConfig(config: MCPServerConfig): void {
    this.connectionPool.addConfig(config);
  }

  /**
   * Get or create a session context for skill execution
   */
  getOrCreateSession(sessionId: string, serverName: string): SkillContext {
    if (!this.sessionCredentials.has(sessionId)) {
      this.sessionCredentials.set(sessionId, new Map());
    }
    return new SessionContextImpl(sessionId, serverName, this);
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
   * Check if a session is authenticated for a server
   */
  isAuthenticated(sessionId: string, serverName: string): boolean {
    const creds = this.sessionCredentials.get(sessionId)?.get(serverName);
    if (!creds || creds.authType === "none") return true; // No auth required
    if (creds.authType === "bearer" || creds.authType === "oauth") {
      if (!creds.accessToken) return false;
      if (creds.expiresAt && new Date() >= creds.expiresAt) return false;
    }
    if (creds.authType === "api_key" && !creds.apiKey) return false;
    return true;
  }

  /**
   * Get authentication headers for a session
   */
  async getAuthHeaders(
    sessionId: string,
    serverName: string
  ): Promise<Record<string, string>> {
    const creds = this.sessionCredentials.get(sessionId)?.get(serverName);
    if (!creds || creds.authType === "none") {
      return {};
    }

    switch (creds.authType) {
      case "bearer":
      case "oauth":
        if (!creds.accessToken) {
          throw new Error(
            `No access token for session ${sessionId} on ${serverName}`
          );
        }
        if (creds.expiresAt && new Date() >= creds.expiresAt) {
          throw new Error(
            `Token expired for session ${sessionId} on ${serverName}`
          );
        }
        return { Authorization: `Bearer ${creds.accessToken}` };

      case "api_key":
        if (!creds.apiKey) {
          throw new Error(
            `No API key for session ${sessionId} on ${serverName}`
          );
        }
        return { [creds.apiKeyHeader || "X-API-Key"]: creds.apiKey };

      default:
        return {};
    }
  }

  /**
   * Execute a tool call on behalf of a session
   */
  async executeToolCall(
    sessionId: string,
    serverName: string,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<SkillResult> {
    try {
      // Validate session is authenticated if required
      if (!this.isAuthenticated(sessionId, serverName)) {
        return {
          success: false,
          error: `Session ${sessionId} is not authenticated for server ${serverName}`,
        };
      }

      const client = await this.connectionPool.getConnection(serverName);

      // Execute the tool
      const result = await client.callTool({
        name: toolName,
        arguments: params,
      });

      // Parse result
      if (result.isError) {
        return {
          success: false,
          isError: true,
          error: this.extractErrorMessage(result.content),
        };
      }

      return {
        success: true,
        data: result.content,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute a skill for a session
   */
  async executeSkill<TInput, TOutput>(
    sessionId: string,
    skillFn: SkillFunction<TInput, TOutput>,
    input: TInput
  ): Promise<SkillResult<TOutput>> {
    const context = this.getOrCreateSession(sessionId, skillFn.serverName);
    return skillFn(input, context);
  }

  /**
   * Close a session and cleanup its credentials
   */
  async closeSession(sessionId: string): Promise<void> {
    this.sessionCredentials.delete(sessionId);
  }

  /**
   * Shutdown all connections and cleanup
   */
  async shutdown(): Promise<void> {
    await this.connectionPool.closeAll();
    this.sessionCredentials.clear();
  }

  private extractErrorMessage(content: unknown): string {
    if (Array.isArray(content)) {
      const textItem = content.find(
        (c) => typeof c === "object" && c !== null && "type" in c && c.type === "text"
      );
      if (textItem && "text" in textItem) {
        return String(textItem.text);
      }
    }
    return "Unknown error";
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * List all skills from a registry
 */
export function listSkills(
  registry: Record<string, readonly string[]>
): string[] {
  const skills: string[] = [];
  for (const [server, serverSkills] of Object.entries(registry)) {
    for (const skill of serverSkills) {
      skills.push(`${server}/${skill}`);
    }
  }
  return skills;
}

/**
 * Find a skill by name
 */
export function findSkill(
  name: string,
  registry: Record<string, readonly string[]>
): { server: string; tool: string } | undefined {
  // Try direct match (server/tool format)
  if (name.includes("/")) {
    const [server, tool] = name.split("/", 2);
    if (registry[server]?.includes(tool)) {
      return { server, tool };
    }
  }

  // Try finding by tool name only
  for (const [server, tools] of Object.entries(registry)) {
    if (tools.includes(name)) {
      return { server, tool: name };
    }
  }

  return undefined;
}

// ============================================================================
// Default Instance
// ============================================================================

/**
 * Default runtime auth manager instance for simple use cases
 */
export const defaultAuthManager = new RuntimeAuthManager();
