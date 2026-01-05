/**
 * Authentication providers for MCP connections
 *
 * Handles different authentication mechanisms:
 * - API Key (header-based)
 * - Bearer Token
 * - OAuth 2.0 (client credentials flow)
 */

import type {
  AuthType,
  ApiKeyAuthConfig,
  BearerAuthConfig,
  OAuthAuthConfig,
  AuthConfig,
} from "../types.js";
import { logger } from "../utils/logger.js";

/**
 * Base interface for authentication providers
 */
export interface AuthProvider {
  /** Get authentication headers for HTTP requests */
  getHeaders(): Promise<Record<string, string>>;
  /** Refresh credentials if needed */
  refresh?(): Promise<void>;
  /** Check if credentials are valid/not expired */
  isValid(): boolean;
}

/**
 * No-op auth provider for unauthenticated connections
 */
export class NoAuthProvider implements AuthProvider {
  async getHeaders(): Promise<Record<string, string>> {
    return {};
  }

  isValid(): boolean {
    return true;
  }
}

/**
 * API Key authentication provider
 */
export class ApiKeyAuthProvider implements AuthProvider {
  private readonly apiKey: string;
  private readonly headerName: string;
  private readonly headerPrefix: string;

  constructor(config: ApiKeyAuthConfig) {
    // Resolve API key from config or environment
    if (config.api_key) {
      this.apiKey = config.api_key;
    } else if (config.env_var) {
      const envValue = process.env[config.env_var];
      if (!envValue) {
        throw new Error(
          `Environment variable ${config.env_var} is not set for API key authentication`
        );
      }
      this.apiKey = envValue;
    } else {
      throw new Error("API key authentication requires either api_key or env_var");
    }

    this.headerName = config.header_name ?? "X-API-Key";
    this.headerPrefix = config.header_prefix ?? "";
  }

  async getHeaders(): Promise<Record<string, string>> {
    return {
      [this.headerName]: `${this.headerPrefix}${this.apiKey}`,
    };
  }

  isValid(): boolean {
    return !!this.apiKey;
  }
}

/**
 * Bearer token authentication provider
 */
export class BearerAuthProvider implements AuthProvider {
  private readonly token: string;

  constructor(config: BearerAuthConfig) {
    // Resolve token from config or environment
    if (config.token) {
      this.token = config.token;
    } else if (config.env_var) {
      const envValue = process.env[config.env_var];
      if (!envValue) {
        throw new Error(
          `Environment variable ${config.env_var} is not set for bearer token authentication`
        );
      }
      this.token = envValue;
    } else {
      throw new Error("Bearer authentication requires either token or env_var");
    }
  }

  async getHeaders(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }

  isValid(): boolean {
    return !!this.token;
  }
}

/**
 * OAuth 2.0 authentication provider (client credentials flow)
 */
export class OAuthAuthProvider implements AuthProvider {
  private accessToken: string | null = null;
  private expiresAt: Date | null = null;
  private readonly config: OAuthAuthConfig;

  constructor(config: OAuthAuthConfig) {
    this.config = config;
  }

  async getHeaders(): Promise<Record<string, string>> {
    // Check if we need to refresh
    if (!this.isValid()) {
      await this.refresh();
    }

    if (!this.accessToken) {
      throw new Error("Failed to obtain OAuth access token");
    }

    return {
      Authorization: `Bearer ${this.accessToken}`,
    };
  }

  isValid(): boolean {
    if (!this.accessToken) return false;
    if (!this.expiresAt) return true;
    // Consider token expired 60 seconds before actual expiry
    return new Date() < new Date(this.expiresAt.getTime() - 60000);
  }

  async refresh(): Promise<void> {
    logger.debug("Refreshing OAuth token...");

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.client_id,
    });

    if (this.config.client_secret) {
      body.append("client_secret", this.config.client_secret);
    }

    if (this.config.scopes.length > 0) {
      body.append("scope", this.config.scopes.join(" "));
    }

    try {
      const response = await fetch(this.config.token_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OAuth token request failed: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in?: number;
        token_type?: string;
      };

      this.accessToken = data.access_token;

      if (data.expires_in) {
        this.expiresAt = new Date(Date.now() + data.expires_in * 1000);
      }

      logger.debug("OAuth token refreshed successfully");
    } catch (error) {
      logger.error(`OAuth token refresh failed: ${error}`);
      throw error;
    }
  }
}

/**
 * Create an appropriate auth provider based on configuration
 */
export function createAuthProvider(
  authType: AuthType | undefined,
  authConfig: AuthConfig | undefined
): AuthProvider {
  if (!authType || authType === "none") {
    return new NoAuthProvider();
  }

  if (!authConfig) {
    throw new Error(`Authentication type ${authType} requires auth_config`);
  }

  switch (authType) {
    case "api_key":
      return new ApiKeyAuthProvider(authConfig as ApiKeyAuthConfig);
    case "bearer":
      return new BearerAuthProvider(authConfig as BearerAuthConfig);
    case "oauth":
      return new OAuthAuthProvider(authConfig as OAuthAuthConfig);
    default:
      throw new Error(`Unsupported authentication type: ${authType}`);
  }
}
