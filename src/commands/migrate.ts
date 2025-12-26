import { readFileSync, writeFileSync, existsSync } from 'fs';
import readline from 'readline';
import { generateUUID } from '../utils/uuid.js';
import { loadConfig } from './config.js';
import type { Issue } from '../types.js';
import type { RepoConfig } from '../config.js';

const HEADERS: (keyof Issue)[] = [
  'GFS_ID',
  'Title',
  'Milestone',
  'Scope',
  'Size',
  'Priority',
  'Description',

];

function normalizeHeader(header: string): keyof Issue | null {
  const h = header.trim().toLowerCase();
  if (h === 'gfs_id' || h === 'gfs-id' || h === 'gfs id') return 'GFS_ID';
  if (h === 'title') return 'Title';
  if (h === 'milestone') return 'Milestone';
  if (h === 'scope') return 'Scope';
  if (h === 'size' ) return 'Size';
  if (h === 'priority') return 'Priority';
  if (h === 'description') return 'Description';
  if (h.startsWith('acceptance criteria')) return 'Acceptance Criteria';
  return null;
}

type FieldKey = 'Scope' | 'Size' | 'Priority';

interface FieldConfig {
  field: FieldKey;
  label: string;
  listKey: keyof RepoConfig;
  aliasKey: keyof RepoConfig;
}

const FIELD_CONFIGS: FieldConfig[] = [
  { field: 'Scope', label: 'Scope', listKey: 'scopes', aliasKey: 'scopeAliases' },
  { field: 'Size', label: 'Size', listKey: 'sizes', aliasKey: 'sizeAliases' },
  { field: 'Priority', label: 'Priority', listKey: 'priorities', aliasKey: 'priorityAliases' },
];

/**
 * Parse CSV content into logical lines, respecting quoted newlines
 */
