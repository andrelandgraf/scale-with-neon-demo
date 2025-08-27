#!/usr/bin/env bun

import { execSync } from "child_process";
import type {
  ListSnapshotsResponse,
  NeonSnapshot,
  RestoreSnapshotRequest,
  RestoreSnapshotResponse,
  NeonApiError,
} from "./types";

async function testCommitId(commitId: string): Promise<void> {
  // Validate commit ID format (basic validation)
  if (!commitId || commitId.length < 7) {
    console.error("❌ Invalid commit ID provided");
    console.error(
      "   Expected format: git commit hash (at least 7 characters)",
    );
    console.error("   Example: test-commit-id abc123f");
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

  console.log(`🔍 Setting up test environment for commit: ${commitId}`);

  try {
    // Step 1: Checkout to the specific commit in git
    console.log("📂 Switching codebase to commit state...");

    // Check if we're in a git repository
    try {
      execSync("git status", { stdio: "pipe" });
    } catch (error) {
      console.error("❌ Not in a git repository or git is not available");
      console.error(
        "   This script requires git to synchronize code and database state",
      );
      process.exit(1);
    }

    // Get current branch/commit for backup information
    let currentBranch: string = "";
    try {
      currentBranch = execSync("git branch --show-current", {
        encoding: "utf8",
        stdio: "pipe",
      }).trim();
    } catch (error) {
      // Might be in detached HEAD state
    }

    if (!currentBranch) {
      // We might already be in detached HEAD state
      try {
        const currentCommit = execSync("git rev-parse --short HEAD", {
          encoding: "utf8",
          stdio: "pipe",
        }).trim();
        console.log(`📍 Currently at commit: ${currentCommit}`);
      } catch (error) {
        console.log("📍 Unable to determine current git state");
      }
    } else {
      console.log(`📍 Currently on branch: ${currentBranch}`);
    }

    // Checkout to the specific commit
    try {
      execSync(`git checkout ${commitId}`, { stdio: "pipe" });
    } catch (error) {
      console.error(`❌ Failed to checkout commit: ${commitId}`);
      console.error(
        "   Please ensure the commit hash is valid and exists in your repository",
      );
      console.error(
        "   You may need to fetch from remote if the commit is not local",
      );
      process.exit(1);
    }

    console.log(`✅ Checked out to commit: ${commitId}`);
    console.log("   Note: You are now in 'detached HEAD' state");

    // Step 2: Find the snapshot for this commit
    const snapshotName = `prod-${commitId}`;
    console.log(`📸 Looking for snapshot: ${snapshotName}...`);

    const snapshotsResponse = await fetch(
      `https://console.neon.tech/api/v2/projects/${projectId}/snapshots`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${neonApiKey}`,
        },
      },
    );

    if (!snapshotsResponse.ok) {
      const errorText = await snapshotsResponse.text();
      throw new Error(
        `Failed to fetch snapshots: ${snapshotsResponse.status} ${errorText}`,
      );
    }

    const snapshotsData: ListSnapshotsResponse = await snapshotsResponse.json();

    const targetSnapshot = snapshotsData.snapshots.find(
      (s) => s.name === snapshotName,
    );

    if (!targetSnapshot) {
      console.error(`❌ Snapshot not found: ${snapshotName}`);
      console.error("   Available snapshots:");
      snapshotsData.snapshots
        .filter((s) => s.name.startsWith("prod-"))
        .forEach((snapshot) => {
          console.error(
            `     • ${snapshot.name} (${new Date(snapshot.created_at).toLocaleDateString()})`,
          );
        });
      console.error("\n💡 Create the snapshot first:");
      console.error(`   bun scripts/create-snapshot.ts ${commitId}`);
      process.exit(1);
    }

    if (targetSnapshot.status && targetSnapshot.status !== "active") {
      console.error(`❌ Snapshot is not ready: ${targetSnapshot.status}`);
      console.error("   Wait for the snapshot to become active before testing");
      process.exit(1);
    }

    console.log(`✅ Found snapshot: ${snapshotName} (${targetSnapshot.id})`);

    // Step 3: Create a new branch from the snapshot (multi-step restore - step 1)
    const testBranchName = `test-${commitId}`;
    console.log(`🎋 Creating test branch: ${testBranchName}...`);

    // Calculate expiration date (2 weeks from now)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 14);
    const expireAt = expirationDate.toISOString();

    const restoreRequest: RestoreSnapshotRequest = {
      name: testBranchName,
      finalize_restore: false, // Multi-step restore - don't finalize yet
      expire_at: expireAt,
    };

    const restoreResponse = await fetch(
      `https://console.neon.tech/api/v2/projects/${projectId}/snapshots/${targetSnapshot.id}/restore`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${neonApiKey}`,
        },
        body: JSON.stringify(restoreRequest),
      },
    );

    if (!restoreResponse.ok) {
      const errorData = await restoreResponse.json();
      const error = errorData as NeonApiError;
      throw new Error(
        `Failed to restore snapshot: ${restoreResponse.status} - ${error.message || "Unknown error"}`,
      );
    }

    const restoreData: RestoreSnapshotResponse = await restoreResponse.json();

    const testBranch = restoreData.branch;

    console.log(
      `✅ Test branch created: ${testBranch.name} (${testBranch.id})`,
    );

    console.log(`✅ Database branch ready for testing`);

    console.log(`
┌─ Test Environment Setup ─────────────────────────────────────────────────┐
│ Commit ID:       ${commitId.padEnd(50)} │
│ Git State:       Checked out to commit (detached HEAD)${" ".padEnd(17)} │
│ Snapshot:        ${targetSnapshot.name.padEnd(50)} │
│ Test Branch:     ${testBranch.name} (${testBranch.id.padEnd(30)}) │
│ Branch Expires:  ${testBranch.expire_at ? new Date(testBranch.expire_at).toLocaleDateString() : "No expiration set".padEnd(50)} │
└───────────────────────────────────────────────────────────────────────────┘
    `);

    console.log("🎯 Code is synchronized to commit:", commitId);
    console.log(
      "📝 Now update your DATABASE_URL to connect to the test branch:",
    );
    console.log("");
    console.log("   1. Go to: https://console.neon.tech");
    console.log(`   2. Find the branch: ${testBranch.name}`);
    console.log("   3. Copy the connection string");
    console.log("   4. Update DATABASE_URL in your .env file");
    console.log("");
    console.log("🚀 Then run your application to test the historical state:");
    console.log("   npm run dev");
    console.log("");
    console.log("✨ When done testing, restore to production:");
    console.log("   bun run restore-prod");

    console.log("\n⚠️  Remember:");
    console.log("   • Code is at commit", commitId);
    console.log(
      "   • Database will be at the same historical point once you update DATABASE_URL",
    );
    console.log("   • Use restore-prod to return to normal development");
    console.log("   • Test branch will automatically expire in 2 weeks");
  } catch (error) {
    console.error(
      `❌ Error setting up test environment: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error("\n🔍 Troubleshooting:");
    console.error(
      "   • Ensure the snapshot exists (run create-snapshot first)",
    );
    console.error(
      "   • Check that NEON_API_KEY and NEON_PROJECT_ID are correct",
    );
    console.error(
      "   • Verify you have permission to create branches and access snapshots",
    );
    console.error("   • Check your network connection");
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("❌ Commit ID is required");
  console.error("Usage: bun scripts/test-commit-id.ts <commit-id>");
  console.error("Example: bun scripts/test-commit-id.ts abc123f");
  console.error("\n💡 Make sure you created the snapshot first:");
  console.error("   bun scripts/create-snapshot.ts abc123f");
  process.exit(1);
}

const commitId = args[0];

// Run the script
testCommitId(commitId).catch(console.error);
