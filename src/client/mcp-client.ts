/**
 * MCP Client wrapper with transport abstraction and authentication
 *
 * Provides a unified interface for connecting to MCP servers via:
 * - stdio (local process)
 * - SSE (legacy HTTP+SSE)
 * - HTTP (streamable HTTP - recommended)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  MCPServerConfig,
  StdioTransportConfig,
  SseTransportConfig,
  HttpTransportConfig,
  ToolDefinition,
} from "../types.js";
import { createAuthProvider, type AuthProvider } from "./auth.js";
import { logger } from "../utils/logger.js";

/**
 * Connection state
 */
export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

/**
 * MCP Client wrapper with full lifecycle management
 */
export class MCPClient {
  private client: Client | null = null;
  private transport: Transport | null = null;
  private authProvider: AuthProvider | null = null;
  private _state: ConnectionState = "disconnected";
  private _serverName: string;
  private _config: MCPServerConfig;

  constructor(serverName: string, config: MCPServerConfig) {
    this._serverName = serverName;
    this._config = config;
  }

  get state(): ConnectionState {
    return this._state;
  }

  get serverName(): string {
    return this._serverName;
  }

  get config(): MCPServerConfig {
    return this._config;
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this._state === "connected") {
      logger.warn(`Already connected to ${this._serverName}`);
      return;
    }

    this._state = "connecting";

    try {
      // Create the appropriate transport
      this.transport = await this.createTransport();

      // Create the client with minimal capabilities
      this.client = new Client(
        {
          name: "mcp2skills",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Connect
      await this.client.connect(this.transport);
      this._state = "connected";
      logger.debug(`Connected to ${this._serverName}`);
    } catch (error) {
      this._state = "error";
      throw new Error(
        `Failed to connect to ${this._serverName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this._state !== "connected") {
      return;
    }

    try {
      await this.client?.close();
    } catch (error) {
      logger.debug(`Error during disconnect: ${error}`);
    } finally {
      this.client = null;
      this.transport = null;
      this._state = "disconnected";
    }
  }

  /**
   * List available tools from the server
   */
  async listTools(): Promise<ToolDefinition[]> {
    this.ensureConnected();

    const result = await this.client!.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as ToolDefinition["inputSchema"],
      outputSchema: tool.outputSchema as ToolDefinition["outputSchema"],
    }));
  }

  /**
   * Call a tool on the server
   */
  async callTool(
    name: string,
    params: Record<string, unknown>
  ): Promise<{ content: unknown; isError?: boolean }> {
    this.ensureConnected();

    const result = await this.client!.callTool({
      name,
      arguments: params,
    });

    return {
      content: result.content,
      isError: result.isError === true ? true : undefined,
    };
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): unknown {
    this.ensureConnected();
    return this.client?.getServerCapabilities();
  }

  /**
   * Get server info
   */
  getServerInfo(): { name: string; version: string } | undefined {
    this.ensureConnected();
    return this.client?.getServerVersion();
  }

  /**
   * Get authentication headers for external requests
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.authProvider) {
      return {};
    }
    return this.authProvider.getHeaders();
  }

  private ensureConnected(): void {
    if (this._state !== "connected" || !this.client) {
      throw new Error(`Not connected to ${this._serverName}`);
    }
  }

  private async createTransport(): Promise<Transport> {
    switch (this._config.transport) {
      case "stdio":
        return this.createStdioTransport(this._config);
      case "sse":
        return this.createSseTransport(this._config);
      case "http":
        return this.createHttpTransport(this._config);
      default:
        throw new Error(`Unknown transport type: ${(this._config as { transport: string }).transport}`);
    }
  }

  private createStdioTransport(config: StdioTransportConfig): Transport {
    logger.debug(`Creating stdio transport: ${config.command} ${config.args.join(" ")}`);

    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
      cwd: config.cwd,
    });
  }

  private createSseTransport(config: SseTransportConfig): Transport {
    logger.debug(`Creating SSE transport: ${config.url}`);

    // Setup auth provider
    this.authProvider = createAuthProvider(config.auth_type, config.auth_config);
    const authProvider = this.authProvider;
    const url = new URL(config.url);

    // Create a custom fetch that adds auth headers
    const customFetch = async (
      input: string | URL | Request,
      init?: RequestInit
    ): Promise<Response> => {
      const headers = new Headers(init?.headers);
      const authHeaders = await authProvider.getHeaders();
      for (const [key, value] of Object.entries(authHeaders)) {
        headers.set(key, value);
      }
      return fetch(input, { ...init, headers });
    };

    // Create transport with custom fetch for auth
    return new SSEClientTransport(url, {
      fetch: customFetch,
    });
  }

  private createHttpTransport(config: HttpTransportConfig): Transport {
    logger.debug(`Creating HTTP transport: ${config.url}`);

    // Setup auth provider
    this.authProvider = createAuthProvider(config.auth_type, config.auth_config);
    const authProvider = this.authProvider;
    const url = new URL(config.url);

    // Create a custom fetch that adds auth headers
    const customFetch = async (
      input: string | URL | Request,
      init?: RequestInit
    ): Promise<Response> => {
      const headers = new Headers(init?.headers);
      const authHeaders = await authProvider.getHeaders();
      for (const [key, value] of Object.entries(authHeaders)) {
        headers.set(key, value);
      }
      return fetch(input, { ...init, headers });
    };

    // StreamableHTTPClientTransport with custom fetch for auth
    return new StreamableHTTPClientTransport(url, {
      fetch: customFetch,
    });
  }
}

/**
 * Create an MCP client from configuration
 */
export function createMCPClient(
  serverName: string,
  config: MCPServerConfig
): MCPClient {
  return new MCPClient(serverName, config);
}

/**
 * Quick connection helper for stdio-based servers
 */
export async function connectStdio(
  command: string,
  args: string[] = [],
  env?: Record<string, string>
): Promise<MCPClient> {
  const client = new MCPClient("stdio-server", {
    transport: "stdio",
    command,
    args,
    env,
  });
  await client.connect();
  return client;
}
