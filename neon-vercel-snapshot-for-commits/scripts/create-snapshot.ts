#!/usr/bin/env bun

import type { 
  ListBranchesResponse, 
  NeonBranch, 
  CreateSnapshotRequest, 
  CreateSnapshotResponse,
  NeonApiError 
} from "./types";

async function createSnapshot(commitId: string): Promise<void> {
  // Validate commit ID format (basic validation)
  if (!commitId || commitId.length < 7) {
    console.error("❌ Invalid commit ID provided");
    console.error("   Expected format: git commit hash (at least 7 characters)");
    console.error("   Example: create-snapshot abc123f");
    process.exit(1);
  }

  // Validate required environment variables
  const neonApiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;

  if (!neonApiKey) {
    console.error("❌ NEON_API_KEY environment variable is required");
    console.error("   Get your API key from: https://console.neon.tech/app/settings/api-keys");
    process.exit(1);
  }

  if (!projectId) {
    console.error("❌ NEON_PROJECT_ID environment variable is required");
    console.error("   Find your project ID in the Neon Console Settings page");
    process.exit(1);
  }

  console.log(`📸 Creating snapshot for commit: ${commitId}`);
  
  try {
    // Step 1: Find the production branch
    console.log("🔍 Finding production database branch...");
    
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

    // Look for production branch (production -> main -> default branch)
    let productionBranch: NeonBranch | null = null;
    
    // First, try to find a branch named "production"
    productionBranch = branchesData.branches.find(b => b.name.toLowerCase() === "production") || null;
    
    // If not found, try "main"
    if (!productionBranch) {
      productionBranch = branchesData.branches.find(b => b.name.toLowerCase() === "main") || null;
    }
    
    // If still not found, use the default/primary branch
    if (!productionBranch) {
      productionBranch = branchesData.branches.find(b => b.default || b.primary) || null;
    }

    if (!productionBranch) {
      console.error("❌ Production branch not found");
      console.error("   Looking for branch named 'production', 'main', or the default branch");
      console.error("   Available branches:");
      branchesData.branches.forEach(branch => {
        const typeInfo = branch.default ? " (default)" : branch.primary ? " (primary)" : "";
        console.error(`     • ${branch.name}${typeInfo}`);
      });
      process.exit(1);
    }

    console.log(`✅ Found production branch: ${productionBranch.name} (${productionBranch.id})`);

    // Step 2: Create snapshot with naming convention: prod-<commit-id>
    const snapshotName = `prod-${commitId}`;
    console.log(`📸 Creating snapshot: ${snapshotName}...`);

    // Calculate expiration date (4 months from now)
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + 4);
    const expiresAt = expirationDate.toISOString();

    const createSnapshotRequest: CreateSnapshotRequest = {
      name: snapshotName,
      expires_at: expiresAt,
    };

    const snapshotResponse = await fetch(
      `https://console.neon.tech/api/v2/projects/${projectId}/branches/${productionBranch.id}/snapshot`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          Authorization: `Bearer ${neonApiKey}`,
        },
        body: JSON.stringify(createSnapshotRequest),
      },
    );

    if (!snapshotResponse.ok) {
      const errorData = await snapshotResponse.json();
      const error = errorData as NeonApiError;
      throw new Error(
        `Failed to create snapshot: ${snapshotResponse.status} - ${error.message || 'Unknown error'}`,
      );
    }

    const snapshotData: CreateSnapshotResponse = await snapshotResponse.json();

    console.log(`✅ Snapshot created successfully!`);
    console.log(`
┌─ Snapshot Details ───────────────────────────────────────────────────────┐
│ Snapshot Name:  ${snapshotData.snapshot.name.padEnd(50)} │
│ Snapshot ID:    ${snapshotData.snapshot.id.padEnd(50)} │
│ Source Branch:  ${productionBranch.name.padEnd(50)} │
│ Commit ID:      ${commitId.padEnd(50)} │
│ Created:        ${new Date(snapshotData.snapshot.created_at).toLocaleString().padEnd(50)} │
│ Expires:        ${new Date(snapshotData.snapshot.expires_at).toLocaleString().padEnd(50)} │
│ Status:         ${snapshotData.snapshot.status.padEnd(50)} │
└───────────────────────────────────────────────────────────────────────────┘
    `);

    console.log("🎯 Use this snapshot name for restoration:");
    console.log(`   bun scripts/test-commit-id.ts ${commitId}`);
    
    console.log("\n💡 This snapshot represents the production database state for commit:", commitId);
    console.log("   It will automatically expire in 4 months to save storage costs.");

  } catch (error) {
    console.error(`❌ Error creating snapshot: ${error instanceof Error ? error.message : String(error)}`);
    console.error("\n🔍 Troubleshooting:");
    console.error("   • Ensure NEON_API_KEY and NEON_PROJECT_ID are correct");
    console.error("   • Check that the production branch exists");
    console.error("   • Verify you have permission to create snapshots");
    console.error("   • Check your network connection");
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("❌ Commit ID is required");
  console.error("Usage: bun scripts/create-snapshot.ts <commit-id>");
  console.error("Example: bun scripts/create-snapshot.ts abc123f");
  process.exit(1);
}

const commitId = args[0];

// Run the script
createSnapshot(commitId).catch(console.error);
