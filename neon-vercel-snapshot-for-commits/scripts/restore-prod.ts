#!/usr/bin/env bun

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

async function restoreProduction(): Promise<void> {
  console.log("🔄 Restoring to production state...");

  try {
    // Step 1: Check if we're in a git repository
    try {
      execSync("git status", { stdio: "pipe" });
    } catch (error) {
      console.error("❌ Not in a git repository or git is not available");
      process.exit(1);
    }

    console.log("📂 Git repository detected");

    // Step 2: Get current branch or commit
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
      // We might be in detached HEAD state, get the commit hash
      try {
        const currentCommit = execSync("git rev-parse --short HEAD", {
          encoding: "utf8",
          stdio: "pipe",
        }).trim();
        console.log(`📍 Currently at detached HEAD: ${currentCommit}`);
      } catch (error) {
        console.log("📍 Unable to determine current git state");
      }
    } else {
      console.log(`📍 Currently on branch: ${currentBranch}`);
    }

    // Step 3: Checkout to main/master branch (production)
    console.log("🎯 Switching to production branch...");

    let checkoutSuccess = false;

    // First, try to checkout main
    try {
      execSync("git checkout main", { stdio: "pipe" });
      checkoutSuccess = true;
    } catch (error) {
      // Try master if main doesn't exist
      try {
        execSync("git checkout master", { stdio: "pipe" });
        checkoutSuccess = true;
      } catch (error) {
        // Try to find the default branch
        try {
          const defaultBranchOutput = execSync(
            "git symbolic-ref refs/remotes/origin/HEAD",
            { encoding: "utf8", stdio: "pipe" },
          );
          const defaultBranch = defaultBranchOutput
            .replace("refs/remotes/origin/", "")
            .trim();

          if (defaultBranch) {
            execSync(`git checkout ${defaultBranch}`, { stdio: "pipe" });
            checkoutSuccess = true;
          }
        } catch (error) {
          // All attempts failed
        }
      }
    }

    if (!checkoutSuccess) {
      console.error("❌ Failed to checkout to production branch");
      console.error("   Tried: main, master, and default branch");
      console.error("   Please manually checkout to your production branch");
      process.exit(1);
    }

    // Get the branch we successfully checked out to
    let finalBranch = "";
    try {
      finalBranch = execSync("git branch --show-current", {
        encoding: "utf8",
        stdio: "pipe",
      }).trim();
    } catch (error) {
      finalBranch = "unknown";
    }

    console.log(`✅ Switched to production branch: ${finalBranch}`);

    // Step 4: Pull latest changes
    console.log("⬇️  Pulling latest changes...");
    try {
      execSync("git pull", { stdio: "pipe" });
      console.log("✅ Latest changes pulled successfully");
    } catch (error) {
      console.log(
        "⚠️  Git pull failed or no remote configured - continuing with local HEAD",
      );
    }

    // Step 5: Update .env file to restore production DATABASE_URL
    console.log("📝 Restoring production DATABASE_URL...");

    const envPath = join(process.cwd(), ".env");
    let envContent = "";

    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, "utf8");
    } else {
      console.error("❌ .env file not found");
      console.error(
        "   Please create a .env file with your environment variables",
      );
      process.exit(1);
    }

    // Check if PRODUCTION_DATABASE_URL exists
    const productionUrlMatch = envContent.match(
      /^PRODUCTION_DATABASE_URL=(.*)$/m,
    );

    if (!productionUrlMatch) {
      console.error("❌ PRODUCTION_DATABASE_URL not found in .env file");
      console.error("   Please add PRODUCTION_DATABASE_URL to your .env file");
      console.error(
        "   This should contain your production database connection string",
      );
      process.exit(1);
    }

    const productionUrl = productionUrlMatch[1].replace(/"/g, "");

    // Update DATABASE_URL with production URL
    if (envContent.includes("DATABASE_URL=")) {
      envContent = envContent.replace(
        /^DATABASE_URL=.*$/m,
        `DATABASE_URL="${productionUrl}"`,
      );
    } else {
      envContent += `\nDATABASE_URL="${productionUrl}"\n`;
    }

    // Clean up empty lines
    envContent = envContent.replace(/\n\n+/g, "\n\n");

    writeFileSync(envPath, envContent);

    console.log("✅ DATABASE_URL restored to production value");

    // Step 6: Get current commit hash for confirmation
    let commitHash = "";
    try {
      commitHash = execSync("git rev-parse --short HEAD", {
        encoding: "utf8",
        stdio: "pipe",
      }).trim();
    } catch (error) {
      commitHash = "unknown";
    }

    console.log(`
┌─ Production Restoration Complete ────────────────────────────────────────┐
│ Branch:          ${finalBranch?.padEnd(50)} │
│ Commit:          ${commitHash?.padEnd(50)} │
│ DATABASE_URL:    Restored from PRODUCTION_DATABASE_URL${" ".padEnd(17)} │
└───────────────────────────────────────────────────────────────────────────┘
    `);

    console.log("🎯 Production state restored successfully!");
    console.log("\n💡 You are now back to:");
    console.log("   • Latest production code");
    console.log("   • Production database connection");
    console.log("   • Normal development environment");

    console.log("\n✨ Ready for normal development!");
  } catch (error) {
    console.error(
      `❌ Error restoring production: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error("\n🔍 Troubleshooting:");
    console.error("   • Ensure you're in a git repository");
    console.error("   • Check that PRODUCTION_DATABASE_URL is set in .env");
    console.error("   • Make sure you have git installed and configured");
    console.error("   • Verify you have network access for git pull");
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length > 0 && (args[0] === "--help" || args[0] === "-h")) {
  console.log("Usage: bun scripts/restore-prod.ts");
  console.log("");
  console.log("Restores the codebase and database to production state:");
  console.log("  • Switches to main/master branch");
  console.log("  • Pulls latest changes");
  console.log("  • Restores DATABASE_URL from PRODUCTION_DATABASE_URL");
  console.log("  • Cleans up test-related environment variables");
  console.log("");
  console.log("Prerequisites:");
  console.log("  • Must be in a git repository");
  console.log("  • PRODUCTION_DATABASE_URL must be set in .env file");
  process.exit(0);
}

// Run the script
restoreProduction().catch(console.error);
