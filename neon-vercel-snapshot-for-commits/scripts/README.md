# Development Scripts

This directory contains TypeScript utility scripts to streamline your development workflow with Neon database branches. All scripts are executed with Bun for fast TypeScript support.

## Setup

Before using these scripts, you need to set up the required environment variables:

### Required Environment Variables

Create a `.env` file in your project root with the following variables:

```bash
# Neon API Configuration
NEON_API_KEY=your_neon_api_key_here
NEON_PROJECT_ID=your_neon_project_id_here

# Database URL (will be automatically updated by scripts)
DATABASE_URL="your_current_database_connection_string"

# Production Database URL (used by restore-prod script)
PRODUCTION_DATABASE_URL="your_production_database_connection_string"

# Optional: Additional environment variables for your application
# NODE_ENV=development
# NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Getting Your Neon Credentials

1. **NEON_API_KEY**:
   - Go to [Neon Console Settings → API Keys](https://console.neon.tech/app/settings/api-keys)
   - Click "Generate new API key"
   - Copy the generated key

2. **NEON_PROJECT_ID**:
   - Go to your project in the Neon Console
   - Navigate to Settings page
   - Copy the Project ID (format: `dry-heart-13671059`)

## Available Scripts

### `create-snapshot`

Creates a snapshot of your production database for a specific commit ID. This is designed to be run automatically in a GitHub action after every merge to production.

**Usage:**

```bash
# Create a snapshot for a specific commit
bun run create-snapshot abc123f
# or directly
bun scripts/create-snapshot.ts abc123f
```

**What it does:**

1. 🔍 Finds your production database branch (looks for "production", "main", or default branch)
2. 📸 Creates a snapshot with naming convention: `prod-<commit-id>`
3. ⏰ Sets automatic expiration to 4 months to manage storage costs
4. 💾 Captures the exact state of your production database at commit time

**Features:**

- **Automated naming**: Uses `prod-<commit-id>` convention for easy identification
- **Smart branch detection**: Automatically finds production branch
- **Cost management**: 4-month expiration to prevent storage bloat
- **GitHub Action ready**: Designed for CI/CD integration

### `test-commit`

Synchronizes both your codebase and database to a specific commit state for debugging historical issues.

**Usage:**

```bash
# Test against both code and database state for a specific commit
bun run test-commit abc123f
# or directly
bun scripts/test-commit-id.ts abc123f
```

**What it does:**

1. 📂 Checks out your git repository to the specific commit (detached HEAD)
2. 🔍 Finds the snapshot for the specified commit (`prod-<commit-id>`)
3. 🎋 Creates a new test branch from the snapshot using multi-step restore
4. ⏰ Sets 2-week expiration on the test branch for automatic cleanup
5. 📝 Provides instructions to manually update DATABASE_URL from Neon Console

**Features:**

- **Full synchronization**: Both code AND database at the same point in time
- **Safe testing**: Non-destructive testing against historical states
- **Manual control**: User controls DATABASE_URL updates via Neon Console
- **Multi-step restore**: Creates branch without finalizing for safe testing
- **Automatic cleanup**: Test branches expire after 2 weeks
- **Git integration**: Manages git checkout automatically

### `restore-prod`

Restores both your codebase and database connection back to production state.

**Usage:**

```bash
# Restore to production state
bun run restore-prod
# or directly
bun scripts/restore-prod.ts
```

**What it does:**

1. 📂 Switches git back to production branch (main/master)
2. ⬇️ Pulls latest changes from remote
3. 📝 Restores DATABASE_URL from PRODUCTION_DATABASE_URL in .env
4. ✨ Gets you back to normal development state

**Features:**

- **Complete restoration**: Both codebase and database back to production
- **Automatic branch detection**: Finds main, master, or default branch
- **Simple environment**: Uses PRODUCTION_DATABASE_URL for restoration
- **Safe operations**: Validates git repository and environment setup

**Enhanced debugging workflow:**

```bash
# 1. Create snapshot when deploying to production (in CI/CD)
bun run create-snapshot $(git rev-parse --short HEAD)

# 2. Later, when investigating an issue that started recently
# Jump to a historical state (code synchronized automatically)
bun run test-commit abc123f

# 3. Follow the prompts to update DATABASE_URL from Neon Console
# Copy connection string from the test branch and update your .env

# 4. Test your application against the synchronized historical state
npm run dev

# 5. Issue exists at this commit? Jump to even earlier commit
bun run test-commit def456a

# 6. Issue doesn't exist? You found when it was introduced!
# When done testing, restore everything back to production
bun run restore-prod

