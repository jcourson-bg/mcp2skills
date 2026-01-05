/**
 * Configuration loading and validation
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { MCPServersConfigSchema, type MCPServersConfig } from "../types.js";
import { logger } from "../utils/logger.js";

/**
 * Load MCP servers configuration from a JSON file
 */
export async function loadConfig(configPath: string): Promise<MCPServersConfig> {
  const resolvedPath = resolve(configPath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Configuration file not found: ${resolvedPath}`);
  }

  logger.debug(`Loading configuration from: ${resolvedPath}`);

  try {
    const content = await readFile(resolvedPath, "utf-8");
    const data = JSON.parse(content);
    return validateConfig(data);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Validate configuration data against schema
 */
export function validateConfig(data: unknown): MCPServersConfig {
  const result = MCPServersConfigSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  return result.data;
}

/**
 * Find configuration file in common locations
 */
export async function findConfig(): Promise<string | null> {
  const locations = [
    "mcp-servers.json",
    "mcp.json",
    ".mcp/servers.json",
    ".config/mcp-servers.json",
  ];

  for (const location of locations) {
    const path = resolve(location);
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Create a sample configuration file
 */
export function getSampleConfig(): MCPServersConfig {
  return {
    mcpServers: {
      filesystem: {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      },
      "example-api": {
        transport: "http",
        url: "https://api.example.com/mcp",
        auth_type: "bearer",
        auth_config: {
          env_var: "EXAMPLE_API_TOKEN",
        },
      },
    },
  };
}
