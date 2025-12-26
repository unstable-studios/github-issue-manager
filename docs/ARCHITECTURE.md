# Architecture Documentation

## Overview

The GitHub Issue Manager is built as a TypeScript CLI tool that wraps the GitHub CLI (`gh`) to provide idempotent bulk operations on GitHub issues.

## Design Principles

1. **Declarative**: Issues are defined in human-editable files (CSV/JSON)
2. **Idempotent**: Safe to re-run without creating duplicates or unnecessary updates
3. **Deterministic**: Same input produces same output consistently
4. **Transparent**: All operations are visible and reversible

## Core Components

### 1. Identity System

Each issue is assigned a stable UUID (GFS_ID) that:

- Never changes throughout the issue's lifetime
- Is stored as HTML comment in the issue body
- Used to match issues across import/export cycles

```typescript
// UUID generation and validation
generateUUID(): string
isValidUUID(value: string): boolean
extractGfsId(body: string): string | null
insertGfsId(body: string, gfsId: string): string
```

### 2. Content Hashing

Issues are hashed to detect changes:

- Only logical fields included (not title)
- SHA-256 hash stored in issue body
- Used to skip unnecessary updates

```typescript
// Hash computation
computeContentHash(issue: Issue): string {
  return hash({
    description,
    acceptanceCriteria,
    scope,
    size,
    milestone
  })
}
```

### 3. Format Handlers

Abstract I/O operations for different formats:

**CSV Handler** (`formats/csv.ts`):

- Robust parsing with quoted field support
- Escapes commas, quotes, newlines correctly
- Maintains canonical column order

**JSON Handler** (`formats/json.ts`):

- Schema-versioned format for future compatibility
- Also supports plain array format
- Structured for machine processing

### 4. Commands

Each command is self-contained:

**init** (`commands/init.ts`):

- Generates template files
- Provides example issues
- Supports CSV and JSON output

**lint** (`commands/lint.ts`):

- Validates all issue fields
- Reports errors and warnings
- Optional auto-fix mode

**import** (`commands/import.ts`):

- Fetches existing issues via `gh`
- Matches by GFS_ID
- Compares content hash
- Creates or updates as needed

**export** (`commands/export.ts`):

- Fetches all tracked issues
- Parses back to canonical format
- Ready for re-import

## Data Flow

### Import Flow

```
CSV/JSON File
    ↓
[Read & Parse]
    ↓
[Validate]
    ↓
[Fetch Existing Issues via gh]
    ↓
[Match by GFS_ID]
    ↓
[Compare Content Hash]
    ↓
[Create or Update via gh]
```

### Export Flow

```
GitHub Repository
    ↓
[Fetch All Issues via gh]
    ↓
[Filter by GFS_ID marker]
    ↓
[Parse Issue Body]
    ↓
[Convert to Internal Format]
    ↓
[Write CSV/JSON]
```

## GitHub CLI Integration

All GitHub operations use `gh` CLI:

```typescript
// Example: Create issue
execSync(`gh issue create -R ${repo} --title "${title}" --body "${body}"`);

// Example: Fetch issues
const json = execSync(`gh issue list -R ${repo} --json number,title,body`);
```

### Why `gh` CLI?

- **No authentication needed**: Reuses existing `gh auth`
- **Simple**: No SDK dependencies or API versioning
- **Reliable**: Official GitHub tool
- **Maintainable**: Less code to maintain

## File Formats Specification

### CSV Schema

Fixed column order:

1. GFS_ID
2. Title
3. Milestone
4. Scope
5. Size
6. Description
7. Acceptance Criteria

Encoding rules:

- UTF-8 encoding
- CRLF or LF line endings
- Double-quote escaping for quotes
- Entire field quoted if contains comma/newline

### JSON Schema

```json
{
  "version": "1.0.0",
  "issues": [
    {
      "GFS_ID": "uuid",
      "Title": "string",
      "Milestone": "string",
      "Scope": "enum",
      "Size": "enum",
      "Description": "string",
      "Acceptance Criteria": "string"
    }
  ]
}
```

