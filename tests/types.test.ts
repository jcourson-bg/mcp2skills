import { describe, it, expect } from "vitest";
import {
  MCPServersConfigSchema,
  MCPServerConfigSchema,
  AuthTypeSchema,
  ToolDefinitionSchema,
} from "../src/types.js";

describe("Type Schemas", () => {
  describe("AuthTypeSchema", () => {
    it("should accept valid auth types", () => {
      expect(AuthTypeSchema.parse("none")).toBe("none");
      expect(AuthTypeSchema.parse("api_key")).toBe("api_key");
      expect(AuthTypeSchema.parse("bearer")).toBe("bearer");
      expect(AuthTypeSchema.parse("oauth")).toBe("oauth");
    });

    it("should reject invalid auth types", () => {
      expect(() => AuthTypeSchema.parse("invalid")).toThrow();
    });
  });

  describe("MCPServerConfigSchema", () => {
    it("should accept valid stdio config", () => {
      const config = {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      };
      const result = MCPServerConfigSchema.parse(config);
      expect(result.transport).toBe("stdio");
      expect(result.command).toBe("npx");
    });

    it("should accept valid http config", () => {
      const config = {
        transport: "http",
        url: "https://api.example.com/mcp",
        auth_type: "bearer",
        auth_config: {
          token: "test-token",
        },
      };
      const result = MCPServerConfigSchema.parse(config);
      expect(result.transport).toBe("http");
    });

    it("should accept valid sse config", () => {
      const config = {
        transport: "sse",
        url: "https://api.example.com/mcp",
        auth_type: "api_key",
        auth_config: {
          api_key: "test-key",
          header_name: "X-API-Key",
        },
      };
      const result = MCPServerConfigSchema.parse(config);
      expect(result.transport).toBe("sse");
    });

    it("should apply defaults for missing optional fields", () => {
      const config = {
        transport: "stdio",
        command: "npx",
      };
      const result = MCPServerConfigSchema.parse(config);
      if (result.transport === "stdio") {
        expect(result.args).toEqual([]);
      }
    });
  });

  describe("MCPServersConfigSchema", () => {
    it("should accept valid servers config", () => {
      const config = {
        mcpServers: {
          filesystem: {
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
          },
          api: {
            transport: "http",
            url: "https://api.example.com/mcp",
          },
        },
      };
      const result = MCPServersConfigSchema.parse(config);
      expect(Object.keys(result.mcpServers)).toHaveLength(2);
    });
  });

  describe("ToolDefinitionSchema", () => {
    it("should accept valid tool definition", () => {
      const tool = {
        name: "read_file",
        description: "Read a file",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
          },
          required: ["path"],
        },
      };
      const result = ToolDefinitionSchema.parse(tool);
      expect(result.name).toBe("read_file");
      expect(result.description).toBe("Read a file");
    });

    it("should accept tool without description", () => {
      const tool = {
        name: "test_tool",
        inputSchema: {
          type: "object",
          properties: {},
        },
      };
      const result = ToolDefinitionSchema.parse(tool);
      expect(result.name).toBe("test_tool");
      expect(result.description).toBeUndefined();
    });
  });
});
