#!/usr/bin/env bun

import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import type {
  NeonBranch,
  ListBranchesResponse,
  CreateBranchResponse,
  CreateBranchRequest,
  ConnectionUri
} from "./types";

async function initNewFeature(): Promise<void> {
  // Get branch name from command line arguments
  const branchName = process.argv[2];
  
  if (!branchName) {
    console.error("❌ Please provide a branch name: bun run init-new-feature <branch-name>");
    console.error("   Example: bun run init-new-feature andrelandgraf/feature-name");
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

  console.log(`🚀 Initializing new feature branch: ${branchName}`);

  try {
    // Step 1: Create and checkout new git branch from main
    console.log("📦 Creating git branch from main...");
    await $`git checkout main`;
    await $`git pull origin main`;
    await $`git checkout -b ${branchName}`;
    console.log(`✅ Git branch '${branchName}' created and checked out`);

    // Step 2: Get all Neon branches to find production branch
    console.log("🔍 Finding production database branch...");
    const branchesResponse = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${neonApiKey}`
      }
    });

    if (!branchesResponse.ok) {
      const errorText = await branchesResponse.text();
      throw new Error(`Failed to fetch branches: ${branchesResponse.status} ${errorText}`);
    }

    const branchesData: ListBranchesResponse = await branchesResponse.json();
    const productionBranch = branchesData.branches.find(branch => 
      branch.name === 'production' || branch.name === 'main' || branch.default === true
    );

    if (!productionBranch) {
      throw new Error("Production branch not found. Looking for branch named 'production', 'main', or the default branch.");
    }

    console.log(`✅ Found production branch: ${productionBranch.name} (${productionBranch.id})`);

    // Step 3: Create new Neon branch with TTL (2 weeks = 14 days)
    console.log("🎋 Creating new Neon database branch...");
    
    // Calculate expiration date (2 weeks from now)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 14);
    const expirationISO = expirationDate.toISOString();

    const createBranchPayload: CreateBranchRequest = {
      endpoints: [
        {
          type: "read_write",
          pooler_enabled: true
        }
      ],
      branch: {
        parent_id: productionBranch.id,
        name: branchName.replace(/[^a-zA-Z0-9-]/g, '-'), // Sanitize branch name for Neon
        expire_at: expirationISO
      }
    };

    const createResponse = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${neonApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createBranchPayload)
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create branch: ${createResponse.status} ${errorText}`);
    }

    const newBranchData: CreateBranchResponse = await createResponse.json();
    console.log(`✅ Neon branch created: ${newBranchData.branch.name} (${newBranchData.branch.id})`);
    console.log(`⏰ Branch will expire on: ${expirationDate.toLocaleDateString()}`);

    // Step 4: Get the pooled connection string
    const connectionUri = newBranchData.connection_uris[0];
    if (!connectionUri) {
      throw new Error("No connection URI received from Neon API");
    }

    // Use the pooler host if available for better performance
    const poolerHost = connectionUri.connection_parameters.pooler_host;
    const databaseUrl = poolerHost 
      ? connectionUri.connection_uri.replace(connectionUri.connection_parameters.host, poolerHost)
      : connectionUri.connection_uri;

    // Step 5: Update .env file with new DATABASE_URL
    console.log("📝 Updating .env file with new database connection...");
    
    const envPath = join(process.cwd(), '.env');
    let envContent = '';
    
    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, 'utf8');
    }

    // Update or add DATABASE_URL
    const lines = envContent.split('\n');
    let updated = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('DATABASE_URL=')) {
        lines[i] = `DATABASE_URL="${databaseUrl}"`;
        updated = true;
        break;
      }
    }
    
    if (!updated) {
      // Add DATABASE_URL if not found
      if (envContent && !envContent.endsWith('\n')) {
        lines.push('');
      }
      lines.push(`DATABASE_URL="${databaseUrl}"`);
    }

    writeFileSync(envPath, lines.join('\n'));
    console.log("✅ .env file updated with new DATABASE_URL");

    // Step 6: Success message
    console.log("\n🎉 Feature branch initialization complete!");
    console.log(`
┌─ Summary ─────────────────────────────────────────────────────────────────┐
│ Git Branch:     ${branchName.padEnd(50)} │
│ Neon Branch:    ${newBranchData.branch.name} (${newBranchData.branch.id})${' '.repeat(Math.max(0, 50 - newBranchData.branch.name.length - newBranchData.branch.id.length - 3))} │
│ Parent Branch:  ${productionBranch.name.padEnd(50)} │
│ Expires:        ${expirationDate.toLocaleDateString()} (14 days)${' '.repeat(Math.max(0, 50 - expirationDate.toLocaleDateString().length - 10))} │
│ Database URL:   Updated in .env file${' '.repeat(27)} │
│ Connection:     ${(poolerHost ? 'Pooled connection enabled' : 'Direct connection').padEnd(50)} │
└───────────────────────────────────────────────────────────────────────────┘

💡 Next steps:
   1. Run: bun run db:migrate (if needed)
   2. Start developing your feature
   3. The database branch will automatically be deleted in 2 weeks
    `);

  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error("\n🔍 Troubleshooting:");
    console.error("   • Ensure NEON_API_KEY and NEON_PROJECT_ID are set");
    console.error("   • Check that you have access to the Neon project");
    console.error("   • Verify git is properly configured");
    process.exit(1);
  }
}

// Run the script
initNewFeature().catch(console.error);
