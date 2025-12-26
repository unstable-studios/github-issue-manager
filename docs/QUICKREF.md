# Quick Reference Guide

## Commands Cheat Sheet (global `gim`)

```bash
# Initialize config in repo (auto-detects repo; override with --repo)
gim init-config

# Initialize new template
gim init --output issues.csv --example

# Lint issues (uses config if provided)
gim lint issues.csv --config .gim-config.json
gim lint issues.csv --fix --output fixed.csv --config .gim-config.json

# Import to GitHub (repo auto-detected; override with --repo)
gim import issues.csv --config .gim-config.json --dry-run
gim import issues.csv --config .gim-config.json --auto-labels --auto-milestones

# Export from GitHub (repo auto-detected; override with --repo)
gim export --output exported.csv

# Interactive migrate (map invalid fields, update config)
gim migrate issues.csv --output migrated.csv
```

`gim migrate` is interactive: it detects invalid scopes/sizes/priorities, lets you add them to the config or map them to existing values via arrow-key selection, saves aliases to `.gim-config.json`, and writes a normalized CSV.

## Issue Fields

| Field               | Required    | Type     | Valid Values (if configured)           |
| ------------------- | ----------- | -------- | -------------------------------------- |
| GFS_ID              | ✅          | UUID v4  | Auto-generated if missing with `--fix` |
| Title               | ✅          | String   | Must be unique                         |
| Milestone           | ⚠️ Optional | String   | Warned if empty                        |
| Scope               | ⚠️ Optional | Enum     | From `.gim-config.json` if provided    |
| Size                | ⚠️ Optional | Enum     | From `.gim-config.json` if provided    |
| Priority            | ⚠️ Optional | Enum     | From `.gim-config.json` if provided    |
| Description         | ⚠️ Optional | Text     | Can be multi-paragraph                 |
| Acceptance Criteria | ⚠️ Optional | Markdown | Task list recommended: `- [ ] item`    |

## CSV Formatting Tips

- **Multiline values**: Wrap in double quotes
- **Quotes in values**: Escape with double quotes (`""`)
- **Commas in values**: Wrap entire value in quotes

Example:

```csv
GFS_ID,Title,Description
abc123,"Feature with ""quotes""","Multi-line
description
here"
```

## JSON Schema

```json
{
  "version": "1.0.0",
  "issues": [
    {
      "GFS_ID": "uuid-here",
      "Title": "Issue title",
      "Milestone": "v1.0.0",
      "Scope": "frontend",
      "Size": "M",
      "Priority": "High",
      "Description": "Description here",
      "Acceptance Criteria": "- [ ] Task 1\n- [ ] Task 2"
    }
  ]
}
```

## Import Flags

| Flag                | Description                                                          |
| ------------------- | -------------------------------------------------------------------- |
| `--dry-run`         | Preview changes without making them                                  |
| `--create-only`     | Only create new issues, skip updates                                 |
| `--update-only`     | Only update existing issues, skip creation                           |
| `--auto-labels`     | Auto-create `scope:*`, `size:*`, `priority:*` labels when configured |
| `--auto-milestones` | Create missing milestones by name if they don't exist                |

## Validation Rules

### Errors (Block Import)

- Missing or invalid GFS_ID
- Missing Title
- Duplicate GFS_ID
- Invalid Scope value (when scopes configured)
- Invalid Size value (when sizes configured)
- Invalid Priority value (when priorities configured)

### Warnings (Non-blocking)

- Duplicate Title
- Empty Milestone
- Acceptance Criteria not in task list format

## GitHub Issue Format

Issues are stored in GitHub with metadata:

```markdown
<!-- GFS-ID: 123e4567-e89b-12d3-a456-426614174000 -->
<!-- GFS-HASH: abc123def456... -->

Description text goes here...

## Acceptance Criteria

- [ ] First requirement
- [ ] Second requirement
```

Labels added (with `--auto-labels` when configured):

- `scope:frontend` (or other scope)
- `size:M` (or other size)
- `priority:High` (or other priority)

## Troubleshooting

### "GitHub CLI error"

- Ensure `gh` is installed: `gh --version`
- Ensure authenticated: `gh auth status`

### "Invalid UUID"

- Run lint with `--fix` to auto-generate UUIDs
- Or manually generate: `uuidgen` (macOS/Linux)

### "Duplicate GFS_ID"

- Each issue must have unique GFS_ID
- Check for copy-paste errors in CSV/JSON

### Import creates duplicates

- Ensure GFS_ID markers are preserved in GitHub
- Re-export from GitHub to get current state
- Never manually edit GFS-ID comments in GitHub

## Best Practices

1. **Always dry-run first**: Use `--dry-run` to preview changes
2. **Validate before import**: Run `lint` command first
3. **Export regularly**: Keep a local backup with `export`
4. **Use version control**: Track CSV/JSON files in git
5. **Don't edit GFS-ID**: Never manually change GFS-ID in GitHub
6. **Consistent formatting**: Use task lists for acceptance criteria
