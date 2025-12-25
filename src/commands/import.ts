import { execSync } from 'child_process';
import type {
  Issue,
  ImportOptions,
  GithubIssue,
  InternalIssueData,
} from '../types.js';
import {
  extractGfsId,
  extractContentHash,
  insertGfsId,
  insertContentHash,
} from '../utils/uuid.js';
import { computeContentHash } from '../utils/hash.js';

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
 * Fetches all issues from a repository
 */
export function fetchAllIssues(repo: string): GithubIssue[] {
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
    return JSON.parse(output);
  } catch {
    return [];
  }
}

/**
 * Finds an existing issue by GFS_ID
 */
function findIssueByGfsId(
  gfsId: string,
  existingIssues: GithubIssue[]
): GithubIssue | null {
  for (const issue of existingIssues) {
    const existingGfsId = extractGfsId(issue.body || '');
    if (existingGfsId === gfsId) {
      return issue;
    }
  }
  return null;
}

/**
 * Extracts internal data from a GitHub issue
 */
function extractIssueData(issue: GithubIssue): InternalIssueData | null {
  const gfsId = extractGfsId(issue.body || '');
  if (!gfsId) {
    return null;
  }

  const contentHash = extractContentHash(issue.body || '');
  const descriptionMatch = (issue.body || '').match(
    /<!-- GFS-ID:.*?-->\n?(?:<!-- GFS-HASH:.*?-->\n?)?([\s\S]*?)(?=\n## Acceptance Criteria|$)/
  );
  const description = descriptionMatch ? descriptionMatch[1].trim() : '';

  const acceptanceCriteriaMatch = (issue.body || '').match(
    /## Acceptance Criteria\n([\s\S]*?)(?=\n## |$)/
  );
  const acceptanceCriteria = acceptanceCriteriaMatch
    ? acceptanceCriteriaMatch[1].trim()
    : '';

  // Extract scope from labels
  const scopeLabel = (issue.labels || []).find((l) =>
    l.name.startsWith('scope:')
  );
  const scope = scopeLabel ? scopeLabel.name.replace('scope:', '') : 'other';

  // Extract size from labels
  const sizeLabel = (issue.labels || []).find((l) =>
    l.name.startsWith('size:')
  );
  const size = sizeLabel ? sizeLabel.name.replace('size:', '') : 'M';

  return {
    gfsId,
    contentHash: contentHash || '',
    title: issue.title,
    description,
    acceptanceCriteria,
    scope: scope as any,
    size: size as any,
    milestone: issue.milestone?.title || '',
  };
}

/**
 * Creates a new GitHub issue
 */
function createGithubIssue(
  repo: string,
  issue: Issue,
  dryRun: boolean = false
): { number: number; url: string } {
  if (dryRun) {
    return { number: 0, url: 'DRY_RUN' };
  }

  const body = formatIssueBody(issue);

  try {
    const output = execGh([
      'issue',
      'create',
      '-R',
      repo,
      '--title',
      `"${issue.Title}"`,
      '--body',
      `"${body}"`,
      '--json',
      'number,url',
    ]);

    const result = JSON.parse(output);
    return result;
  } catch (error) {
    throw new Error(
      `Failed to create issue "${issue.Title}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Updates an existing GitHub issue
 */
function updateGithubIssue(
  repo: string,
  issueNumber: number,
  issue: Issue,
  dryRun: boolean = false
): void {
  if (dryRun) {
    return;
  }

  const body = formatIssueBody(issue);

  try {
    execGh([
      'issue',
      'edit',
      String(issueNumber),
      '-R',
      repo,
      '--title',
      `"${issue.Title}"`,
      '--body',
      `"${body}"`,
    ]);
  } catch (error) {
    throw new Error(
      `Failed to update issue #${issueNumber}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Formats an issue into GitHub issue body with metadata
 */
function formatIssueBody(issue: Issue): string {
  const gfsId = issue.GFS_ID;
  const contentHash = computeContentHash(issue);

  const body = `<!-- GFS-ID: ${gfsId} -->
<!-- GFS-HASH: ${contentHash} -->

${issue.Description}

## Acceptance Criteria

${issue['Acceptance Criteria']}`;

  return body;
}

/**
 * Adds labels to an issue
 */
function addLabelsToIssue(
  repo: string,
  issueNumber: number,
  labels: string[],
  dryRun: boolean = false
): void {
  if (dryRun || labels.length === 0) {
    return;
  }

  try {
    execGh([
      'issue',
      'edit',
      String(issueNumber),
      '-R',
      repo,
      '--add-label',
      labels.join(','),
    ]);
  } catch (error) {
    throw new Error(
      `Failed to add labels to issue #${issueNumber}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Main import function
 */
export function importIssues(
  issues: Issue[],
  options: ImportOptions
): { created: number; updated: number; skipped: number } {
  const { dryRun, createOnly, updateOnly, autoCreateLabels } = options;
  const repo = options.repo;

  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Fetch existing issues
  const existingIssues = fetchAllIssues(repo);

  issues.forEach((issue) => {
    const existing = findIssueByGfsId(issue.GFS_ID, existingIssues);
    const newContentHash = computeContentHash(issue);

    if (existing) {
      // Issue exists
      if (createOnly) {
        skipped++;
        return;
      }

      const existingHash = extractContentHash(existing.body || '');
      if (existingHash === newContentHash) {
        // No changes
        skipped++;
        return;
      }

      // Update the issue
      if (!dryRun) {
        console.log(`Updating issue #${existing.number}: ${issue.Title}`);
        updateGithubIssue(repo, existing.number, issue, dryRun);

        if (autoCreateLabels) {
          const labels = [`scope:${issue.Scope}`, `size:${issue['T-Shirt Size']}`];
          addLabelsToIssue(repo, existing.number, labels, dryRun);
        }
      } else {
        console.log(`[DRY-RUN] Would update issue #${existing.number}: ${issue.Title}`);
      }

      updated++;
    } else {
      // Issue doesn't exist
      if (updateOnly) {
        skipped++;
        return;
      }

      // Create the issue
      if (!dryRun) {
        console.log(`Creating new issue: ${issue.Title}`);
        const result = createGithubIssue(repo, issue, dryRun);

        if (autoCreateLabels) {
          const labels = [`scope:${issue.Scope}`, `size:${issue['T-Shirt Size']}`];
          addLabelsToIssue(repo, result.number, labels, dryRun);
        }
      } else {
        console.log(`[DRY-RUN] Would create issue: ${issue.Title}`);
      }

      created++;
    }
  });

  return { created, updated, skipped };
}