function parseCSVContent(content: string): string[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if (char === '\n' && !inQuotes) {
      if (currentLine.trim()) lines.push(currentLine);
      currentLine = '';
    } else if (char === '\r' && nextChar === '\n' && !inQuotes) {
      if (currentLine.trim()) lines.push(currentLine);
      currentLine = '';
      i++;
    } else {
      currentLine += char;
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Parse a CSV line into fields, respecting quotes
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

interface SelectionOption {
  label: string;
  action: 'add' | 'map' | 'skip';
  target?: string;
}

async function selectOption(prompt: string, options: SelectionOption[], initialIndex = 0): Promise<SelectionOption> {
  if (!process.stdin.isTTY) {
    throw new Error('Interactive migration requires a TTY (run in a terminal).');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  readline.emitKeypressEvents(process.stdin, rl);
  const wasRaw = process.stdin.isRaw;
  if (!wasRaw) process.stdin.setRawMode?.(true);

  let index = initialIndex;

  const render = () => {
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
    console.log(prompt);
    console.log('Use ↑/↓ to choose, Enter to confirm, Ctrl+C to abort');
    options.forEach((opt, i) => {
      const prefix = i === index ? '›' : ' ';
      console.log(`${prefix} ${opt.label}`);
    });
  };

  render();

  return await new Promise<SelectionOption>((resolve) => {
    const onKeypress = (_str: string, key: readline.Key) => {
      if (key.name === 'up') {
        index = (index - 1 + options.length) % options.length;
        render();
      } else if (key.name === 'down') {
        index = (index + 1) % options.length;
        render();
      } else if (key.name === 'return') {
        cleanup();
        resolve(options[index]);
      } else if (key.name === 'c' && key.ctrl) {
        cleanup();
        process.exit(1);
      }
    };

    const cleanup = () => {
      process.stdin.off('keypress', onKeypress);
      if (!wasRaw) process.stdin.setRawMode?.(false);
      rl.close();
      console.log();
    };

    process.stdin.on('keypress', onKeypress);
  });
}

function ensureArray(config: RepoConfig, key: keyof RepoConfig): string[] {
  const value = config[key];
  if (Array.isArray(value)) return value as string[];
  const arr: string[] = [];
  // @ts-expect-error - assign back to config using dynamic key
  config[key] = arr;
  return arr;
}

function ensureMap(config: RepoConfig, key: keyof RepoConfig): Record<string, string> {
  const value = config[key];
  if (value && typeof value === 'object') return value as Record<string, string>;
  const map: Record<string, string> = {};
  // @ts-expect-error dynamic key assignment
  config[key] = map;
  return map;
}

function uniqPush(list: string[], value: string) {
  if (!list.includes(value)) list.push(value);
}

async function resolveField(
  field: FieldConfig,
  value: string,
  config: RepoConfig,
  cache: Map<string, string>
): Promise<string> {
  if (!value.trim()) return value;
  if (cache.has(value)) return cache.get(value)!;

  const allowed = ensureArray(config, field.listKey);
  const aliases = ensureMap(config, field.aliasKey);

  // If already valid, return as-is
  if (allowed.length === 0 || allowed.includes(value)) {
    cache.set(value, value);
    return value;
  }

  const options: SelectionOption[] = [
    { label: `Add "${value}" to ${field.label} list`, action: 'add' },
    ...allowed.map((opt) => ({ label: `Map to "${opt}"`, action: 'map' as const, target: opt })),
    { label: 'Skip (leave as-is)', action: 'skip' as const },
  ];

  const choice = await selectOption(
    `Invalid ${field.label}: "${value}". Choose how to handle:`,
    options
  );

  let normalized = value;

  if (choice.action === 'add') {
    uniqPush(allowed, value);
    normalized = value;
  } else if (choice.action === 'map' && choice.target) {
    normalized = choice.target;
    aliases[value] = choice.target;
  } else if (choice.action === 'skip') {
    normalized = value;
  }

  cache.set(value, normalized);
  return normalized;
}

function parseIssues(inputPath: string): Issue[] {
  const content = readFileSync(inputPath, 'utf-8');
  const lines = parseCSVContent(content);
  if (lines.length === 0) return [];

  const headerFields = parseCSVLine(lines[0]);
  const headerIndices: Record<string, number> = {};
  headerFields.forEach((header, idx) => {
    const mapped = normalizeHeader(header);
    if (mapped) {
      headerIndices[mapped] = idx;
    }
  });

  const issues: Issue[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);

    const issue: Partial<Issue> = {};

    HEADERS.forEach((header) => {
      const idx = headerIndices[header];
      if (idx !== undefined && idx < fields.length) {
        issue[header] = fields[idx] ?? '';
      }
    });

    if (!issue.GFS_ID) {
      issue.GFS_ID = generateUUID();
    }

    issues.push(issue as Issue);
  }

  return issues;
}

function writeIssues(outputPath: string, issues: Issue[]) {
  const headerRow = HEADERS.map(escapeCSVField).join(',');
  const dataRows = issues.map((issue) =>
    HEADERS.map((header) => escapeCSVField(issue[header] ?? '')).join(',')
  );
  const content = [headerRow, ...dataRows].join('\n');
  writeFileSync(outputPath, content, 'utf-8');
}

export async function migrateWithConfig(
  inputPath: string,
  outputPath: string,
  configPath?: string
): Promise<void> {
  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const config = loadConfig(configPath);

  const issues = parseIssues(inputPath);
  if (issues.length === 0) {
    console.log('No issues found to migrate.');
    return;
  }

  const cacheByField: Record<FieldKey, Map<string, string>> = {
    Scope: new Map(),
    'Size': new Map(),
    Priority: new Map(),
  } as const;

  for (const issue of issues) {
    for (const field of FIELD_CONFIGS) {
      const value = issue[field.field];
      const allowed = ensureArray(config, field.listKey);
      if (!value || allowed.length === 0) continue;

      if (!allowed.includes(value)) {
        const normalized = await resolveField(field, value, config, cacheByField[field.field]);
        issue[field.field] = normalized;
      }
    }
  }

  writeIssues(outputPath, issues);
  writeFileSync(configPath || '.gim-config.json', JSON.stringify(config, null, 2), 'utf-8');

  console.log(`✓ Migrated ${issues.length} issues -> ${outputPath}`);
  console.log('✓ Updated config with any new values/aliases');
}
