#!/usr/bin/env node
/**
 * MCP to Skills CLI
 *
 * Command-line tool for scanning MCP servers and generating chatbot skills.
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createMCPClient, loadConfig } from "./client/index.js";
import { generateSkills, previewSkills } from "./generator/index.js";
import { logger, setLogLevel, setQuiet } from "./utils/logger.js";
import type {
  MCPServersConfig,
  ServerTools,
  ToolDefinition,
  GeneratorOptions,
} from "./types.js";

const VERSION = "1.0.0";

// ============================================================================
// Program Setup
// ============================================================================

const program = new Command();

program
  .name("mcp2skills")
  .description("Convert MCP servers into reusable chatbot skills")
  .version(VERSION)
  .option("-v, --verbose", "Enable verbose output")
  .option("-q, --quiet", "Suppress non-error output")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setLogLevel("debug");
    }
    if (opts.quiet) {
      setQuiet(true);
    }
  });

// ============================================================================
// Connect Command
// ============================================================================

program
  .command("connect <command>")
  .description("Test connection to a stdio-based MCP server")
  .option("-a, --args <args>", "Comma-separated arguments for the command")
  .option("-e, --env <vars...>", "Environment variables (KEY=VALUE)")
  .action(async (command: string, options: { args?: string; env?: string[] }) => {
    const spinner = ora("Connecting to MCP server...").start();

    try {
      // Parse arguments
      const args = options.args ? options.args.split(",") : [];

      // Parse environment variables
      const env: Record<string, string> = {};
      if (options.env) {
        for (const pair of options.env) {
          const [key, ...rest] = pair.split("=");
          if (key) {
            env[key] = rest.join("=");
          }
        }
      }

      const client = createMCPClient("test-server", {
        transport: "stdio",
        command,
        args,
        env: Object.keys(env).length > 0 ? env : undefined,
      });

      await client.connect();
      spinner.succeed("Connected successfully!");

      // Get server info
      const info = client.getServerInfo();
      if (info) {
        logger.info(`\n${chalk.bold("Server:")} ${info.name} v${info.version}`);
      }

      // List tools
      spinner.start("Fetching tools...");
      const tools = await client.listTools();
      spinner.succeed(`Found ${tools.length} tool(s)`);

      if (tools.length > 0) {
        logger.info(`\n${chalk.bold("Available Tools:")}`);
        for (const tool of tools) {
          logger.info(`  ${chalk.cyan(tool.name)}`);
          if (tool.description) {
            logger.info(`    ${chalk.dim(tool.description)}`);
          }
        }
      }

      await client.disconnect();
    } catch (error) {
      spinner.fail("Connection failed");
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// ============================================================================
// Connect SSE Command
// ============================================================================

program
  .command("connect-sse <url>")
  .description("Test connection to an SSE-based MCP server")
  .option("--auth <type>", "Authentication type (none, bearer, api_key)", "none")
  .option("--token <token>", "Bearer token or API key")
  .option("--env-var <name>", "Environment variable containing the token")
  .action(
    async (
      url: string,
      options: { auth: string; token?: string; envVar?: string }
    ) => {
      const spinner = ora("Connecting to MCP server...").start();

      try {
        const authType = options.auth as "none" | "bearer" | "api_key";
        let authConfig: Record<string, unknown> | undefined;

        if (authType !== "none") {
          if (options.token) {
            authConfig =
              authType === "bearer"
                ? { token: options.token }
                : { api_key: options.token };
          } else if (options.envVar) {
            authConfig = { env_var: options.envVar };
          }
        }

        const client = createMCPClient("test-server", {
          transport: "sse",
          url,
          auth_type: authType,
          auth_config: authConfig,
        });

        await client.connect();
        spinner.succeed("Connected successfully!");

        const info = client.getServerInfo();
        if (info) {
          logger.info(`\n${chalk.bold("Server:")} ${info.name} v${info.version}`);
        }

        spinner.start("Fetching tools...");
        const tools = await client.listTools();
        spinner.succeed(`Found ${tools.length} tool(s)`);

        if (tools.length > 0) {
          logger.info(`\n${chalk.bold("Available Tools:")}`);
          for (const tool of tools) {
            logger.info(`  ${chalk.cyan(tool.name)}`);
            if (tool.description) {
              logger.info(`    ${chalk.dim(tool.description)}`);
            }
          }
        }

        await client.disconnect();
      } catch (error) {
        spinner.fail("Connection failed");
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }
  );

// ============================================================================
// List Tools Command
// ============================================================================

program
  .command("list-tools")
  .description("List all tools from configured MCP servers")
  .requiredOption("-c, --config <path>", "Path to MCP servers config file")
  .option("-s, --server <name>", "Only list tools from this server")
  .option("-f, --format <format>", "Output format (table, json, tree)", "table")
  .action(
    async (options: { config: string; server?: string; format: string }) => {
      const spinner = ora("Loading configuration...").start();

      try {
        const config = await loadConfig(options.config);
        spinner.succeed("Configuration loaded");

        const allTools = await collectAllTools(config, options.server, spinner);

        // Output based on format
        switch (options.format) {
          case "json":
            outputToolsJson(allTools);
            break;
          case "tree":
            outputToolsTree(allTools);
            break;
          default:
            outputToolsTable(allTools);
        }
      } catch (error) {
        spinner.fail("Failed to list tools");
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }
  );

// ============================================================================
// Inspect Command
// ============================================================================

program
  .command("inspect <config> <tool>")
  .description("Inspect a specific tool's schema and details")
  .option("-s, --server <name>", "Server containing the tool")
  .action(
    async (
      configPath: string,
      toolName: string,
      options: { server?: string }
    ) => {
      const spinner = ora("Loading configuration...").start();

      try {
        const config = await loadConfig(configPath);
        spinner.succeed("Configuration loaded");

        const allTools = await collectAllTools(config, options.server, spinner);

        // Find the tool
        let foundTool: { server: string; tool: ToolDefinition } | undefined;
        for (const server of allTools) {
          const tool = server.tools.find((t) => t.name === toolName);
          if (tool) {
            foundTool = { server: server.serverName, tool };
            break;
          }
        }

        if (!foundTool) {
          throw new Error(`Tool "${toolName}" not found`);
        }

        // Output tool details
        logger.info(`\n${chalk.bold("Tool:")} ${chalk.cyan(foundTool.tool.name)}`);
        logger.info(`${chalk.bold("Server:")} ${foundTool.server}`);

        if (foundTool.tool.description) {
          logger.info(`\n${chalk.bold("Description:")}`);
          logger.info(`  ${foundTool.tool.description}`);
        }

        logger.info(`\n${chalk.bold("Input Schema:")}`);
        logger.info(JSON.stringify(foundTool.tool.inputSchema, null, 2));

        if (foundTool.tool.outputSchema) {
          logger.info(`\n${chalk.bold("Output Schema:")}`);
          logger.info(JSON.stringify(foundTool.tool.outputSchema, null, 2));
        }
      } catch (error) {
        spinner.fail("Inspection failed");
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }
  );

// ============================================================================
// Export Command
// ============================================================================

program
  .command("export <config>")
  .description("Export all tool definitions to JSON")
  .option("-o, --output <path>", "Output file path", "mcp-tools.json")
  .option("-s, --server <name>", "Only export from this server")
  .action(
    async (
      configPath: string,
      options: { output: string; server?: string }
    ) => {
      const spinner = ora("Loading configuration...").start();

      try {
        const config = await loadConfig(configPath);
        spinner.succeed("Configuration loaded");

        const allTools = await collectAllTools(config, options.server, spinner);

        // Write to file
        const { writeFile } = await import("node:fs/promises");
        const exportData = {
          generatedAt: new Date().toISOString(),
          servers: allTools.map((s) => ({
            name: s.serverName,
            tools: s.tools,
          })),
        };

        await writeFile(options.output, JSON.stringify(exportData, null, 2));
        logger.success(`Exported to ${options.output}`);
      } catch (error) {
        spinner.fail("Export failed");
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }
  );

// ============================================================================
// Generate Command
// ============================================================================

program
  .command("generate <config>")
  .description("Generate skill files from MCP tool definitions")
  .option("-o, --output <dir>", "Output directory", "generated_skills")
  .option("-s, --server <name>", "Only generate for this server")
  .option("-t, --tools <names>", "Comma-separated list of tool names to generate")
  .option("-p, --preview", "Preview generated code without writing files")
  .option("--no-inline-runtime", "Don't include inline runtime (use npm package)")
  .action(
    async (
      configPath: string,
      options: {
        output: string;
        server?: string;
        tools?: string;
        preview?: boolean;
        inlineRuntime: boolean;
      }
    ) => {
      const spinner = ora("Loading configuration...").start();

      try {
        const config = await loadConfig(configPath);
        spinner.succeed("Configuration loaded");

        const allTools = await collectAllTools(config, options.server, spinner);

        spinner.start("Generating skills...");

        const generatorOptions: GeneratorOptions = {
          outputDir: options.output,
          serverFilter: options.server,
          toolFilter: options.tools ? options.tools.split(",") : undefined,
          inlineRuntime: options.inlineRuntime,
          typescript: true,
          includeJsdoc: true,
          preview: options.preview ?? false,
        };

        const files = await generateSkills(allTools, generatorOptions);

        if (options.preview) {
          spinner.info("Preview mode - no files written");
          previewSkills(files);
        } else {
          spinner.succeed(`Generated ${files.length} file(s) to ${options.output}`);
          logger.info(`\n${chalk.bold("Generated files:")}`);
          for (const file of files) {
            logger.info(`  ${chalk.dim(file.path)}`);
          }
        }

        // Print usage instructions
        logger.info(`\n${chalk.bold("Usage:")}`);
        logger.info(`  import { RuntimeAuthManager } from "./${options.output}/index.js";`);
        logger.info(`  import { filesystem } from "./${options.output}/index.js";`);
        logger.info(`\n  const authManager = new RuntimeAuthManager();`);
        logger.info(`  const context = authManager.getOrCreateSession("user-123", "filesystem");`);
        logger.info(`  const result = await filesystem.readFile({ path: "/tmp/test.txt" }, context);`);
      } catch (error) {
        spinner.fail("Generation failed");
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }
  );

// ============================================================================
// Init Command
// ============================================================================

program
  .command("init")
  .description("Create a sample MCP servers configuration file")
  .option("-o, --output <path>", "Output file path", "mcp-servers.json")
  .action(async (options: { output: string }) => {
    const { writeFile } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");

    if (existsSync(options.output)) {
      logger.error(`File already exists: ${options.output}`);
      process.exit(1);
    }

    const sampleConfig = {
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

    await writeFile(options.output, JSON.stringify(sampleConfig, null, 2));
    logger.success(`Created ${options.output}`);
    logger.info(`\nEdit this file to configure your MCP servers, then run:`);
    logger.info(`  mcp2skills list-tools -c ${options.output}`);
  });

// ============================================================================
// Helper Functions
// ============================================================================

async function collectAllTools(
  config: MCPServersConfig,
  serverFilter: string | undefined,
  spinner: ReturnType<typeof ora>
): Promise<ServerTools[]> {
  const allTools: ServerTools[] = [];
  const serverEntries = Object.entries(config.mcpServers);

  const filteredEntries = serverFilter
    ? serverEntries.filter(([name]) => name === serverFilter)
    : serverEntries;

  if (filteredEntries.length === 0) {
    throw new Error(
      serverFilter
        ? `Server "${serverFilter}" not found in configuration`
        : "No servers configured"
    );
  }

  for (const [serverName, serverConfig] of filteredEntries) {
    spinner.text = `Connecting to ${serverName}...`;

    try {
      const client = createMCPClient(serverName, serverConfig);
      await client.connect();

      spinner.text = `Fetching tools from ${serverName}...`;
      const tools = await client.listTools();

      allTools.push({
        serverName,
        serverConfig,
        tools,
      });

      await client.disconnect();
      spinner.succeed(`${serverName}: ${tools.length} tool(s)`);
      spinner.start();
    } catch (error) {
      spinner.warn(
        `${serverName}: Failed - ${error instanceof Error ? error.message : String(error)}`
      );
      spinner.start();
    }
  }

  return allTools;
}

function outputToolsTable(servers: ServerTools[]): void {
  const headers = ["Server", "Tool", "Description"];
  const rows: string[][] = [];

  for (const server of servers) {
    for (const tool of server.tools) {
      rows.push([
        server.serverName,
        tool.name,
        tool.description?.substring(0, 60) || "",
      ]);
    }
  }

  if (rows.length === 0) {
    logger.info("No tools found.");
    return;
  }

  logger.table(headers, rows);
}

function outputToolsJson(servers: ServerTools[]): void {
  const output = servers.map((s) => ({
    server: s.serverName,
    tools: s.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema,
    })),
  }));
  console.log(JSON.stringify(output, null, 2));
}

function outputToolsTree(servers: ServerTools[]): void {
  for (const server of servers) {
    logger.info(chalk.bold(`${server.serverName}`));
    for (let i = 0; i < server.tools.length; i++) {
      const tool = server.tools[i];
      const isLast = i === server.tools.length - 1;
      const prefix = isLast ? "└── " : "├── ";
      logger.info(`${prefix}${chalk.cyan(tool.name)}`);
      if (tool.description) {
        const descPrefix = isLast ? "    " : "│   ";
        logger.info(`${descPrefix}${chalk.dim(tool.description)}`);
      }
    }
    logger.info("");
  }
}

// ============================================================================
// Run CLI
// ============================================================================

program.parse();
