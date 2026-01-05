import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  NoAuthProvider,
  ApiKeyAuthProvider,
  BearerAuthProvider,
  createAuthProvider,
} from "../src/client/auth.js";

describe("Auth Providers", () => {
  describe("NoAuthProvider", () => {
    it("should return empty headers", async () => {
      const provider = new NoAuthProvider();
      const headers = await provider.getHeaders();
      expect(headers).toEqual({});
    });

    it("should always be valid", () => {
      const provider = new NoAuthProvider();
      expect(provider.isValid()).toBe(true);
    });
  });

  describe("ApiKeyAuthProvider", () => {
    it("should return correct headers with api_key", async () => {
      const provider = new ApiKeyAuthProvider({
        api_key: "test-key",
        header_name: "X-API-Key",
        header_prefix: "",
      });
      const headers = await provider.getHeaders();
      expect(headers).toEqual({ "X-API-Key": "test-key" });
    });

    it("should support custom header prefix", async () => {
      const provider = new ApiKeyAuthProvider({
        api_key: "test-key",
        header_name: "Authorization",
        header_prefix: "ApiKey ",
      });
      const headers = await provider.getHeaders();
      expect(headers).toEqual({ Authorization: "ApiKey test-key" });
    });

    it("should read from environment variable", async () => {
      process.env.TEST_API_KEY = "env-api-key";
      try {
        const provider = new ApiKeyAuthProvider({
          env_var: "TEST_API_KEY",
          header_name: "X-API-Key",
          header_prefix: "",
        });
        const headers = await provider.getHeaders();
        expect(headers).toEqual({ "X-API-Key": "env-api-key" });
      } finally {
        delete process.env.TEST_API_KEY;
      }
    });

    it("should throw if env var not set", () => {
      expect(
        () =>
          new ApiKeyAuthProvider({
            env_var: "NONEXISTENT_VAR",
            header_name: "X-API-Key",
            header_prefix: "",
          })
      ).toThrow("Environment variable NONEXISTENT_VAR is not set");
    });
  });

  describe("BearerAuthProvider", () => {
    it("should return correct Authorization header", async () => {
      const provider = new BearerAuthProvider({
        token: "test-token",
      });
      const headers = await provider.getHeaders();
      expect(headers).toEqual({ Authorization: "Bearer test-token" });
    });

    it("should read from environment variable", async () => {
      process.env.TEST_TOKEN = "env-token";
      try {
        const provider = new BearerAuthProvider({
          env_var: "TEST_TOKEN",
        });
        const headers = await provider.getHeaders();
        expect(headers).toEqual({ Authorization: "Bearer env-token" });
      } finally {
        delete process.env.TEST_TOKEN;
      }
    });
  });

  describe("createAuthProvider", () => {
    it("should create NoAuthProvider for none", () => {
      const provider = createAuthProvider("none", {});
      expect(provider).toBeInstanceOf(NoAuthProvider);
    });

    it("should create NoAuthProvider for undefined", () => {
      const provider = createAuthProvider(undefined, undefined);
      expect(provider).toBeInstanceOf(NoAuthProvider);
    });

    it("should create ApiKeyAuthProvider for api_key", () => {
      const provider = createAuthProvider("api_key", {
        api_key: "test",
        header_name: "X-Key",
        header_prefix: "",
      });
      expect(provider).toBeInstanceOf(ApiKeyAuthProvider);
    });

    it("should create BearerAuthProvider for bearer", () => {
      const provider = createAuthProvider("bearer", {
        token: "test",
      });
      expect(provider).toBeInstanceOf(BearerAuthProvider);
    });
  });
});
