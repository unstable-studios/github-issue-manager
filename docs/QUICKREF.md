# Quick Reference Guide

## Commands Cheat Sheet

```bash
# Initialize new template
npm run cli init --output issues.csv --example

# Lint issues
npm run cli lint issues.csv
npm run cli lint issues.csv --fix --output fixed.csv

# Import to GitHub
npm run cli import issues.csv --repo owner/repo --dry-run
npm run cli import issues.csv --repo owner/repo --auto-labels

# Export from GitHub
npm run cli export --repo owner/repo --output exported.csv
```

## Issue Fields

| Field               | Required    | Type     | Valid Values                                              |
| ------------------- | ----------- | -------- | --------------------------------------------------------- |
| GFS_ID              | ✅          | UUID v4  | Auto-generated if missing with `--fix`                    |
| Title               | ✅          | String   | Must be unique                                            |
| Milestone           | ⚠️ Optional | String   | Warned if empty                                           |
| Scope               | ✅          | Enum     | `frontend`, `backend`, `devops`, `documentation`, `other` |
| T-Shirt Size        | ✅          | Enum     | `XS`, `S`, `M`, `L`, `XL`, `XXL`                          |
| Description         | ⚠️ Optional | Text     | Can be multi-paragraph                                    |
| Acceptance Criteria | ⚠️ Optional | Markdown | Should use task list format: `- [ ] item`                 |

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
      "T-Shirt Size": "M",
      "Description": "Description here",
      "Acceptance Criteria": "- [ ] Task 1\n- [ ] Task 2"
    }
  ]
}
```

## Import Flags

| Flag            | Description                                |
| --------------- | ------------------------------------------ |
| `--dry-run`     | Preview changes without making them        |
| `--create-only` | Only create new issues, skip updates       |
| `--update-only` | Only update existing issues, skip creation |
| `--auto-labels` | Auto-create `scope:*` and `size:*` labels  |

## Validation Rules

### Errors (Block Import)

- Missing or invalid GFS_ID
- Missing Title
- Duplicate GFS_ID
- Invalid Scope value
- Invalid T-Shirt Size value

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

Labels added (with `--auto-labels`):

- `scope:frontend` (or other scope)
- `size:M` (or other size)

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
