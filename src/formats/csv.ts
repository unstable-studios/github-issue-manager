import { readFileSync, writeFileSync } from 'fs';
import type { Issue } from '../types.js';

const HEADERS: (keyof Issue)[] = [
  'GFS_ID',
  'Title',
  'Milestone',
  'Scope',
  'T-Shirt Size',
  'Priority',
  'Description',
  'Acceptance Criteria',
];

/**
 * Escapes a field value for CSV output
 */
function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Parses CSV content into lines, respecting multi-line quoted fields
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

/**
 * Parses a CSV line into fields, respecting quoted values and newlines
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
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      // Include all characters, including newlines when inside quotes
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Parses CSV file and returns array of issues
 * Handles multi-line quoted fields correctly
 */
export function readCSV(filePath: string): Issue[] {
  const content = readFileSync(filePath, 'utf-8');
  
  // Don't split on newlines yet - we need to respect quotes first
  const lines = parseCSVContent(content);

  if (lines.length === 0) {
    return [];
  }

  const headerLine = lines[0];
  const headerFields = parseCSVLine(headerLine);

  // Find indices of required headers
  const headerIndices: Record<keyof Issue, number> = {} as Record<
    keyof Issue,
    number
  >;
  HEADERS.forEach((header) => {
    const index = headerFields.indexOf(header);
    if (index >= 0) {
      headerIndices[header] = index;
    }
  });

  const issues: Issue[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const issue: any = {};

    HEADERS.forEach((header) => {
      const index = headerIndices[header];
      if (index !== undefined && fields[index]) {
        issue[header] = fields[index];
      }
    });

    if (issue.GFS_ID && issue.Title) {
      issues.push(issue as Issue);
    }
  }

  return issues;
}

/**
 * Writes issues to CSV file
 */
export function writeCSV(filePath: string, issues: Issue[]): void {
  const headerRow = HEADERS.map(escapeCSVField).join(',');
  const dataRows = issues.map((issue) =>
    HEADERS.map((header) => escapeCSVField(issue[header] ?? ''))
      .join(',')
  );

  const content = [headerRow, ...dataRows].join('\n');
  writeFileSync(filePath, content, 'utf-8');
}
