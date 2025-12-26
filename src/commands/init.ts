import { generateUUID } from '../utils/uuid.js';
import type { Issue } from '../types.js';

/**
 * Generates a template issue with example content
 */
export function generateExampleIssue(): Issue {
  return {
    GFS_ID: generateUUID(),
    Title: 'Example: Implement feature X',
    Milestone: 'v1.0.0',
    Scope: 'frontend',
    'Size': 'M',
    Description:
      'This is an example description.\n\nIt can span multiple paragraphs.',
  };
}

/**
 * Generates a template issue without content (just headers)
 */
export function generateEmptyIssue(): Issue {
  return {
    GFS_ID: generateUUID(),
    Title: '',
    Milestone: '',
    Scope: 'other',
    'Size': 'M',
    Description: '',
  };
}

/**
 * Generates multiple example issues for reference
 */
export function generateExampleIssues(): Issue[] {
  return [
    {
      GFS_ID: generateUUID(),
      Title: 'Create login page',
      Milestone: 'v1.0.0',
      Scope: 'frontend',
      'Size': 'M',
      Description:
        'Build the main login page with email/password authentication',
    },
    {
      GFS_ID: generateUUID(),
      Title: 'Setup database schema',
      Milestone: 'v1.0.0',
      Scope: 'backend',
      'Size': 'L',
      Description: 'Design and implement the initial database schema',
    },
    {
      GFS_ID: generateUUID(),
      Title: 'Write API documentation',
      Milestone: 'v1.0.0',
      Scope: 'documentation',
      'Size': 'S',
      Description:
        'Document all REST API endpoints with examples and error codes',
    },
  ];
}
