import { execSync, spawnSync } from 'child_process';
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

function execGhInput(args: string[], input: string): string {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  // bridge tokens if only one is set
  if (env.GITHUB_TOKEN && !env.GH_TOKEN) env.GH_TOKEN = env.GITHUB_TOKEN;
  if (env.GH_TOKEN && !env.GITHUB_TOKEN) env.GITHUB_TOKEN = env.GH_TOKEN;

  const result = spawnSync('gh', args, {
    encoding: 'utf-8',
    env,
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw new Error(`GitHub CLI error: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? '';
    const stdout = result.stdout?.toString() ?? '';
    throw new Error(`GitHub CLI exited with ${result.status}: ${stderr || stdout}`);
  }
  return (result.stdout || '').toString().trim();
}

function execGhJson(args: string[]): any {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  if (env.GITHUB_TOKEN && !env.GH_TOKEN) env.GH_TOKEN = env.GITHUB_TOKEN;
  if (env.GH_TOKEN && !env.GITHUB_TOKEN) env.GITHUB_TOKEN = env.GH_TOKEN;

  const result = spawnSync('gh', args, {
    encoding: 'utf-8',
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw new Error(`GitHub CLI error: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? '';
    const stdout = result.stdout?.toString() ?? '';
    throw new Error(`GitHub CLI exited with ${result.status}: ${stderr || stdout}`);
  }

  const out = (result.stdout || '').toString();
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

function listMilestones(repo: string): { title: string; number: number }[] {
  const data = execGhJson(['api', `repos/${repo}/milestones`]);
  if (Array.isArray(data)) {
    return data.map((m: any) => ({ title: m.title, number: m.number }));
  }
  return [];
}

function createMilestone(repo: string, title: string): { title: string; number: number } | null {
  try {
    const data = execGhJson(['api', `repos/${repo}/milestones`, '-f', `title=${title}`]);
    return { title: data.title, number: data.number };
  } catch {
    return null;
  }
}

function prepareMilestoneArg(
  repo: string,
  title: string,
  autoCreate: boolean,
  dryRun: boolean
): string | null {
  if (!title || !title.trim()) return null;
  const existing = listMilestones(repo);
  if (existing.some((m) => m.title === title)) {
    return title;
  }
  if (autoCreate && !dryRun) {
    const created = createMilestone(repo, title);
    if (created) {
      console.log(`✓ Created missing milestone: ${title}`);
      return created.title;
    }
    console.warn(`⚠️ Failed to create milestone "${title}"; proceeding without milestone.`);
    return null;
  }
  console.warn(`⚠️ Milestone "${title}" not found; proceeding without milestone. (Use --auto-milestones to create)`);
  return null;
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
    const args = [
      'issue',
      'create',
      '-R',
      repo,
      '--title',
      issue.Title,
      '-F',
      '-', // read body from stdin
    ];

    // milestone if provided and exists (or auto-created)
    const milestoneArg = prepareMilestoneArg(repo, issue.Milestone, false /* autoCreate handled at higher level? */, false /* not dry-run here */);
    if (milestoneArg) {
      args.push('--milestone', milestoneArg);
    }

    const output = execGhInput(args, body);
    // gh prints the created issue URL; extract issue number if present
    const url = output.trim();
    const numMatch = url.match(/\/issues\/(\d+)/) || url.match(/#(\d+)/);
    const number = numMatch ? Number(numMatch[1]) : 0;
    return { number, url };
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
    const args = [
      'issue',
      'edit',
      String(issueNumber),
      '-R',
      repo,
      '--title',
      issue.Title,
      '--body',
      body,
    ];
    const milestoneArg = prepareMilestoneArg(repo, issue.Milestone, false, false);
    if (milestoneArg) {
      args.push('--milestone', milestoneArg);
    }
    execGh(args);
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
      labels.join(','), // supports comma-separated per gh manual
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
  const { dryRun, createOnly, updateOnly, autoCreateLabels, autoCreateMilestones } = options;
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
        // ensure milestone exists or skip adding
        const milestoneArg = prepareMilestoneArg(repo, issue.Milestone, !!autoCreateMilestones, !!dryRun);
        if (milestoneArg) {
          issue.Milestone = milestoneArg;
        } else {
          issue.Milestone = '';
        }
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
        const milestoneArg = prepareMilestoneArg(repo, issue.Milestone, !!autoCreateMilestones, !!dryRun);
        if (milestoneArg) {
          issue.Milestone = milestoneArg;
        } else {
          issue.Milestone = '';
        }
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
