/**
 * Example: Integrating generated skills with a chatbot
 * 
 * This example shows how to use mcp2skills in a multi-user chatbot scenario
 * with proper authentication management.
 */

import { RuntimeAuthManager } from "../dist/runtime/index.js";

// In a real app, you would import from your generated skills:
// import { RuntimeAuthManager, filesystem, github } from "./generated_skills/index.js";

// ============================================================================
// Setup
// ============================================================================

const authManager = new RuntimeAuthManager();

// Add server configurations
authManager.addServerConfig({
  name: "filesystem",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
});

authManager.addServerConfig({
  name: "github",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
});

// ============================================================================
// User Authentication Flow
// ============================================================================

async function onUserLogin(userId: string, githubToken: string): Promise<void> {
  // Authenticate the user's session for GitHub
  await authManager.authenticateSession(userId, "github", {
    authType: "bearer",
    accessToken: githubToken,
  });
  
  // Filesystem doesn't need auth
  console.log(`User ${userId} authenticated for GitHub`);
}

async function onUserLogout(userId: string): Promise<void> {
  await authManager.closeSession(userId);
  console.log(`User ${userId} session closed`);
}

// ============================================================================
// Skill Execution
// ============================================================================

async function handleUserRequest(
  userId: string,
  skillName: string,
  serverName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  // Check if authenticated (for servers that need it)
  if (!authManager.isAuthenticated(userId, serverName)) {
    throw new Error(`User ${userId} is not authenticated for ${serverName}`);
  }
  
  // Get context for this user/server
  const context = authManager.getOrCreateSession(userId, serverName);
  
  // Execute the skill
  const result = await context.callTool(skillName, params);
  
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "Unknown error");
  }
}

// ============================================================================
// Example Usage
// ============================================================================

async function main(): Promise<void> {
  const userId = "user-123";
  
  try {
    // User logs in with their GitHub token
    await onUserLogin(userId, process.env.GITHUB_TOKEN || "demo-token");
    
    // Example: List files (filesystem doesn't need auth)
    console.log("\n📁 Listing files...");
    const files = await handleUserRequest(
      userId,
      "list_directory",
      "filesystem",
      { path: "/tmp" }
    );
    console.log("Files:", files);
    
    // Example: Search GitHub (uses user's token)
    console.log("\n🔍 Searching GitHub...");
    try {
      const repos = await handleUserRequest(
        userId,
        "search_repositories",
        "github",
        { query: "mcp" }
      );
      console.log("Repos:", repos);
    } catch (error) {
      console.log("GitHub search failed (expected in demo):", error);
    }
    
  } finally {
    // Cleanup
    await onUserLogout(userId);
    await authManager.shutdown();
  }
}

// Only run if this is the main module
// main().catch(console.error);

export { authManager, onUserLogin, onUserLogout, handleUserRequest };
