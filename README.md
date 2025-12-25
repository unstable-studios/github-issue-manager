# GitHub Issue Manager (gim)

TypeScript CLI for bulk GitHub issues with idempotent import/export, CSV/JSON round-tripping, and optional validation driven by repo config.

## Prerequisites

- Node.js 18+
- GitHub CLI `gh` (authenticated: `gh auth status`)

## Install (global)

```bash
npm install -g .
gim --help
```

## Quick Start (global usage)

```bash
# 1) Generate a config in your repo (scopes/sizes/priorities optional)
gim init-config              # auto-detects owner/repo from git remote; override with --repo

# 2) Create a starter CSV (with sample issues)
gim init --output issues.csv --example

# 3) Lint before importing
gim lint issues.csv --config .gim-config.json

# 4) Dry-run import
gim import issues.csv --config .gim-config.json --dry-run   # auto-detects repo

# 5) Apply changes (auto-labels optional)
gim import issues.csv --config .gim-config.json --auto-labels

# 6) Export later for edits
gim export --output exported.csv
```

Notes:

- Auto-detects GitHub repo from your git remote; use `--repo` to override.
- Auto-detects `.gim-config.json` in the current repo; use `--config` to override.
- `Scope`, `T-Shirt Size`, and `Priority` are validated only when defined in `.gim-config.json`; otherwise they remain optional.
- Acceptance Criteria supports multiline Markdown (task lists recommended: `- [ ] item`).
- Idempotent: issues carry `GFS_ID` and `GFS-HASH` markers; imports update only when content hash changes.

## CSV Format

Canonical column order:
`GFS_ID,Title,Milestone,Scope,T-Shirt Size,Priority,Description,Acceptance Criteria`

Example:

```csv
123e4567-e89b-12d3-a456-426614174000,Create login page,v1.0.0,frontend,M,High,"Build main login page","- [ ] Email input
- [ ] Password input
- [ ] Submit button"
```

## JSON Format

```json
{
  "version": "1.0.0",
  "issues": [
    {
      "GFS_ID": "123e4567-e89b-12d3-a456-426614174000",
      "Title": "Create login page",
      "Milestone": "v1.0.0",
      "Scope": "frontend",
      "T-Shirt Size": "M",
      "Priority": "High",
      "Description": "Build main login page",
      "Acceptance Criteria": "- [ ] Email input\n- [ ] Password input\n- [ ] Submit button"
    }
  ]
}
```

## Commands

- `gim init-config [--repo owner/repo]` — generate `.gim-config.json` (auto-detects repo from git remote unless overridden).
- `gim validate-config --config .gim-config.json` — validate your config file.
- `gim init --output issues.csv|json [--example] [--format json]` — create a blank or sample issue set.
- `gim lint <file>` — validate CSV/JSON; supports `--config`, `--fix`, `--output`.
- `gim import <file> [--repo owner/repo]` — idempotent create/update via `gh`; supports `--dry-run`, `--auto-labels`, `--create-only`, `--update-only` (repo auto-detected when omitted).
- `gim export [--repo owner/repo] --output exported.csv` — round-trip export (CSV or `--format json`; repo auto-detected when omitted).
- `gim migrate <file> [--output migrated.csv]` — interactive migration that fixes missing `GFS_ID`, validates fields against config, lets you add/alias/map invalid scopes/sizes/priorities via arrow-key prompts, updates the config, and writes a normalized CSV.

## Config (`.gim-config.json`)

Fields are optional; validation applies only when lists are present:

```json
{
  "scopes": ["frontend", "backend", "devops"],
  "sizes": ["XS", "S", "M", "L", "XL"],
  "priorities": ["P0", "P1", "P2"],
  "milestones": ["v1.0.0", "v1.1.0"]
}
```

## Development (repo contributors)

```bash
npm install
npm run build
npm run dev -- --help       # tsx entry
npm run cli -- --help       # compiled entry
```

## How It Works

- Identity: `GFS_ID` stored in issue body markers; hash (`GFS-HASH`) covers description, acceptance criteria, milestone, scope, size, priority.
- Imports: find issues by `GFS_ID`, update only on hash change; safe to re-run.
- Labels: optional auto-labels `scope:<value>`, `size:<value>`, `priority:<value>` when configured.

## Project Structure

```
src/
├── commands/       # init, lint, import, export, config, migrate
├── formats/        # csv/json parsers
├── utils/          # hashing, uuid, migration helpers
├── types.ts        # shared types
└── index.ts        # CLI entry
```

## License

MIT
