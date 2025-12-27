import { execSync } from 'child_process';
import type { Issue, ExportOptions, GithubIssue } from '../types.js';
import type { RepoConfig } from '../config.js';
import { extractGfsId } from '../utils/uuid.js';
import { loadConfig } from './config.js';

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
 * Executes a gh CLI command expecting JSON output and parses it
 */
function execGhJson(args: string[]): any {
  // Ensure we request JSON format where applicable
  const withFormat = args.includes('--format') ? args : [...args, '--format', 'json'];
  const out = execGh(withFormat);
  try {
    return JSON.parse(out);
  } catch {
    return {};
  }
}

function repoOwner(repo: string): string {
  const [owner] = repo.split('/');
  return owner;
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

  // Remove Acceptance Criteria section entirely if present
  cleaned = cleaned.replace(/\n##\s*Acceptance\s*Criteria[\s\S]*$/i, '');

  // Extract all content after removing metadata markers
  if (cleaned) {
    return cleaned.trim();
  }
  return '';
}

/**
 * Converts GitHub issue to internal Issue format
 */
function githubIssueToIssue(githubIssue: GithubIssue, config: RepoConfig, projectFieldMap?: Map<number, { scope?: string; size?: string; priority?: string }>): Issue {
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
    : undefined;

  // Extract size from labels (case-insensitive)
  const sizeLabel = (githubIssue.labels || []).find((l) =>
    l.name.toLowerCase().startsWith('size:')
  );
  const size = sizeLabel ? sizeLabel.name.replace(/^size:/i, '') : undefined;

  // Extract priority from labels (case-insensitive)
  const priorityLabel = (githubIssue.labels || []).find((l) =>
    l.name.toLowerCase().startsWith('priority:')
  );
  const priority = priorityLabel
    ? priorityLabel.name.replace(/^priority:/i, '')
    : undefined;

  // If labels didn't provide values, try project field map
  const pf = projectFieldMap?.get(githubIssue.number);
  const mergedScope = scope || pf?.scope;
  const mergedSize = size || pf?.size;
  const mergedPriority = priority || pf?.priority;

  const description = parseDescription(bodyText);

  const issue: Issue = {
    GFS_ID: gfsId,
    Title: githubIssue.title,
    Milestone: githubIssue.milestone?.title || '',
    Description: description,
  };

  // Add optional fields if they have values
  if (mergedScope) issue.Scope = mergedScope;
  if (mergedSize) issue.Size = mergedSize;
  if (mergedPriority) issue.Priority = mergedPriority;

  return issue;
}

/**
 * Build a map of issue number -> {scope,size,priority} from Project items
 */
function getProjectFieldValuesMap(repo: string, config: RepoConfig): Map<number, { scope?: string; size?: string; priority?: string }> | undefined {
  if (!config?.project?.number) return undefined;
  const owner = config.project.owner || repoOwner(repo);
  let items: any[] = [];
  let fields: any[] = [];
  try {
    // Default gh returns ~30 items; request higher limit to cover typical use
    const data = execGhJson(['project', 'item-list', String(config.project.number), '--owner', owner, '--limit', '200']);
    items = Array.isArray(data?.items) ? data.items : [];
  } catch {}
  try {
    const fdata = execGhJson(['project', 'field-list', String(config.project.number), '--owner', owner, '--limit', '100']);
    fields = Array.isArray(fdata?.fields) ? fdata.fields : [];
  } catch {}

  // Build field id -> name map for Scope/Size/Priority
  const targetFieldIds: Record<string, string> = {};
  for (const f of fields) {
    const fname = (f?.name || '').toLowerCase();
    if (fname === 'scope' || fname === 'size' || fname === 'priority') {
      targetFieldIds[f.id] = fname;
    }
  }

  // Helper to normalize value from different shapes
  const getValueName = (fv: any): string | undefined => {
    if (!fv) return undefined;
    if (typeof fv === 'string') return fv;
    if (typeof fv?.name === 'string') return fv.name;
    if (typeof fv?.value === 'string') return fv.value;
    if (fv?.value?.name) return fv.value.name;
    if (fv?.singleSelectValue?.name) return fv.singleSelectValue.name;
    return undefined;
  };

  const map = new Map<number, { scope?: string; size?: string; priority?: string }>();
  for (const it of items) {
    const url: string = it?.content?.url || '';
    const m = url.match(/\/(issues|pull)\/(\d+)/);
    const issueNumber = m ? Number(m[2]) : NaN;
    if (!issueNumber) continue;

    const out: { scope?: string; size?: string; priority?: string } = {};
    // Prefer direct item properties if present (as in gh project item-list output)
    if (typeof it?.scope === 'string') out.scope = it.scope;
    if (typeof it?.size === 'string') out.size = it.size;
    if (typeof it?.priority === 'string') out.priority = it.priority;

    // Fallback: inspect item fields array if direct properties not available
    if ((!out.scope || !out.size || !out.priority)) {
      const ifields = Array.isArray(it?.fields) ? it.fields : it?.item?.fields || [];
      for (const fld of ifields) {
        const fid = fld?.id || fld?.field?.id;
        const key = targetFieldIds[fid];
        if (!key) continue;
        const val = getValueName(fld?.value || fld?.field?.value || fld?.singleSelectValue);
        if (val) {
          if (key === 'scope' && !out.scope) out.scope = val;
          else if (key === 'size' && !out.size) out.size = val;
          else if (key === 'priority' && !out.priority) out.priority = val;
        }
      }
    }

    map.set(issueNumber, out);
  }
  return map;
}

/**
 * Main export function
 */
export function exportIssues(options: ExportOptions): Issue[] {
  const repo = options.repo;
  const verbose = !!options.verbose;

  console.log(`Exporting tracked issues from ${repo}...`);

  // Load config to get field definitions
  let config: RepoConfig | undefined;
  try {
    config = loadConfig();
  } catch (error) {
    if (verbose) console.warn(`⚠️ Could not load config file (.gim-config.json); using defaults`);
    config = { version: '1.0.0', repository: repo } as RepoConfig;
  }

  const trackedIssues = fetchTrackedIssues(repo);

  if (trackedIssues.length === 0) {
    console.log('No tracked issues found (with GFS_ID marker)');
    return [];
  }

  console.log(`Found ${trackedIssues.length} tracked issues. Parsing...`);

  // Build project field values map if project is configured
  const projectFieldMap = getProjectFieldValuesMap(repo, config!);
  if (verbose) {
    if (config?.project?.number) {
      const count = projectFieldMap ? projectFieldMap.size : 0;
      console.log(`Project field map loaded for project #${config.project.number} (items: ${count})`);
    } else {
      console.log('No project configured in .gim-config.json; will use labels only for custom fields.');
    }
  }

  const issues: Issue[] = trackedIssues.map((githubIssue) => {
    try {
      const issue = githubIssueToIssue(githubIssue, config!, projectFieldMap);
      if (verbose) {
        const srcScope = (githubIssue.labels || []).some(l => l.name.toLowerCase().startsWith('scope:')) ? 'labels' : (projectFieldMap?.get(githubIssue.number)?.scope ? 'project' : 'n/a');
        const srcSize = (githubIssue.labels || []).some(l => l.name.toLowerCase().startsWith('size:')) ? 'labels' : (projectFieldMap?.get(githubIssue.number)?.size ? 'project' : 'n/a');
        const srcPriority = (githubIssue.labels || []).some(l => l.name.toLowerCase().startsWith('priority:')) ? 'labels' : (projectFieldMap?.get(githubIssue.number)?.priority ? 'project' : 'n/a');
        console.log(`[#${githubIssue.number}] Scope=${issue.Scope ?? ''} (${srcScope}) Size=${issue.Size ?? ''} (${srcSize}) Priority=${issue.Priority ?? ''} (${srcPriority})`);
      }
      return issue;
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
