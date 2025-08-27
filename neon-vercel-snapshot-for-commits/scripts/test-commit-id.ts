#!/usr/bin/env bun

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import type {
  ListSnapshotsResponse,
  NeonSnapshot,
  RestoreSnapshotRequest,
  RestoreSnapshotResponse,
  ConnectionUri,
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

    // Step 4: Get connection string for the new branch
    console.log("🔗 Getting connection string for test branch...");

    // Wait a moment for the branch to be fully initialized
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const connectionResponse = await fetch(
      `https://console.neon.tech/api/v2/projects/${projectId}/connection_uri?branch_id=${testBranch.id}&database_name=neondb&role_name=neondb_owner&pooled=true`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${neonApiKey}`,
        },
      },
    );

    if (!connectionResponse.ok) {
      const errorText = await connectionResponse.text();
      throw new Error(
        `Failed to get connection URI: ${connectionResponse.status} ${errorText}`,
      );
    }

    const connectionData: ConnectionUri = await connectionResponse.json();

    const newDatabaseUrl = connectionData.connection_uri;

    console.log(`✅ Connection string obtained`);

    // Step 5: Update .env file with new DATABASE_URL
    console.log("📝 Updating .env file...");

    const envPath = join(process.cwd(), ".env");
    let envContent = "";

    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, "utf8");
    }

    // Back up current DATABASE_URL
    const currentDatabaseUrlMatch = envContent.match(/^DATABASE_URL=(.*)$/m);
    const currentDatabaseUrl = currentDatabaseUrlMatch
      ? currentDatabaseUrlMatch[1].replace(/"/g, "")
      : null;

    // Create backup entry
    const backupEntry = `# Backup of original DATABASE_URL (before testing ${commitId})\nORIGINAL_DATABASE_URL=${currentDatabaseUrl || "# No previous DATABASE_URL found"}\n`;

    // Update or add DATABASE_URL
    if (envContent.includes("DATABASE_URL=")) {
      envContent = envContent.replace(
        /^DATABASE_URL=.*$/m,
        `DATABASE_URL="${newDatabaseUrl}"`,
      );
    } else {
      envContent += `\nDATABASE_URL="${newDatabaseUrl}"\n`;
    }

    // Add backup entry if not already present
    if (!envContent.includes("ORIGINAL_DATABASE_URL=")) {
      envContent = backupEntry + envContent;
    } else {
      // Update existing backup
      envContent = envContent.replace(
        /^ORIGINAL_DATABASE_URL=.*$/m,
        `ORIGINAL_DATABASE_URL=${currentDatabaseUrl || "# No previous DATABASE_URL found"}`,
      );
    }

    writeFileSync(envPath, envContent);

    console.log(`✅ .env file updated with test branch connection`);

    console.log(`
┌─ Test Environment Setup ─────────────────────────────────────────────────┐
│ Commit ID:       ${commitId.padEnd(50)} │
│ Git State:       Checked out to commit (detached HEAD)${" ".padEnd(17)} │
│ Snapshot:        ${targetSnapshot.name.padEnd(50)} │
│ Test Branch:     ${testBranch.name} (${testBranch.id.padEnd(30)}) │
│ Database URL:    Updated in .env file${" ".padEnd(34)} │
│ Original URL:    Backed up as ORIGINAL_DATABASE_URL${" ".padEnd(20)} │
│ Branch Expires:  ${testBranch.expire_at ? new Date(testBranch.expire_at).toLocaleDateString() : "No expiration set".padEnd(50)} │
└───────────────────────────────────────────────────────────────────────────┘
    `);

    console.log("🎯 Test environment is ready!");
    console.log(
      "\n💡 Both codebase and database are now synchronized to commit:",
      commitId,
    );
    console.log("\n✨ Next steps:");
    console.log(
      "   1. Run your application to test against the historical state",
    );
    console.log("   2. Investigate if the issue existed at this commit");
    console.log("   3. When done testing, restore to production:");
    console.log("      bun scripts/restore-prod.ts");
    console.log(
      "   4. Or manually restore DATABASE_URL from ORIGINAL_DATABASE_URL",
    );

    console.log("\n⚠️  Remember:");
    console.log("   • Both code AND database are at commit", commitId, "state");
    console.log(
      "   • You are in detached HEAD state - use restore-prod to return to normal",
    );
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
