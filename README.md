# GitHub Issue Manager

A TypeScript-based CLI tool for bulk management of GitHub issues with idempotency guarantees. Create, update, validate, and export GitHub issues using CSV and JSON formats with the native GitHub CLI (`gh`).

## Features

✅ **Idempotent Operations** — Re-run imports safely without creating duplicates  
✅ **Stable Identity** — Each issue tracked by UUID stored in issue body  
✅ **Content Hashing** — Only update issues when content actually changes  
✅ **CSV & JSON Support** — First-class support for both formats  
✅ **Validation** — Comprehensive linting with auto-fix capabilities  
✅ **Round-trip Workflow** — Export → Edit → Re-import seamlessly  
✅ **Native GitHub CLI** — Uses `gh` CLI, no additional authentication needed

## Prerequisites

- Node.js 18+
- GitHub CLI (`gh`) installed and authenticated
- TypeScript (or use `tsx` for development)

## Install & Build

From the repo root:

```bash
npm install
npm run build
```

## Usage

### 1. Initialize Template

npm install
npm run build

````

```bash
# Create empty template
npm run cli init --output issues.csv

# Create template with examples
npm run cli init --output issues.json --format json --example
````

### 2. Lint & Validate

Validate issues before importing:

```bash
# Check for errors
npm run cli lint issues.csv

# Auto-fix errors and save
npm run cli lint issues.csv --fix --output issues-fixed.csv
```

**Validation Rules:**

- Title: Required, unique
- GFS_ID: Required, unique, valid UUID v4
- Scope: Must be one of: `frontend`, `backend`, `devops`, `documentation`, `other`
- T-Shirt Size: Must be one of: `XS`, `S`, `M`, `L`, `XL`, `XXL`
- Acceptance Criteria: Should be Markdown task lists (`- [ ] item`)
- Milestone: Optional but warned if empty

### 3. Import Issues

Create or update GitHub issues from CSV/JSON:

```bash
npm run cli init --output issues.csv
npm run cli import issues.csv --repo owner/repo --dry-run

npm run cli init --output issues.json --format json --example
npm run cli import issues.csv --repo owner/repo --auto-labels

# Only create new issues
npm run cli import issues.csv --repo owner/repo --create-only

# Only update existing issues
npm run cli lint issues.csv
```

npm run cli lint issues.csv --fix --output issues-fixed.csv

- Finds existing issues by `GFS_ID` marker in body
- Compares content hash to detect changes
- Creates or updates only if content changed
- Optionally auto-creates labels (`scope:*`, `size:*`)

- Scope: Valid only if configured in `.gim-config.json`; otherwise optional
- T-Shirt Size: Valid only if configured in `.gim-config.json`; otherwise optional
- Priority: Valid only if configured in `.gim-config.json`; otherwise optional
  Export tracked issues back to CSV or JSON:

```bash
# Export to CSV
npm run cli export --repo owner/repo --output exported.csv

# Export to JSON
npm run cli export --repo owner/repo --format json --output exported.json
```

npm run cli import issues.csv --repo owner/repo --dry-run

## File Formats

npm run cli import issues.csv --repo owner/repo --auto-labels

```csv
npm run cli import issues.csv --repo owner/repo --create-only
123e4567-e89b-12d3-a456-426614174000,Create login page,v1.0.0,frontend,M,"Build main login page","- [ ] Email input
- [ ] Password input
npm run cli import issues.csv --repo owner/repo --update-only
```

- Canonical column order
- Robust quoting for commas/newlines
- Round-trip safe

### JSON Format

```json
{
  "version": "1.0.0",
  "issues": [
    {
      "GFS_ID": "123e4567-e89b-12d3-a456-426614174000",
      "Title": "Create login page",
npm run cli export --repo owner/repo --output exported.csv
      "Scope": "frontend",
      "T-Shirt Size": "M",
npm run cli export --repo owner/repo --format json --output exported.json
      "Acceptance Criteria": "- [ ] Email input\n- [ ] Password input\n- [ ] Submit button"
    }
  ]
}
```

- Schema versioned for future extensions
  GFS_ID,Title,Milestone,Scope,T-Shirt Size,Priority,Description,Acceptance Criteria

## How It Works

### Stable Identity (GFS_ID)

Each issue is identified by a UUID stored in the issue body:

```markdown
- `Scope`, `T-Shirt Size`, and `Priority` are optional columns but will be validated when configured in `.gim-config.json`
  <!-- GFS-ID: 123e4567-e89b-12d3-a456-426614174000 -->
  <!-- GFS-HASH: abc123... -->

Issue description goes here...

## Acceptance Criteria

- [ ] Task 1
- [ ] Task 2
```

### Idempotency

The content hash is computed from:

- Description
- Acceptance Criteria
- Scope
- T-Shirt Size
- Milestone

If the hash hasn't changed, the issue is skipped during import.

### GitHub Labels

Issues can be auto-labeled with:

- `scope:<scope>` (e.g., `scope:frontend`)
- `size:<size>` (e.g., `size:M`)

## Development

```bash
# Run in dev mode
npm run dev init --example

# Build
npm run build

# Run compiled version
node dist/index.js --help
```

## Architecture

- **Language:** TypeScript (ES2020 modules)
- **Runtime:** Node.js with standard library only
- **External Dep:** GitHub CLI (`gh`)
- **Design:** Declarative, idempotent, deterministic

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── types.ts              # Core TypeScript types
├── commands/
│   ├── init.ts           # Template generation
│   ├── lint.ts           # Validation logic
│   ├── import.ts         # GitHub import with idempotency
│   └── export.ts         # GitHub export
├── formats/
│   ├── csv.ts            # CSV I/O
│   └── json.ts           # JSON I/O
└── utils/
    ├── hash.ts           # Content hashing
    └── uuid.ts           # UUID utilities
```

## Examples

### Complete Workflow

```bash
# 1. Create template with examples
npm run cli init --example --output my-issues.csv

# 2. Edit the CSV file with your issues

# 3. Validate
npm run cli lint my-issues.csv

# 4. Import (dry-run first)
npm run cli import my-issues.csv --repo myorg/myrepo --dry-run

# 5. Actually import
npm run cli import my-issues.csv --repo myorg/myrepo --auto-labels

# 6. Export later for edits
npm run cli export --repo myorg/myrepo --output updated-issues.csv

# 7. Edit and re-import (only changes are updated)
npm run cli import updated-issues.csv --repo myorg/myrepo
```

## Future Extensions

- Bulk edit → re-import loop
- Schema evolution / migrations
- Custom label mappings
- Partial imports
- Dry-run diff previews
- GitHub Project (v2) integration

## License

MIT
