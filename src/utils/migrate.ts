#!/usr/bin/env tsx

/**
 * Migration utility to add GFS_ID column to existing CSV files
 * Usage: npm run cli migrate <input-file> --output <output-file>
 */

import { readFileSync, writeFileSync } from 'fs';
import { generateUUID } from '../utils/uuid.js';
import type { Issue } from '../types.js';

interface LegacyIssue {
  Milestone: string;
  Title: string;
  Scope: string;
  'Size': string;
  Description: string;
}

/** * Parses CSV content into lines, respecting multi-line quoted fields
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
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if (char === '\n' && !inQuotes) {
      // End of line (not inside quotes)
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else if (char === '\r' && nextChar === '\n' && !inQuotes) {
      // Windows line ending
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
      i++; // Skip \n
    } else {
      currentLine += char;
    }
  }

  // Add last line if any
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  return lines;
}

/** * Parses a CSV line respecting quotes
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

/**
 * Maps legacy scope values to standard enum values
 */
function normalizeScope(legacyScope: string): string {
  const mapping: Record<string, string> = {
    'Core / Infra': 'backend',
    'Core': 'backend',
    'Core / UI': 'frontend',
    'UI': 'frontend',
    'Middleware': 'backend',
    'Docs': 'documentation',
    'Documentation': 'documentation',
    'DevOps': 'devops',
    'Infrastructure': 'devops',
  };

  return mapping[legacyScope] || 'other';
}

/**
 * Migrates legacy CSV to new format with GFS_ID
 */
export function migrateLegacyCSV(inputPath: string, outputPath: string): void {
  const content = readFileSync(inputPath, 'utf-8');
  
  // Use proper multi-line CSV parsing
  const lines = parseCSVContent(content);

  if (lines.length === 0) {
    console.error('Error: Empty CSV file');
    return;
  }

  const headerLine = lines[0];
  const headerFields = parseCSVLine(headerLine);

  // Detect legacy format
  if (headerFields.includes('GFS_ID')) {
    console.log('✓ File already has GFS_ID column, no migration needed');
    return;
  }

  console.log('Migrating legacy CSV to new format...');

  // Map legacy headers to new format
  const legacyMapping: Record<string, keyof Issue> = {
    Milestone: 'Milestone',
    Title: 'Title',
    Scope: 'Scope',
    'Size': 'Size',
    Description: 'Description',
  };

  const headerIndices: Record<string, number> = {};
  headerFields.forEach((header, index) => {
    headerIndices[header] = index;
  });

  const issues: Issue[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const issue: any = {
      GFS_ID: generateUUID(), // Generate new UUID
    };

    // Map legacy fields to new format
    Object.entries(legacyMapping).forEach(([legacyName, newName]) => {
      const index = headerIndices[legacyName];
      if (index !== undefined && fields[index] !== undefined && fields[index] !== '') {
        let value = fields[index];
        
        // Normalize scope values
        if (newName === 'Scope') {
          value = normalizeScope(value);
        }
        
        issue[newName] = value;
      } else {
        // Provide defaults for missing values
        if (newName === 'Scope') {
          issue[newName] = 'other';
        } else if (newName === 'Size') {
          issue[newName] = 'M';
        } else {
          issue[newName] = '';
        }
      }
    });

    if (issue.Title) {
      issues.push(issue as Issue);
    }
  }

  // Write new format CSV
  const newHeaders = [
    'GFS_ID',
    'Title',
    'Milestone',
    'Scope',
    'Size',
    'Description',
  ];

  function escapeCSVField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  const headerRow = newHeaders.join(',');
  const dataRows = issues.map((issue) =>
    newHeaders
      .map((header) => escapeCSVField(issue[header as keyof Issue] ?? ''))
      .join(',')
  );

  const output = [headerRow, ...dataRows].join('\n');
  writeFileSync(outputPath, output, 'utf-8');

  console.log(`✓ Migrated ${issues.length} issues`);
  console.log(`✓ Output written to: ${outputPath}`);
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length < 2 || !args.includes('--output')) {
    console.log('Usage: migrate <input-file> --output <output-file>');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputIndex = args.indexOf('--output');
  const outputFile = args[outputIndex + 1];

  try {
    migrateLegacyCSV(inputFile, outputFile);
  } catch (error) {
    console.error('Migration failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
