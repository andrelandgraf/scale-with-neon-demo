#!/usr/bin/env bun

import { $ } from "bun";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
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

  // Add protection against deleting protected branches
  const protectedBranches = [
    "main",
    "master",
    "development",
    "dev",
    "develop",
    "production",
    "prod",
  ];
  if (protectedBranches.includes(branchName.toLowerCase())) {
    console.error(
      `❌ Cannot cleanup protected branch '${branchName}'. Protected branches: ${protectedBranches.join(", ")}`,
    );
    console.error("   This script is only for cleaning up feature branches.");
    process.exit(1);
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

  console.log(`🧹 Cleaning up feature branch: ${branchName} (Neon branch: ${branchName.replace(/[^a-zA-Z0-9-]/g, "-")})`);

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

    // Find the feature branch to delete (using same sanitization logic as init script)
    const sanitizedBranchName = branchName.replace(/[^a-zA-Z0-9-]/g, "-");
    const featureBranch = branchesData.branches.find(
      (branch) => branch.name === sanitizedBranchName,
    );

    if (!featureBranch) {
      console.warn(`⚠️  Database branch not found for '${sanitizedBranchName}' (from git branch '${branchName}')`);
      console.log("Available branches:");
      branchesData.branches.forEach((branch) => {
        console.log(`   • ${branch.name} (${branch.id})`);
      });
    } else {
      console.log(
        `✅ Found feature database branch: ${featureBranch.name} (${featureBranch.id}) from git branch '${branchName}'`,
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
      console.log("💡 You'll need to manually update your .env DATABASE_URL");
    } else {
      console.log(
        `✅ Found development branch: ${developmentBranch.name} (${developmentBranch.id})`,
      );

      // Step 4: Get development branch connection details
      console.log("🔄 Getting development branch connection details...");

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
            console.log(`✅ Found development endpoint: ${endpoint.host}`);
            console.log("💡 Please update your .env DATABASE_URL manually:");
            console.log(`   Host: ${endpoint.host}`);
            console.log("   Get the complete connection string from:");
            console.log(
              `   Neon Console → ${developmentBranch.name} branch → Connect`,
            );
            console.log("");
            console.log("   Your new DATABASE_URL should look like:");
            console.log(
              `   postgresql://username:password@${endpoint.host}/neondb?sslmode=require`,
            );
          } else {
            console.warn("⚠️  No endpoints found for development branch");
          }
        } else {
          console.warn("⚠️  Could not fetch development branch endpoints");
        }
      } catch (error) {
        console.warn(
          `⚠️  Error getting development connection details: ${error}`,
        );
      }

      console.log("💡 Manual .env update required:");
      console.log("   1. Go to Neon Console");
      console.log(`   2. Select the '${developmentBranch.name}' branch`);
      console.log("   3. Click 'Connect' to copy the connection string");
      console.log(
        "   4. Update your .env DATABASE_URL with the development connection",
      );
    }

    // Step 5: Git cleanup (always performed)
    try {
      console.log("🔄 Switching to main branch and cleaning up git branch...");
      await $`git checkout main`;
      console.log("✅ Switched to main branch");

      try {
        await $`git branch -D ${branchName}`;
        console.log(`✅ Git branch '${branchName}' deleted`);
      } catch (error) {
        // Try regular delete if force delete fails
        try {
          await $`git branch -d ${branchName}`;
          console.log(`✅ Git branch '${branchName}' deleted`);
        } catch (error2) {
          console.warn(
            `⚠️  Could not delete git branch '${branchName}': ${error2}`,
          );
          console.log(
            "💡 You may need to delete it manually if it has unmerged changes",
          );
        }
      }
    } catch (error) {
      console.warn(`⚠️  Could not switch to main branch: ${error}`);
    }

    // Step 6: Success message
    console.log("\n🎉 Feature cleanup complete!");
    console.log(`
┌─ Summary ─────────────────────────────────────────────────────────────────┐
│ Feature Branch: ${branchName.padEnd(50)} │
│ Database:       ${featureBranch ? "Deleted ✅" : "Not found ⚠️ (skipped)".padEnd(50)} │
│ Current DB:     ${developmentBranch ? `development (${developmentBranch.name})` : "development branch not found".padEnd(50)} │
│ .env Updated:   Manual update required ⚠️${" ".repeat(20)} │
│ Git Branch:     Deleted ✅ (switched to main)${" ".repeat(17)} │
└───────────────────────────────────────────────────────────────────────────┘

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
