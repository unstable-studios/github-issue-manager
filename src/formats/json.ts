import { readFileSync, writeFileSync } from 'fs';
import type { Issue } from '../types.js';

interface JSONSchema {
  version: string;
  issues: Issue[];
}

const SCHEMA_VERSION = '1.0.0';

/**
 * Reads JSON file and returns array of issues
 */
export function readJSON(filePath: string): Issue[] {
  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content) as JSONSchema | Issue[];

  // Handle both plain array and schema-versioned format
  if (Array.isArray(data)) {
    return data;
  }

  if (data.version && data.issues) {
    return data.issues;
  }

  throw new Error('Invalid JSON format: expected array of issues or schema object');
}

/**
 * Writes issues to JSON file with schema version
 */
export function writeJSON(filePath: string, issues: Issue[]): void {
  const data: JSONSchema = {
    version: SCHEMA_VERSION,
    issues,
  };

  const content = JSON.stringify(data, null, 2);
  writeFileSync(filePath, content, 'utf-8');
}

/**
 * Writes issues to JSON file as plain array
 */
export function writeJSONArray(filePath: string, issues: Issue[]): void {
  const content = JSON.stringify(issues, null, 2);
  writeFileSync(filePath, content, 'utf-8');
}