## Issue Body Format

GitHub issues are formatted as:

```markdown
<!-- GFS-ID: uuid -->
<!-- GFS-HASH: sha256 -->

Description content

## Acceptance Criteria

- [ ] Task 1
- [ ] Task 2
```

### Metadata Comments

- **GFS-ID**: Permanent UUID for tracking
- **GFS-HASH**: Content hash for change detection
- Both are HTML comments (invisible in rendered view)

## Type System

```typescript
// Core issue type
interface Issue {
  GFS_ID: string; // UUID v4
  Title: string; // Required
  Milestone: string; // Optional
  Scope: Scope; // Enum
  Size: TShirtSize; // Enum
  Description: string; // Markdown
  "Acceptance Criteria": string; // Markdown task list
}

// Enums
type Scope = "frontend" | "backend" | "devops" | "documentation" | "other";
type TShirtSize = "XS" | "S" | "M" | "L" | "XL" | "XXL";
```

## Validation Rules

### Errors (blocking)

1. Missing/invalid GFS_ID
2. Missing Title
3. Duplicate GFS_ID
4. Invalid Scope enum value
5. Invalid Size enum value

### Warnings (non-blocking)

1. Duplicate Title
2. Empty Milestone
3. Acceptance Criteria not in task list format

## Idempotency Guarantees

1. **No duplicate creation**: GFS_ID ensures same issue never created twice
2. **No unnecessary updates**: Content hash prevents redundant updates
3. **Deterministic output**: Same input always produces same result
4. **Safe re-runs**: Import can be run repeatedly safely

## Error Handling

```typescript
// All gh commands wrapped in try-catch
try {
  execSync("gh ...");
} catch (error) {
  throw new Error(`GitHub CLI error: ${error.message}`);
}
```

Validation errors collected and reported:

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[]; // Block execution
  warnings: string[]; // Allow execution
}
```

## Performance Considerations

- **Batch operations**: Single `gh` call to fetch all issues
- **In-memory processing**: No intermediate files
- **Lazy evaluation**: Only fetch when needed
- **Minimal API calls**: Content hash prevents unnecessary updates

## Future Architecture Extensions

### Schema Versioning

```json
{
  "version": "2.0.0",
  "schemaUrl": "https://...",
  "issues": [...]
}
```

### Custom Field Support

```typescript
interface Issue {
  // ... standard fields
  customFields?: Record<string, any>;
}
```

### Plugin System

```typescript
interface Plugin {
  beforeImport?(issue: Issue): Issue;
  afterExport?(issue: Issue): Issue;
}
```

### Diff Preview

```typescript
interface ImportPlan {
  toCreate: Issue[];
  toUpdate: Array<{ old: Issue; new: Issue }>;
  toSkip: Issue[];
}
```

## Testing Strategy

1. **Unit tests**: Each utility function
2. **Integration tests**: Command workflows
3. **E2E tests**: Full import/export cycle
4. **Validation tests**: All validation rules

## Dependencies

**Runtime**:

- Node.js 18+ (native modules only)
- GitHub CLI (`gh`)

**Development**:

- TypeScript 5.3+
- tsx (for development)
- @types/node

**Zero runtime dependencies** — everything uses Node.js built-ins.

## Security Considerations

1. **No credentials stored**: Uses `gh` auth
2. **No API keys**: Relies on GitHub CLI
3. **Input validation**: All inputs validated before processing
4. **Command injection**: All `gh` args properly escaped
5. **Local files only**: No network operations except via `gh`

## Maintenance

### Adding New Fields

1. Update `types.ts` interface
2. Update CSV column order in `formats/csv.ts`
3. Update validation in `commands/lint.ts`
4. Update body formatting in `commands/import.ts`
5. Update parsing in `commands/export.ts`

### Adding New Commands

1. Create `commands/newcmd.ts`
2. Export main function
3. Add case in `index.ts` switch
4. Update help text
5. Add to README

### Versioning

- **Major**: Breaking changes to file format or CLI
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes only
