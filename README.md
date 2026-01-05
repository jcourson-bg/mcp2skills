# MCP to Skills Converter

Convert MCP (Model Context Protocol) servers into reusable chatbot skills with automatic code generation and runtime auth handling.

## Features

- **MCP Client with Auth**: Connect to MCP servers with support for:
  - No authentication
  - API Key authentication
  - Bearer token authentication
  - OAuth 2.0 (client credentials flow)
  
- **Tool Discovery**: Automatically discover and load tool definitions from MCP servers

- **Multiple Transports**: Support for stdio and SSE transports

- **Code Generation**: Generate standalone Python skill modules from MCP tool definitions

- **Runtime Auth Manager**: Handle authentication when chatbots execute skills at runtime

## Installation

```bash
# Using uv (recommended)
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"

# Or using pip
pip install -e ".[dev]"
```

## Quick Start

### 1. Configure MCP Servers

Create a `mcp-servers.json` file:

```json
{
  "mcpServers": {
    "filesystem": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "my-api": {
      "transport": "sse",
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
mcp2skills connect "npx" --args "-y,@modelcontextprotocol/server-filesystem,/tmp"
```

### 3. Generate Skills

```bash
# Preview generated code
mcp2skills generate mcp-servers.json --preview

# Generate skill files
mcp2skills generate mcp-servers.json --output generated_skills
```

### 4. Use in Your Chatbot

```python
import asyncio
from generated_skills import RuntimeAuthManager, list_skills
from generated_skills.Canva import search_designs

# Create auth manager for multi-user sessions
auth_manager = RuntimeAuthManager()

# Add server configurations
from generated_skills.runtime import MCPServerConfig
auth_manager.add_server_config(MCPServerConfig(
    name="Canva",
    transport="sse",
    url="https://mcp.canva.com",
    auth_type="bearer",
    auth_config={"env_var": "CANVA_TOKEN"}
))

async def handle_chat(user_id: str, message: str):
    # Get or create user session
    ctx = auth_manager.get_or_create_session(user_id)
    
    # Execute skill
    result = await ctx.execute_skill(
        "search-designs",
        {"query": "presentation", "ownership": "owned"}
    )
    return result

# Run
asyncio.run(handle_chat("user-123", "Find my presentations"))
```

## CLI Commands

### List Tools

```bash
# List all tools from configured servers
mcp2skills list-tools --config mcp-servers.json

# List tools in JSON format
mcp2skills list-tools --config mcp-servers.json --format json

# List tools in tree format
mcp2skills list-tools --config mcp-servers.json --format tree
```

### Test Connections

```bash
# Test stdio-based server
mcp2skills connect "npx" --args "-y,@modelcontextprotocol/server-filesystem,/tmp"

# Test SSE-based server with auth
mcp2skills connect-sse "https://api.example.com/mcp" --auth bearer --token "your-token"
```

### Inspect Tools

```bash
mcp2skills inspect mcp-servers.json read_file --server filesystem
```

### Export Definitions

```bash
mcp2skills export mcp-servers.json --output tools.json
```

### Generate Skills

```bash
# Preview generated code
mcp2skills generate mcp-servers.json --preview

# Generate to specific directory
mcp2skills generate mcp-servers.json --output my_skills

# Generate for specific server only
mcp2skills generate mcp-servers.json --server Canva --output canva_skills
```

## Authentication Types

### No Auth
```json
{
  "transport": "stdio",
  "command": "some-server"
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

Or use environment variables:
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

### OAuth 2.0
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
├── __init__.py              # Package with exports
├── runtime.py               # Standalone runtime (auth, context, registry)
└── ServerName/
    ├── __init__.py
    ├── tool_one.py          # Generated skill
    ├── tool_two.py
    └── ...
```

Each generated skill includes:
- **Input model**: Pydantic model for type-safe parameters
- **Output model**: Standardized result with success/error handling
- **Skill function**: Async function decorated with `@skill`
- **Full documentation**: Description from MCP tool definition

## Runtime Auth for Chatbots

The `RuntimeAuthManager` handles multi-user authentication:

```python
from generated_skills import RuntimeAuthManager
from generated_skills.runtime import AuthCredentials, MCPServerConfig

# Initialize
auth_manager = RuntimeAuthManager()

# Add server config
auth_manager.add_server_config(MCPServerConfig(
    name="MyAPI",
    transport="sse", 
    url="https://api.example.com/mcp",
    auth_type="oauth",
    auth_config={
        "client_id": "...",
        "client_secret": "...",
        "token_url": "https://auth.example.com/token"
    }
))

# Per-user authentication
async def on_user_login(user_id: str, access_token: str):
    await auth_manager.authenticate_session(
        session_id=user_id,
        server_name="MyAPI",
        credentials=AuthCredentials(
            auth_type="bearer",
            access_token=access_token
        )
    )

# Execute skills for user
async def handle_request(user_id: str, skill_name: str, params: dict):
    return await auth_manager.execute_skill(user_id, skill_name, params)

# Cleanup
async def on_user_logout(user_id: str):
    await auth_manager.close_session(user_id)
```

## Architecture

```
src/
├── __init__.py       # Package init
├── models.py         # Data models (ToolDefinition, MCPServerConfig, etc.)
├── auth.py           # Authentication providers (OAuth, API Key, Bearer)
├── client.py         # MCP client for connecting to servers
├── runtime.py        # Runtime context and skill registry
├── generator.py      # Code generator for skills
├── cli.py            # Command-line interface
└── templates/
    └── skill.py.jinja2  # Jinja2 template for skill generation
```

## Development

```bash
# Run tests
pytest tests/ -v

# Format code
black src/ tests/

# Lint
ruff check src/ tests/
```

## License

MIT
# mcp2skills
