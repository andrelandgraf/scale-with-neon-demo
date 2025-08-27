#!/usr/bin/env bun

import { $ } from "bun";
import type { ListBranchesResponse } from "./types";

async function cleanupFeature(): Promise<void> {
  // Get branch name from command line arguments or infer from current git branch
  let branchName = process.argv[2];

  if (!branchName) {
    // Try to infer from current git branch
    try {
      const result = await $`git branch --show-current`.text();
      const currentBranch = result.trim();

      if (
        currentBranch &&
        currentBranch !== "main" &&
        currentBranch !== "master" &&
        currentBranch !== "development"
      ) {
        branchName = currentBranch;
        console.log(`🔍 Using current git branch for cleanup: ${branchName}`);
      } else {
        console.error(
          "❌ Please provide a feature branch name or switch to the feature branch:",
        );
        console.error("   Usage: bun run cleanup-feature [branch-name]");
        console.error(
          "   Example: bun run cleanup-feature andrelandgraf/feature-name",
        );
        console.error(
          "   Or checkout the feature branch first and run without arguments",
        );
        process.exit(1);
      }
    } catch (error) {
      console.error(
        "❌ Could not determine current git branch. Please provide a branch name:",
      );
      console.error("   Usage: bun run cleanup-feature <branch-name>");
      console.error(
        "   Example: bun run cleanup-feature andrelandgraf/feature-name",
      );
      process.exit(1);
    }
  }

  // Validate required environment variables
  const neonApiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;

  if (!neonApiKey) {
    console.error("❌ NEON_API_KEY environment variable is required");
    console.error(
      "   Get your API key from: https://console.neon.tech/app/settings/api-keys",
    );
    process.exit(1);
  }

  if (!projectId) {
    console.error("❌ NEON_PROJECT_ID environment variable is required");
    console.error("   Find your project ID in the Neon Console Settings page");
    process.exit(1);
  }

  console.log(`🧹 Cleaning up feature branch: ${branchName}`);

  try {
    // Step 1: Get all Neon branches to find the feature branch and development branch
    console.log("🔍 Finding database branches...");
    const branchesResponse = await fetch(
      `https://console.neon.tech/api/v2/projects/${projectId}/branches`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${neonApiKey}`,
        },
      },
    );

    if (!branchesResponse.ok) {
      const errorText = await branchesResponse.text();
      throw new Error(
        `Failed to fetch branches: ${branchesResponse.status} ${errorText}`,
      );
    }

    const branchesData: ListBranchesResponse = await branchesResponse.json();

    // Find the feature branch to delete (sanitized name matching the creation logic)
    const sanitizedBranchName = branchName.replace(/[^a-zA-Z0-9-]/g, "-");
    const featureBranch = branchesData.branches.find(
      (branch) =>
        branch.name === sanitizedBranchName || branch.name === branchName,
    );

    if (!featureBranch) {
      console.warn(
        `⚠️  Database branch not found for '${branchName}' (also tried '${sanitizedBranchName}')`,
      );
      console.log("Available branches:");
      branchesData.branches.forEach((branch) => {
        console.log(`   • ${branch.name} (${branch.id})`);
      });
    } else {
      console.log(
        `✅ Found feature database branch: ${featureBranch.name} (${featureBranch.id})`,
      );

      // Step 2: Delete the feature branch
      console.log("🗑️  Deleting feature database branch...");
      const deleteResponse = await fetch(
        `https://console.neon.tech/api/v2/projects/${projectId}/branches/${featureBranch.id}`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${neonApiKey}`,
          },
        },
      );

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        throw new Error(
          `Failed to delete branch: ${deleteResponse.status} ${errorText}`,
        );
      }

      console.log(
        `✅ Database branch '${featureBranch.name}' deleted successfully`,
      );
    }

    // Step 3: Find development branch for connection string
    console.log("🔍 Finding development database branch...");
    const developmentBranch = branchesData.branches.find(
      (branch) =>
        branch.name === "development" ||
        branch.name === "dev" ||
        branch.name === "develop",
    );

    if (!developmentBranch) {
      console.warn(
        "⚠️  Development branch not found. Looking for branches named 'development', 'dev', or 'develop'",
      );
      console.log("Available branches:");
      branchesData.branches.forEach((branch) => {
        console.log(`   • ${branch.name} (${branch.id})`);
      });
      console.log("💡 You may need to manually update your .env DATABASE_URL");
      return;
    }

    console.log(
      `✅ Found development branch: ${developmentBranch.name} (${developmentBranch.id})`,
    );

    // Step 4: Attempt to get connection details for development branch
    console.log(
      "🔗 Attempting to update with development branch connection...",
    );

    let databaseUrl = "";
    let shouldUpdateEnv = false;

    try {
      // Get the endpoints for the development branch
      const endpointsResponse = await fetch(
        `https://console.neon.tech/api/v2/projects/${projectId}/branches/${developmentBranch.id}/endpoints`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${neonApiKey}`,
          },
        },
      );

      if (endpointsResponse.ok) {
        const endpointsData = await endpointsResponse.json();
        const endpoint = endpointsData.endpoints?.[0];

        if (endpoint) {
          // For simplicity, we'll inform the user to manually update the connection
          // since getting the password requires additional API calls that might fail
          console.log(`✅ Found development endpoint: ${endpoint.host}`);
          console.log(
            "💡 Please update your .env DATABASE_URL with the development branch connection:",
          );
          console.log(`   Host: ${endpoint.host}`);
          console.log(
            "   Get the full connection string from Neon Console → Development Branch → Connect",
          );
          shouldUpdateEnv = false;
        }
      }
    } catch (error) {
      console.warn(
        "⚠️  Could not get development branch connection details automatically",
      );
    }

    if (!shouldUpdateEnv) {
      console.log(
        "⚠️  Skipping automatic .env update - please manually update DATABASE_URL",
      );
      console.log("   1. Go to Neon Console");
      console.log("   2. Select your development branch");
      console.log("   3. Click 'Connect' to get the connection string");
      console.log(
        "   4. Update your .env DATABASE_URL with the development connection",
      );
    }

    // Note: .env update is skipped - manual update required

    // Step 5: Optional git cleanup
    const shouldDeleteGitBranch =
      process.argv.includes("--delete-git-branch") ||
      process.argv.includes("-g");

    if (shouldDeleteGitBranch) {
      try {
        console.log("🗑️  Cleaning up git branch...");
        await $`git checkout main`;
        await $`git branch -D ${branchName}`;
        console.log(`✅ Git branch '${branchName}' deleted`);
      } catch (error) {
        console.warn(`⚠️  Could not delete git branch: ${error}`);
      }
    }

    // Step 6: Success message
    console.log("\n🎉 Feature cleanup complete!");
    console.log(`
┌─ Summary ─────────────────────────────────────────────────────────────────┐
│ Feature Branch: ${branchName.padEnd(50)} │
│ Database:       ${featureBranch ? "Deleted ✅" : "Not found ⚠️ ".padEnd(50)} │
│ Current DB:     development (${developmentBranch.name})${" ".repeat(Math.max(0, 50 - developmentBranch.name.length - 15))} │
│ .env Updated:   Manual update required${" ".repeat(26)} │
│ Git Branch:     ${shouldDeleteGitBranch ? "Deleted ✅" : "Kept (use -g to delete)".padEnd(50)} │
└───────────────────────────────────────────────────────────────────────────┘

💡 Next steps:
   ${shouldDeleteGitBranch ? "1. You're back on main branch" : "1. Switch to main: git checkout main"}
   2. Update .env DATABASE_URL with development branch connection
   3. Continue with other features
    `);
  } catch (error) {
    console.error(
      `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error("\n🔍 Troubleshooting:");
    console.error("   • Ensure NEON_API_KEY and NEON_PROJECT_ID are set");
    console.error("   • Check that you have access to the Neon project");
    console.error("   • Verify the branch name is correct");
    console.error("   • Make sure development branch exists");
    process.exit(1);
  }
}

// Run the script
cleanupFeature().catch(console.error);
