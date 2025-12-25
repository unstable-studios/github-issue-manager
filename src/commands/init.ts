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
    'T-Shirt Size': 'M',
    Description:
      'This is an example description.\n\nIt can span multiple paragraphs.',
    'Acceptance Criteria': '- [ ] Requirement 1\n- [ ] Requirement 2\n- [ ] Requirement 3',
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
    'T-Shirt Size': 'M',
    Description: '',
    'Acceptance Criteria': '- [ ] \n- [ ] ',
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
      'T-Shirt Size': 'M',
      Description:
        'Build the main login page with email/password authentication',
      'Acceptance Criteria':
        '- [ ] Email input field\n- [ ] Password input field\n- [ ] Submit button\n- [ ] Error message display',
    },
    {
      GFS_ID: generateUUID(),
      Title: 'Setup database schema',
      Milestone: 'v1.0.0',
      Scope: 'backend',
      'T-Shirt Size': 'L',
      Description: 'Design and implement the initial database schema',
      'Acceptance Criteria':
        '- [ ] Create users table\n- [ ] Create posts table\n- [ ] Add foreign key relationships\n- [ ] Create indices',
    },
    {
      GFS_ID: generateUUID(),
      Title: 'Write API documentation',
      Milestone: 'v1.0.0',
      Scope: 'documentation',
      'T-Shirt Size': 'S',
      Description:
        'Document all REST API endpoints with examples and error codes',
      'Acceptance Criteria':
        '- [ ] Document /auth endpoints\n- [ ] Document /users endpoints\n- [ ] Include example requests/responses',
    },
  ];
}
