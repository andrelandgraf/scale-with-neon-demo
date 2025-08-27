#!/usr/bin/env bun

import { URL } from "url";

import type { ListBranchesResponse, NeonBranch } from "./types";

interface EndpointResponse {
  endpoints: Array<{
    id: string;
    host: string;
    branch_id: string;
    type: "read_write" | "read_only";
    pooler_enabled: boolean;
    current_state: string;
  }>;
}

function extractHostFromDatabaseUrl(databaseUrl: string): string | null {
  try {
    const url = new URL(databaseUrl);
    return url.hostname;
  } catch (error) {
    return null;
  }
}

function extractEndpointIdFromHost(host: string): string | null {
  // Neon hosts follow patterns like:
  // ep-cool-darkness-123456.c-2.us-west-2.aws.neon.tech (direct)
  // ep-cool-darkness-123456-pooler.c-2.us-west-2.aws.neon.tech (pooled)
  const match = host.match(/^(ep-[a-z0-9-]+)(?:-pooler)?\..*\.neon\.tech$/);
  return match ? match[1] : null;
}

async function whichDatabase(): Promise<void> {
  // Get DATABASE_URL from environment
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable not found");
    console.error("   Make sure you have a .env file with DATABASE_URL set");
    process.exit(1);
  }

  console.log(`🔍 Checking which database branch is currently connected...`);
  console.log(`📊 Database URL: ${databaseUrl.replace(/:[^:@]+@/, ":***@")}`); // Hide password

  // Extract host from DATABASE_URL
  const host = extractHostFromDatabaseUrl(databaseUrl);
  if (!host) {
    console.error("❌ Could not parse DATABASE_URL");
    console.error(
      "   Expected format: postgresql://user:password@host/database",
    );
    process.exit(1);
  }

  console.log(`🌐 Host: ${host}`);

  // Extract endpoint ID from host
  const endpointId = extractEndpointIdFromHost(host);
  if (!endpointId) {
    console.error("❌ Could not extract endpoint ID from host");
    console.error(
      "   Expected Neon hostname format: ep-xxxxx-xxxxx.region.aws.neon.tech",
    );
    process.exit(1);
  }

  console.log(`🔌 Endpoint ID: ${endpointId}`);

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

  try {
    // Step 1: Get all branches
    console.log("📋 Fetching all database branches...");
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
    console.log(`✅ Found ${branchesData.branches.length} branches`);

    // Step 2: Get endpoints for each branch to find matching host
    console.log("🔍 Searching for matching endpoint...");

    let matchingBranch: NeonBranch | null = null;
    let matchingEndpoint: any = null;

    for (const branch of branchesData.branches) {
      try {
        const endpointsResponse = await fetch(
          `https://console.neon.tech/api/v2/projects/${projectId}/branches/${branch.id}/endpoints`,
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${neonApiKey}`,
            },
          },
        );

        if (endpointsResponse.ok) {
          const endpointsData: EndpointResponse =
            await endpointsResponse.json();

          for (const endpoint of endpointsData.endpoints) {
            // Check if this endpoint matches our host
            // Handle both direct and pooled connections
            const directMatch = endpoint.host === host;
            const pooledHost = endpoint.host.replace(
              /^(ep-[a-z0-9-]+)\./,
              "$1-pooler.",
            );
            const pooledMatch = pooledHost === host;
            const endpointIdMatch = endpoint.id === endpointId;

            if (directMatch || pooledMatch || endpointIdMatch) {
              matchingBranch = branch;
              matchingEndpoint = endpoint;
              break;
            }
          }

          if (matchingBranch) break;
        }
      } catch (error) {
        // Skip this branch if we can't get its endpoints
        continue;
      }
    }

    // Step 3: Report results
    if (matchingBranch && matchingEndpoint) {
      console.log("\n🎯 Match found!");
      console.log(`
┌─ Current Database Branch ────────────────────────────────────────────────┐
│ Branch Name:    ${matchingBranch.name.padEnd(50)} │
│ Branch ID:      ${matchingBranch.id.padEnd(50)} │
│ Branch Type:    ${(matchingBranch.default ? "Default" : matchingBranch.primary ? "Primary" : "Child").padEnd(50)} │
│ Parent Branch:  ${(matchingBranch.parent_id ? branchesData.branches.find((b) => b.id === matchingBranch.parent_id)?.name || "Unknown" : "None (Root)").padEnd(50)} │
│ Protected:      ${(matchingBranch.protected ? "Yes" : "No").padEnd(50)} │
│ Endpoint:       ${matchingEndpoint.host.padEnd(50)} │
│ Connection:     ${(matchingEndpoint.pooler_enabled ? "Pooled" : "Direct").padEnd(50)} │
│ State:          ${matchingEndpoint.current_state.padEnd(50)} │
│ Created:        ${new Date(matchingBranch.created_at).toLocaleDateString().padEnd(50)} │
└───────────────────────────────────────────────────────────────────────────┘
      `);

      // Show branch hierarchy if it's a child branch
      if (matchingBranch.parent_id) {
        console.log("📊 Branch Hierarchy:");
        let currentBranch = matchingBranch;
        const hierarchy = [currentBranch.name];

        // Walk up the parent chain
        while (currentBranch.parent_id) {
          const parentBranch = branchesData.branches.find(
            (b) => b.id === currentBranch.parent_id,
          );
          if (parentBranch) {
            hierarchy.unshift(parentBranch.name);
            currentBranch = parentBranch;
          } else {
            break;
          }
        }

        console.log(`   ${hierarchy.join(" → ")}`);
      }

      // Show expiration if set
      if (matchingBranch.expire_at) {
        const expirationDate = new Date(matchingBranch.expire_at);
        const now = new Date();
        const daysUntilExpiration = Math.ceil(
          (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );

        console.log(
          `⏰ Branch expires in ${daysUntilExpiration} days (${expirationDate.toLocaleDateString()})`,
        );

        if (daysUntilExpiration <= 3) {
          console.log("🚨 Warning: Branch expires soon!");
        }
      }

      // Success output for scripting (last line)
      console.log(`\n📋 Branch: ${matchingBranch.name}`);
    } else {
      console.log("\n❌ No matching branch found");
      console.log("🔍 Possible reasons:");
      console.log("   • DATABASE_URL points to a different Neon project");
      console.log("   • The database branch was deleted");
      console.log("   • Invalid or malformed DATABASE_URL");
      console.log("   • Network connectivity issues");

      console.log("\n📋 Available branches:");
      branchesData.branches.forEach((branch) => {
        const typeInfo = branch.default
          ? " (default)"
          : branch.primary
            ? " (primary)"
            : "";
        console.log(`   • ${branch.name}${typeInfo} - ${branch.id}`);
      });

      process.exit(1);
    }
  } catch (error) {
    console.error(
      `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error("\n🔍 Troubleshooting:");
    console.error("   • Ensure NEON_API_KEY and NEON_PROJECT_ID are set");
    console.error("   • Check that DATABASE_URL is valid");
    console.error("   • Verify you have access to the Neon project");
    console.error("   • Check your network connection");
    process.exit(1);
  }
}

// Run the script
whichDatabase().catch(console.error);
