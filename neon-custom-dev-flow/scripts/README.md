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

- **Branch Naming**: Use descriptive names like `andrelandgraf/user-authentication`
- **Regular Cleanup**: The script automatically sets TTL, but you can manually delete branches early if needed
- **Environment Variables**: Keep your `.env` file secure and don't commit it to version control
- **Database Migrations**: Run `bun run db:migrate` after creating a new branch if you have pending migrations

## Security Notes

- Never commit your `.env` file to version control
- Store API keys securely
- Use branch TTLs to avoid accumulating unused database branches
- Each database branch uses storage, so clean up regularly

## Need Help?

- [Neon Documentation](https://neon.tech/docs)
- [Neon API Reference](https://api-docs.neon.tech/reference/getting-started-with-neon-api)
- [Neon Console](https://console.neon.tech)
