# mcp2skills

Production-level CLI tool for converting MCP (Model Context Protocol) servers into reusable chatbot skills with automatic code generation and runtime authentication handling.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.25-purple.svg)](https://modelcontextprotocol.io/)

## Features

- **Multi-Transport MCP Client**: Connect to MCP servers via:
  - `stdio` - Local process-based servers
  - `sse` - Legacy HTTP+SSE servers
  - `http` - Modern Streamable HTTP servers (recommended)

- **Comprehensive Authentication**: 
  - No authentication
  - API Key (custom headers)
  - Bearer token
  - OAuth 2.0 (client credentials flow)

- **Tool Discovery**: Automatically discover and inspect tools from any MCP server

- **TypeScript Code Generation**: Generate strongly-typed skill modules with:
  - Input/output interfaces from JSON Schema
  - Full JSDoc documentation
  - Skill metadata for discovery
  - Runtime context integration

- **Runtime Auth Manager**: Multi-user session management for chatbot integration

## Installation

```bash
# Clone and install
npm install

# Build
npm run build

# Run CLI
node dist/cli.js --help
```

Or install globally:

```bash
npm install -g mcp2skills
```

## Quick Start

### 1. Create Configuration

```bash
mcp2skills init
```

This creates a `mcp-servers.json` file:

```json
{
  "mcpServers": {
    "filesystem": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "my-api": {
      "transport": "http",
      "url": "https://api.example.com/mcp",
      "auth_type": "bearer",
      "auth_config": {
        "env_var": "MY_API_TOKEN"
      }
    }
  }
}
```

### 2. Test Connection

```bash
# Test stdio-based server
mcp2skills connect "npx" --args "-y,@modelcontextprotocol/server-filesystem,/tmp"

# Test HTTP/SSE server with auth
mcp2skills connect-sse "https://api.example.com/mcp" --auth bearer --token "your-token"
```

### 3. Discover Tools

```bash
# List all tools
mcp2skills list-tools -c mcp-servers.json

# List in different formats
mcp2skills list-tools -c mcp-servers.json --format json
mcp2skills list-tools -c mcp-servers.json --format tree

# Inspect a specific tool
mcp2skills inspect mcp-servers.json read_file --server filesystem
```

### 4. Generate Skills

```bash
# Generate all skills
mcp2skills generate mcp-servers.json -o generated_skills

# Generate for specific server
mcp2skills generate mcp-servers.json -o my_skills --server filesystem

# Preview without writing files
mcp2skills generate mcp-servers.json --preview
```

### 5. Use Generated Skills

```typescript
import { RuntimeAuthManager, filesystem } from "./generated_skills/index.js";

// Create auth manager
const authManager = new RuntimeAuthManager();

// Add server configuration
authManager.addServerConfig({
  name: "filesystem",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
});

// Get session context for a user
const context = authManager.getOrCreateSession("user-123", "filesystem");

// Execute skills
const result = await filesystem.readFile({ path: "/tmp/example.txt" }, context);

if (result.success) {
  console.log("File content:", result.data);
} else {
  console.error("Error:", result.error);
}

// Cleanup
await authManager.shutdown();
```

## CLI Commands

### `mcp2skills init`

Create a sample configuration file.

```bash
mcp2skills init [-o, --output <path>]
```

### `mcp2skills connect`

Test connection to a stdio-based MCP server.

```bash
mcp2skills connect <command> [options]

Options:
  -a, --args <args>     Comma-separated arguments
  -e, --env <vars...>   Environment variables (KEY=VALUE)
```

### `mcp2skills connect-sse`

Test connection to an SSE/HTTP-based MCP server.

```bash
mcp2skills connect-sse <url> [options]

Options:
  --auth <type>         Authentication type (none, bearer, api_key)
  --token <token>       Bearer token or API key
  --env-var <name>      Environment variable containing the token
```

### `mcp2skills list-tools`

List all tools from configured MCP servers.

```bash
mcp2skills list-tools [options]

Options:
  -c, --config <path>   Path to config file (required)
  -s, --server <name>   Only list tools from this server
  -f, --format <type>   Output format (table, json, tree)
```

### `mcp2skills inspect`

Inspect a specific tool's schema and details.

```bash
mcp2skills inspect <config> <tool> [options]

Options:
  -s, --server <name>   Server containing the tool
```

### `mcp2skills export`

Export all tool definitions to JSON.

```bash
mcp2skills export <config> [options]

Options:
  -o, --output <path>   Output file (default: mcp-tools.json)
  -s, --server <name>   Only export from this server
```

### `mcp2skills generate`

Generate skill files from MCP tool definitions.

```bash
mcp2skills generate <config> [options]

Options:
  -o, --output <dir>        Output directory (default: generated_skills)
  -s, --server <name>       Only generate for this server
  -t, --tools <names>       Comma-separated tool names
  -p, --preview             Preview without writing files
  --no-inline-runtime       Don't include inline runtime
```

## Configuration Reference

### Server Configuration

```json
{
  "mcpServers": {
    "server-name": {
      // Transport configuration (one of)
    }
  }
}
```

### Stdio Transport

For local process-based servers:

```json
{
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  "env": {
    "MY_VAR": "value"
  },
  "cwd": "/path/to/working/dir"
}
```

### HTTP Transport

For modern Streamable HTTP servers:

```json
{
  "transport": "http",
  "url": "https://api.example.com/mcp",
  "auth_type": "bearer",
  "auth_config": {
    "token": "your-token"
  }
}
```

### SSE Transport (Legacy)

For legacy HTTP+SSE servers:

```json
{
  "transport": "sse",
  "url": "https://api.example.com/mcp",
  "auth_type": "api_key",
  "auth_config": {
    "env_var": "API_KEY",
    "header_name": "X-API-Key"
  }
}
```

## Authentication Types

### No Auth

```json
{
  "transport": "http",
  "url": "https://public-api.example.com/mcp"
}
```

### API Key

```json
{
  "auth_type": "api_key",
  "auth_config": {
    "api_key": "your-key",
    "header_name": "X-API-Key",
    "header_prefix": ""
  }
}
```

Or via environment variable:

```json
{
  "auth_type": "api_key",
  "auth_config": {
    "env_var": "MY_API_KEY"
  }
}
```

### Bearer Token

```json
{
  "auth_type": "bearer",
  "auth_config": {
    "token": "your-token"
  }
}
```

Or via environment variable:

```json
{
  "auth_type": "bearer",
  "auth_config": {
    "env_var": "API_TOKEN"
  }
}
```

### OAuth 2.0 (Client Credentials)

```json
{
  "auth_type": "oauth",
  "auth_config": {
    "client_id": "your-client-id",
    "client_secret": "your-client-secret",
    "token_url": "https://auth.example.com/oauth/token",
    "scopes": ["read", "write"]
  }
}
```

## Generated Skill Structure

When you run `mcp2skills generate`, it creates:

```
generated_skills/
├── index.ts              # Main exports and skill registry
├── runtime.ts            # Standalone runtime (auth, context, registry)
└── ServerName/
    ├── index.ts          # Server-specific exports
    ├── tool_one.ts       # Generated skill
    ├── tool_two.ts       # Generated skill
    └── ...
```

Each generated skill includes:

- **Input interface**: Strongly-typed from JSON Schema
- **Skill function**: Async function with proper typing
- **Skill metadata**: Name, server, description for discovery
- **JSDoc comments**: Full documentation

## Runtime Auth Manager

For multi-user chatbot scenarios:

```typescript
import { RuntimeAuthManager } from "mcp2skills/runtime";

const authManager = new RuntimeAuthManager();

// Add server configurations
authManager.addServerConfig({
  name: "api",
  transport: "http",
  url: "https://api.example.com/mcp",
  authType: "bearer"
});

// Per-user authentication
await authManager.authenticateSession("user-123", "api", {
  authType: "bearer",
  accessToken: "user-specific-token"
});

// Execute skills for users
const context = authManager.getOrCreateSession("user-123", "api");
const result = await mySkill(input, context);

// Check authentication
if (!authManager.isAuthenticated("user-123", "api")) {
  // Redirect to auth flow
}

// Cleanup on logout
await authManager.closeSession("user-123");

// Shutdown all connections
await authManager.shutdown();
```

## Architecture

```
src/
├── cli.ts                # CLI entry point and commands
├── index.ts              # Main package exports
├── types.ts              # Core types and Zod schemas
├── client/
│   ├── auth.ts           # Authentication providers
│   ├── config.ts         # Configuration loading
│   ├── mcp-client.ts     # MCP client wrapper
│   └── index.ts
├── generator/
│   ├── schema-to-ts.ts   # JSON Schema to TypeScript
│   ├── skill-generator.ts # Code generation
│   └── index.ts
├── runtime/
│   └── index.ts          # Runtime auth and execution
└── utils/
    └── logger.ts         # Logging utilities
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Type check
npm run typecheck

# Run in development mode
npm run dev -- --help
```

## License

MIT
