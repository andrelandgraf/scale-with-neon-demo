#!/usr/bin/env bun

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import type { 
  ListSnapshotsResponse, 
  NeonSnapshot, 
  RestoreSnapshotRequest, 
  RestoreSnapshotResponse,
  ConnectionUri,
  NeonApiError 
} from "./types";

async function testCommitId(commitId: string): Promise<void> {
  // Validate commit ID format (basic validation)
  if (!commitId || commitId.length < 7) {
    console.error("❌ Invalid commit ID provided");
    console.error("   Expected format: git commit hash (at least 7 characters)");
    console.error("   Example: test-commit-id abc123f");
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

  console.log(`🔍 Setting up test environment for commit: ${commitId}`);
  
  try {
    // Step 1: Find the snapshot for this commit
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
    const targetSnapshot = snapshotsData.snapshots.find(s => s.name === snapshotName);

    if (!targetSnapshot) {
      console.error(`❌ Snapshot not found: ${snapshotName}`);
      console.error("   Available snapshots:");
      snapshotsData.snapshots
        .filter(s => s.name.startsWith("prod-"))
        .forEach(snapshot => {
          console.error(`     • ${snapshot.name} (${new Date(snapshot.created_at).toLocaleDateString()})`);
        });
      console.error("\n💡 Create the snapshot first:");
      console.error(`   bun scripts/create-snapshot.ts ${commitId}`);
      process.exit(1);
    }

    if (targetSnapshot.status !== "active") {
      console.error(`❌ Snapshot is not ready: ${targetSnapshot.status}`);
      console.error("   Wait for the snapshot to become active before testing");
      process.exit(1);
    }

    console.log(`✅ Found snapshot: ${snapshotName} (${targetSnapshot.id})`);

    // Step 2: Create a new branch from the snapshot (multi-step restore - step 1)
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
          "Accept": "application/json",
          Authorization: `Bearer ${neonApiKey}`,
        },
        body: JSON.stringify(restoreRequest),
      },
    );

    if (!restoreResponse.ok) {
      const errorData = await restoreResponse.json();
      const error = errorData as NeonApiError;
      throw new Error(
        `Failed to restore snapshot: ${restoreResponse.status} - ${error.message || 'Unknown error'}`,
      );
    }

    const restoreData: RestoreSnapshotResponse = await restoreResponse.json();
    const testBranch = restoreData.branch;

    console.log(`✅ Test branch created: ${testBranch.name} (${testBranch.id})`);

    // Step 3: Get connection string for the new branch
    console.log("🔗 Getting connection string for test branch...");
    
    // Wait a moment for the branch to be fully initialized
    await new Promise(resolve => setTimeout(resolve, 2000));

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

    // Step 4: Update .env file with new DATABASE_URL
    console.log("📝 Updating .env file...");
    
    const envPath = join(process.cwd(), ".env");
    let envContent = "";

    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, "utf8");
    }

    // Back up current DATABASE_URL
    const currentDatabaseUrlMatch = envContent.match(/^DATABASE_URL=(.*)$/m);
    const currentDatabaseUrl = currentDatabaseUrlMatch ? currentDatabaseUrlMatch[1].replace(/"/g, "") : null;

    // Create backup entry
    const backupEntry = `# Backup of original DATABASE_URL (before testing ${commitId})\nORIGINAL_DATABASE_URL=${currentDatabaseUrl || "# No previous DATABASE_URL found"}\n`;

    // Update or add DATABASE_URL
    if (envContent.includes("DATABASE_URL=")) {
      envContent = envContent.replace(
        /^DATABASE_URL=.*$/m,
        `DATABASE_URL="${newDatabaseUrl}"`
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
        `ORIGINAL_DATABASE_URL=${currentDatabaseUrl || "# No previous DATABASE_URL found"}`
      );
    }

    writeFileSync(envPath, envContent);

    console.log(`✅ .env file updated with test branch connection`);

    console.log(`
┌─ Test Environment Setup ─────────────────────────────────────────────────┐
│ Commit ID:       ${commitId.padEnd(50)} │
│ Snapshot:        ${targetSnapshot.name.padEnd(50)} │
│ Test Branch:     ${testBranch.name} (${testBranch.id.padEnd(30)}) │
│ Database URL:    Updated in .env file${" ".padEnd(34)} │
│ Original URL:    Backed up as ORIGINAL_DATABASE_URL${" ".padEnd(20)} │
│ Branch Expires:  ${testBranch.expire_at ? new Date(testBranch.expire_at).toLocaleDateString() : "No expiration set".padEnd(50)} │
└───────────────────────────────────────────────────────────────────────────┘
    `);

    console.log("🎯 Test environment is ready!");
    console.log("\n💡 Next steps:");
    console.log("   1. Run your application to test against the restored database state");
    console.log("   2. Investigate if the issue existed at this commit");
    console.log("   3. When done, restore the original DATABASE_URL:");
    console.log("      - Check the ORIGINAL_DATABASE_URL in your .env file");
    console.log("      - Update DATABASE_URL back to the original value");
    console.log(`   4. Optionally delete the test branch: ${testBranch.id}`);

    console.log("\n⚠️  Remember:");
    console.log("   • This branch contains a snapshot of your production data at the time of commit", commitId);
    console.log("   • Make sure to restore your original DATABASE_URL when testing is complete");
    console.log("   • The test branch will automatically expire based on your project settings");

  } catch (error) {
    console.error(`❌ Error setting up test environment: ${error instanceof Error ? error.message : String(error)}`);
    console.error("\n🔍 Troubleshooting:");
    console.error("   • Ensure the snapshot exists (run create-snapshot first)");
    console.error("   • Check that NEON_API_KEY and NEON_PROJECT_ID are correct");
    console.error("   • Verify you have permission to create branches and access snapshots");
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