# You're now back to normal development state
npm run dev
```

**Key advantages:**

- 🔄 **Full time travel**: Code and database perfectly synchronized
- 🎯 **Precise debugging**: Know exactly when issues were introduced
- 🛡️ **Safe operations**: Production never touched, easy restoration
- ⚡ **Fast switching**: Jump between any commit states instantly

### `init-new-feature`

Creates a new git branch and associated Neon database branch for feature development.

**Usage:**

```bash
# Provide branch name explicitly
bun run init-new-feature andrelandgraf/feature-name

# Or checkout a feature branch first and run without arguments
git checkout -b andrelandgraf/feature-name
bun run init-new-feature
```

**What it does:**

1. ✅ Creates and checks out a new git branch from `main`
2. 🔍 Finds your production database branch in Neon
3. 🎋 Creates a new Neon database branch with:
   - Copy-on-write clone of production data
   - 2-week TTL (automatic deletion)
   - Pooled connection for better performance
4. 📝 Updates `.env` with the new database connection string
5. 🎉 Provides summary and next steps

**Features:**

- **Automatic cleanup**: Database branches expire after 2 weeks
- **Pooled connections**: Uses Neon's connection pooling for better performance
- **Git integration**: Automatically manages git branches
- **Smart branch detection**: Finds production/main/default branch automatically
- **Error handling**: Comprehensive error messages and troubleshooting tips

**Example Output:**

```
🚀 Initializing new feature branch: andrelandgraf/user-authentication
📦 Creating git branch from main...
✅ Git branch 'andrelandgraf/user-authentication' created and checked out
🔍 Finding production database branch...
✅ Found production branch: production (br-morning-meadow-afu2s1jl)
🎋 Creating new Neon database branch...
✅ Neon branch created: andrelandgraf-user-authentication (br-curly-wave-af4i4oeu)
⏰ Branch will expire on: 1/15/2025
📝 Updating .env file with new database connection...
✅ .env file updated with new DATABASE_URL

🎉 Feature branch initialization complete!

┌─ Summary ─────────────────────────────────────────────────────────────────┐
│ Git Branch:     andrelandgraf/user-authentication                        │
│ Neon Branch:    andrelandgraf-user-authentication (br-curly-wave-af4i4oeu)│
│ Parent Branch:  production                                                │
│ Expires:        1/15/2025 (14 days)                                      │
│ Database URL:   Updated in .env file                                     │
│ Connection:     Pooled connection enabled                                │
└───────────────────────────────────────────────────────────────────────────┘

💡 Next steps:
   1. Run: bun run db:migrate (if needed)
   2. Start developing your feature
   3. The database branch will automatically be deleted in 2 weeks
```

## Troubleshooting

### Common Issues

1. **Missing API Key Error**

   ```
   ❌ NEON_API_KEY environment variable is required
   ```

   - Solution: Add your Neon API key to `.env` file

2. **Missing Project ID Error**

   ```
   ❌ NEON_PROJECT_ID environment variable is required
   ```

   - Solution: Add your Neon project ID to `.env` file

3. **Production Branch Not Found**

   ```
   Production branch not found. Looking for branch named 'production', 'main', or the default branch.
   ```

   - Solution: Ensure you have a branch named 'production', 'main', or set a default branch in your Neon project

4. **Git Branch Already Exists**

   ```
   fatal: A branch named 'feature-name' already exists.
   ```

   - Solution: Choose a different branch name or delete the existing branch first

### Best Practices

- **Snapshot Creation**: Always create snapshots after significant deployments
- **Environment Variables**: Keep your `.env` file secure and don't commit it to version control
- **PRODUCTION_DATABASE_URL**: Always set this to your actual production database URL
- **Git Repository**: Ensure you're in a git repository for full functionality
- **Testing Workflow**: Use restore-prod to get back to normal development state
- **Database Migrations**: Run `bun run db:migrate` after creating branches if you have pending migrations

### Prerequisites for Enhanced Scripts

- **Git repository**: Scripts require git for codebase synchronization
- **PRODUCTION_DATABASE_URL**: Must be set in .env for restore-prod script
- **Commit access**: Ensure commits you want to test are available locally (may need to fetch)
- **Node.js compatible**: Scripts use standard Node.js child_process for git operations

## Security Notes

- Never commit your `.env` file to version control
- Store API keys securely
- Use branch TTLs to avoid accumulating unused database branches
- Each database branch uses storage, so clean up regularly

## Need Help?

- [Neon Documentation](https://neon.tech/docs)
- [Neon API Reference](https://api-docs.neon.tech/reference/getting-started-with-neon-api)
- [Neon Console](https://console.neon.tech)
