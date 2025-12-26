import { execSync } from 'child_process';
import type { Issue, ExportOptions, GithubIssue } from '../types.js';
import { extractGfsId } from '../utils/uuid.js';

/**
 * Executes a gh CLI command and returns the output
 */
function execGh(args: string[]): string {
  try {
    return execSync(`gh ${args.join(' ')}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw new Error(`GitHub CLI error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Fetches all issues that have GFS_ID marker
 */
function fetchTrackedIssues(repo: string): GithubIssue[] {
  const output = execGh([
    'issue',
    'list',
    '-R',
    repo,
    '--state',
    'all',
    '--limit',
    '9999',
    '--json',
    'number,title,body,state,milestone,labels',
  ]);

  try {
    const allIssues: GithubIssue[] = JSON.parse(output);
    // Filter only issues with GFS_ID marker
    return allIssues.filter((issue) => extractGfsId(issue.body || ''));
  } catch {
    return [];
  }
}

/**
 * Parses acceptance criteria section from issue body
 */
function parseAcceptanceCriteria(body: string): string {
  const match = body.match(/## Acceptance Criteria\n([\s\S]*?)(?=\n## |$)/);
  return match ? match[1].trim() : '';
}

/**
 * Parses description from issue body (removing metadata)
 */
function parseDescription(body: string): string {
  // Remove GFS markers and extract description
  const cleaned = body
    .replace(/<!-- GFS-ID:.*?-->\n?/i, '')
    .replace(/<!-- GFS-HASH:.*?-->\n?/i, '');

  const descMatch = cleaned.match(/([\s\S]*?)(?=\n## Acceptance Criteria|$)/);
  return descMatch ? descMatch[1].trim() : '';
}

/**
 * Converts GitHub issue to internal Issue format
 */
function githubIssueToIssue(githubIssue: GithubIssue): Issue {
  const gfsId = extractGfsId(githubIssue.body || '');
  if (!gfsId) {
    throw new Error(`Issue #${githubIssue.number} missing GFS_ID`);
  }

  // Extract scope from labels
  const scopeLabel = (githubIssue.labels || []).find((l) =>
    l.name.startsWith('scope:')
  );
  const scope = scopeLabel
    ? scopeLabel.name.replace('scope:', '')
    : 'other';

  // Extract size from labels
  const sizeLabel = (githubIssue.labels || []).find((l) =>
    l.name.startsWith('size:')
  );
  const size = sizeLabel ? sizeLabel.name.replace('size:', '') : 'M';

  const description = parseDescription(githubIssue.body || '');
  const acceptanceCriteria = parseAcceptanceCriteria(githubIssue.body || '');

  return {
    GFS_ID: gfsId,
    Title: githubIssue.title,
    Milestone: githubIssue.milestone?.title || '',
    Scope: scope as any,
    'Size': size as any,
    Description: description,
    'Acceptance Criteria': acceptanceCriteria,
  };
}

/**
 * Main export function
 */
export function exportIssues(options: ExportOptions): Issue[] {
  const repo = options.repo;

  console.log(`Exporting tracked issues from ${repo}...`);

  const trackedIssues = fetchTrackedIssues(repo);

  if (trackedIssues.length === 0) {
    console.log('No tracked issues found (with GFS_ID marker)');
    return [];
  }

  const issues: Issue[] = trackedIssues.map((githubIssue) => {
    try {
      return githubIssueToIssue(githubIssue);
    } catch (error) {
      console.error(`Error parsing issue #${githubIssue.number}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  console.log(`Exported ${issues.length} issues`);

  return issues;
}
