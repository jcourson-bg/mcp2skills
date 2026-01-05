import { describe, it, expect } from "vitest";
import {
  generateInterface,
  schemaToTsType,
  toValidIdentifier,
  toPascalCase,
  toCamelCase,
} from "../src/generator/schema-to-ts.js";

describe("Schema to TypeScript", () => {
  describe("toValidIdentifier", () => {
    it("should convert hyphens to underscores", () => {
      expect(toValidIdentifier("my-tool")).toBe("my_tool");
    });

    it("should handle numbers at start", () => {
      expect(toValidIdentifier("123tool")).toBe("_123tool");
    });

    it("should handle reserved words", () => {
      expect(toValidIdentifier("class")).toBe("class_");
      expect(toValidIdentifier("function")).toBe("function_");
    });

    it("should handle special characters", () => {
      expect(toValidIdentifier("my@tool!")).toBe("my_tool_");
    });
  });

  describe("toPascalCase", () => {
    it("should convert hyphenated names", () => {
      expect(toPascalCase("read-file")).toBe("ReadFile");
    });

    it("should convert underscored names", () => {
      expect(toPascalCase("read_file")).toBe("ReadFile");
    });

    it("should handle single word", () => {
      expect(toPascalCase("read")).toBe("Read");
    });
  });

  describe("toCamelCase", () => {
    it("should convert hyphenated names", () => {
      expect(toCamelCase("read-file")).toBe("readFile");
    });

    it("should convert underscored names", () => {
      expect(toCamelCase("read_file")).toBe("readFile");
    });
  });

  describe("schemaToTsType", () => {
    it("should convert string type", () => {
      expect(schemaToTsType({ type: "string" })).toBe("string");
    });

    it("should convert number type", () => {
      expect(schemaToTsType({ type: "number" })).toBe("number");
    });

    it("should convert integer type", () => {
      expect(schemaToTsType({ type: "integer" })).toBe("number");
    });

    it("should convert boolean type", () => {
      expect(schemaToTsType({ type: "boolean" })).toBe("boolean");
    });

    it("should convert array type", () => {
      expect(schemaToTsType({ type: "array", items: { type: "string" } })).toBe(
        "(string)[]"
      );
    });

    it("should convert enum type", () => {
      expect(schemaToTsType({ enum: ["a", "b", "c"] })).toBe('"a" | "b" | "c"');
    });

    it("should handle nullable", () => {
      expect(schemaToTsType({ type: "string", nullable: true })).toBe(
        "string | null"
      );
    });

    it("should handle type arrays with null", () => {
      expect(schemaToTsType({ type: ["string", "null"] })).toBe(
        "string | null"
      );
    });
  });

  describe("generateInterface", () => {
    it("should generate simple interface", () => {
      const schema = {
        type: "object" as const,
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name"],
      };
      const result = generateInterface("Person", schema);
      expect(result).toContain("export interface Person");
      expect(result).toContain("name: string;");
      expect(result).toContain("age?: number;");
    });

    it("should include description", () => {
      const schema = {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "File path" },
        },
      };
      const result = generateInterface("Input", schema, "Input parameters");
      expect(result).toContain("Input parameters");
      expect(result).toContain("/** File path */");
    });

    it("should handle empty schema", () => {
      const schema = {
        type: "object" as const,
        properties: {},
      };
      const result = generateInterface("Empty", schema);
      expect(result).toContain("export type Empty = Record<string, unknown>;");
    });
  });
});
