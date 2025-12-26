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
 * Parses description from issue body (removing metadata)
 */
function parseDescription(body: string): string {
  if (!body) return '';
  
  // Remove GFS markers (handling various formats)
  let cleaned = body
    .replace(/<!--\s*GFS-ID:.*?-->\s*\n?/gi, '')
    .replace(/<!--\s*GFS-HASH:.*?-->\s*\n?/gi, '');

  // Extract all content after removing metadata markers
  if (cleaned) {
    return cleaned.trim();
  }
  return '';
}

/**
 * Converts GitHub issue to internal Issue format
 */
function githubIssueToIssue(githubIssue: GithubIssue): Issue {
  const gfsId = extractGfsId(githubIssue.body || '');
  if (!gfsId) {
    throw new Error(`Issue #${githubIssue.number} missing GFS_ID`);
  }

  // Ensure body is a string
  const bodyText = githubIssue.body || '';

  // Extract scope from labels (case-insensitive)
  const scopeLabel = (githubIssue.labels || []).find((l) =>
    l.name.toLowerCase().startsWith('scope:')
  );
  const scope = scopeLabel
    ? scopeLabel.name.replace(/^scope:/i, '')
    : 'other';

  // Extract size from labels (case-insensitive)
  const sizeLabel = (githubIssue.labels || []).find((l) =>
    l.name.toLowerCase().startsWith('size:')
  );
  const size = sizeLabel ? sizeLabel.name.replace(/^size:/i, '') : 'M';

  const description = parseDescription(bodyText);

  return {
    GFS_ID: gfsId,
    Title: githubIssue.title,
    Milestone: githubIssue.milestone?.title || '',
    Scope: scope as any,
    'Size': size as any,
    Description: description,
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

  console.log(`Found ${trackedIssues.length} tracked issues. Parsing...`);

  const issues: Issue[] = trackedIssues.map((githubIssue) => {
    try {
      return githubIssueToIssue(githubIssue);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Error parsing issue #${githubIssue.number}: ${errorMsg}`);
      console.error(`  Title: ${githubIssue.title}`);
      console.error(`  Body preview: ${githubIssue.body ? githubIssue.body.substring(0, 100) : '(empty)'}`);
      throw error;
    }
  });

  console.log(`Successfully exported ${issues.length} issues`);

  return issues;
}
