import { spawnSync } from 'child_process';
import * as readline from 'readline';
import { loadConfig, saveConfig } from '../commands/config.js';
import type { RepoConfig } from '../config.js';
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

// Verbose logging for gh invocations
let VERBOSE = false;
export function setGhVerbose(v: boolean) {
  VERBOSE = v;
}

/**
 * Executes a gh CLI command (no shell) and returns stdout
 */
function sleep(ms: number) {
  const sab = new SharedArrayBuffer(4);
  const ia = new Int32Array(sab);
  Atomics.wait(ia, 0, 0, ms);
}

function isRateLimitMessage(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('rate limit') ||
    t.includes('secondary rate limit') ||
    t.includes('http 429') ||
    t.includes('abuse detection')
  );
}

function execGh(args: string[]): string {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  if (env.GITHUB_TOKEN && !env.GH_TOKEN) env.GH_TOKEN = env.GITHUB_TOKEN;
  if (env.GH_TOKEN && !env.GITHUB_TOKEN) env.GITHUB_TOKEN = env.GH_TOKEN;

  if (VERBOSE) {
    console.log('[gh]', args.join(' '));
  }

  const maxAttempts = 3;
  let attempt = 0;
  let lastErr: string = '';
  while (attempt < maxAttempts) {
    const result = spawnSync('gh', args, {
      encoding: 'utf-8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.error) {
      lastErr = `GitHub CLI error: ${result.error.message}`;
    } else if (result.status !== 0) {
      const stderr = result.stderr?.toString() ?? '';
      const stdout = result.stdout?.toString() ?? '';
      lastErr = `${stderr || stdout}`;
    } else {
      return (result.stdout || '').toString().trim();
    }

    if (isRateLimitMessage(lastErr) && attempt < maxAttempts - 1) {
      const backoffMs = 1000 * Math.pow(2, attempt);
      console.warn(`[gh] Rate limited; retrying in ${backoffMs}ms (attempt ${attempt + 2}/${maxAttempts})`);
      sleep(backoffMs);
      attempt++;
      continue;
    }
    break;
  }
  throw new Error(`GitHub CLI exited with error: ${lastErr}`);
}

function execGhInput(args: string[], input: string): string {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  // bridge tokens if only one is set
  if (env.GITHUB_TOKEN && !env.GH_TOKEN) env.GH_TOKEN = env.GITHUB_TOKEN;
  if (env.GH_TOKEN && !env.GITHUB_TOKEN) env.GITHUB_TOKEN = env.GH_TOKEN;

  if (VERBOSE) {
    console.log('[gh] gh', args.join(' '), `(stdin ${input.length} bytes)`);
  }
  const maxAttempts = 3;
  let attempt = 0;
  let lastErr: string = '';
  while (attempt < maxAttempts) {
    const result = spawnSync('gh', args, {
      encoding: 'utf-8',
      env,
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.error) {
      lastErr = `GitHub CLI error: ${result.error.message}`;
    } else if (result.status !== 0) {
      const stderr = result.stderr?.toString() ?? '';
      const stdout = result.stdout?.toString() ?? '';
      lastErr = `${stderr || stdout}`;
    } else {
      return (result.stdout || '').toString().trim();
    }

    if (isRateLimitMessage(lastErr) && attempt < maxAttempts - 1) {
      const backoffMs = 1000 * Math.pow(2, attempt);
      console.warn(`[gh] Rate limited; retrying in ${backoffMs}ms (attempt ${attempt + 2}/${maxAttempts})`);
      sleep(backoffMs);
      attempt++;
      continue;
    }
    break;
  }
  throw new Error(`GitHub CLI exited with error: ${lastErr}`);
}

function execGhJson(args: string[]): any {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  if (env.GITHUB_TOKEN && !env.GH_TOKEN) env.GH_TOKEN = env.GITHUB_TOKEN;
  if (env.GH_TOKEN && !env.GITHUB_TOKEN) env.GITHUB_TOKEN = env.GH_TOKEN;

  if (VERBOSE) {
    console.log('[gh] gh', args.join(' '));
  }
  const maxAttempts = 3;
  let attempt = 0;
  let lastErr: string = '';
  while (attempt < maxAttempts) {
    const result = spawnSync('gh', args, {
      encoding: 'utf-8',
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.error) {
      lastErr = `GitHub CLI error: ${result.error.message}`;
    } else if (result.status !== 0) {
      const stderr = result.stderr?.toString() ?? '';
      const stdout = result.stdout?.toString() ?? '';
      lastErr = `${stderr || stdout}`;
    } else {
      const out = (result.stdout || '').toString();
      try {
        return JSON.parse(out);
      } catch {
        return out;
      }
    }

    if (isRateLimitMessage(lastErr) && attempt < maxAttempts - 1) {
      const backoffMs = 1000 * Math.pow(2, attempt);
      console.warn(`[gh] Rate limited; retrying in ${backoffMs}ms (attempt ${attempt + 2}/${maxAttempts})`);
      sleep(backoffMs);
      attempt++;
      continue;
    }
    break;
  }
  throw new Error(`GitHub CLI exited with error: ${lastErr}`);
}

function repoOwner(repo: string): string {
  return repo.split('/')[0];
}

type ProjectInfo = { id: string; title: string; number: number; closed: boolean; ownerArg: string };

const projectListCache = new Map<string, ProjectInfo[]>();

function getProjectId(owner: string, number: number): string | null {
  try {
    const args = ['project', 'view', String(number), '--format', 'json', '--owner', owner];
    const data = execGhJson(args);
    return data?.id || null;
  } catch (err) {
    console.warn(`[gh] Failed to get project id for ${owner}#${number}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

function listProjects(owner: string, refresh = false): ProjectInfo[] {
  if (!refresh && projectListCache.has(owner)) {
    return projectListCache.get(owner)!;
  }
  const projects: ProjectInfo[] = [];
  const seen = new Set<string>();

  // Get org projects explicitly by owner
  if (owner && owner !== '@me') {
    try {
      const orgArgs = ['project', 'list', '--format', 'json', '--limit', '100', '--owner', owner];
      const orgData = execGhJson(orgArgs);
      const orgProjects = orgData?.projects || [];
      if (Array.isArray(orgProjects) && orgProjects.length > 0) {
        orgProjects.forEach((p: any) => {
          const key = `${p.number}:${p.title}`;
          if (!seen.has(key)) {
            seen.add(key);
            projects.push({
              id: p.id || '',
              title: p.title || '',
              number: p.number || 0,
              closed: p.closed || false,
              ownerArg: owner
            });
          }
        });
      }
    } catch (err) {
      console.warn(`[gh] Could not fetch projects for owner ${owner}:`, err instanceof Error ? err.message : String(err));
    }
  }

  // Also get user's own projects explicitly
  try {
    const userArgs = ['project', 'list', '--format', 'json', '--limit', '100', '--owner', '@me'];
    const userData = execGhJson(userArgs);
    const userProjects = userData?.projects || [];
    if (Array.isArray(userProjects) && userProjects.length > 0) {
      userProjects.forEach((p: any) => {
        const key = `${p.number}:${p.title}`;
        if (!seen.has(key)) {
          seen.add(key);
          projects.push({
            id: p.id || '',
            title: p.title || '',
            number: p.number || 0,
            closed: p.closed || false,
            ownerArg: '@me'
          });
        }
      });
    }
  } catch (err) {
    console.warn('[gh] Could not fetch user projects:', err instanceof Error ? err.message : String(err));
  }

  projectListCache.set(owner, projects);
  return projects;
}

function promptSelectProject(projects: ProjectInfo[]): Promise<ProjectInfo | null> {
  if (projects.length === 0) {
    console.warn('No projects found for this owner/account.');
    return Promise.resolve(null);
  }
  
  if (!process.stdin.isTTY) {
    throw new Error('Project selection requires a TTY (run in a terminal).');
  }

  console.log('\nSelect a GitHub Project to use:');
  console.log('Use ↑/↓ to choose, Enter to confirm, Ctrl+C to abort\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  readline.emitKeypressEvents(process.stdin, rl);
  const wasRaw = process.stdin.isRaw;
  if (!wasRaw) process.stdin.setRawMode?.(true);

  let index = 0;
  const numLines = projects.length;

  const render = () => {
    // Move cursor up to start of options and clear down
    readline.moveCursor(process.stdout, 0, -numLines);
    readline.clearScreenDown(process.stdout);
    projects.forEach((p, i) => {
      const prefix = i === index ? '›' : ' ';
      const closedTag = p.closed ? ' [closed]' : '';
      console.log(`${prefix} ${p.title} (#${p.number})${closedTag}`);
    });
  };

  // Initial render
  projects.forEach((p, i) => {
    const prefix = i === index ? '›' : ' ';
    const closedTag = p.closed ? ' [closed]' : '';
    console.log(`${prefix} ${p.title} (#${p.number})${closedTag}`);
  });

  return new Promise<ProjectInfo | null>((resolve) => {
    const onKeypress = (_str: string, key: readline.Key) => {
      if (key.name === 'up') {
        index = (index - 1 + projects.length) % projects.length;
        render();
      } else if (key.name === 'down') {
        index = (index + 1) % projects.length;
        render();
      } else if (key.name === 'return') {
        cleanup();
        resolve(projects[index]);
      } else if (key.name === 'c' && key.ctrl) {
        cleanup();
        process.exit(1);
      }
    };

    const cleanup = () => {
      process.stdin.off('keypress', onKeypress);
      if (!wasRaw) process.stdin.setRawMode?.(false);
      rl.close();
      console.log();
    };

    process.stdin.on('keypress', onKeypress);
  });
}

function getProjectByNumber(owner: string, number: number): ProjectInfo | null {
  // List all projects and find by number
  const projects = listProjects(owner);
  return projects.find(p => p.number === number) || null;
}

type ProjectFieldInfo = { id: string; name: string; dataType?: string; type?: string; options?: { id: string; name: string }[] };

const projectFieldsCache = new Map<string, ProjectFieldInfo[]>();

// Cache for project items to avoid repeated item-list calls per run
const projectItemsCache = new Map<string, any[]>();

function listProjectItems(owner: string, projectNumber: number, refresh = false): any[] {
  const key = `${owner}/${projectNumber}`;
  if (!refresh && projectItemsCache.has(key)) {
    return projectItemsCache.get(key)!;
  }
  try {
    const data = execGhJson([
      'project',
      'item-list',
      String(projectNumber),
      '--owner',
      owner,
      '--format',
      'json',
      '--limit',
      '200'
    ]);
    const items = Array.isArray(data?.items) ? data.items : [];
    projectItemsCache.set(key, items);
    return items;
  } catch (err) {
    console.warn('[gh] Failed to fetch project items:', err instanceof Error ? err.message : String(err));
    return projectItemsCache.get(key) || [];
  }
}

function getProjectFields(owner: string, projectNumber: number, refresh = false): ProjectFieldInfo[] {
  const key = `${owner}/${projectNumber}`;
  if (!refresh && projectFieldsCache.has(key)) {
    return projectFieldsCache.get(key)!;
  }

  try {
    const args = ['project', 'field-list', String(projectNumber), '--format', 'json', '--owner', owner, '--limit', '100'];

    const data = execGhJson(args);
    if (VERBOSE) console.log('[gh] Project fields data:', JSON.stringify(data));
    const fields = data?.fields || [];
    const mapped = Array.isArray(fields)
      ? fields.map((f: any) => ({
          id: f.id,
          name: f.name,
          dataType: f.dataType || f.type,
          type: f.type,
          options: f.options
        }))
      : [];
    projectFieldsCache.set(key, mapped);
    return mapped;
  } catch (err) {
    console.warn(`[gh] Failed to fetch project fields for ${owner}/${projectNumber}:`, err instanceof Error ? err.message : String(err));
    return projectFieldsCache.get(key) || [];
  }
}

function ensureSingleSelectField(owner: string, projectNumber: number, name: string, desiredOptions: string[]): { id: string; options: Record<string, string> } {
  // First attempt: use cached field list
  let fields = getProjectFields(owner, projectNumber);
  let fieldInfo = fields.find((f) => f.name === name);

  // If field doesn't exist, create it, then refresh field list once
  if (!fieldInfo) {
    const args = ['project', 'field-create', String(projectNumber), '--name', name, '--owner', owner, '--data-type', 'SINGLE_SELECT', '--format', 'json', '--single-select-options'];
    args.push(desiredOptions.length > 0 ? desiredOptions.join(',') : 'default');

    let createError: unknown;
    try {
      const result = execGhJson(args);
      fieldInfo = { id: result.id, name, dataType: 'SINGLE_SELECT', options: [] };
      // Refresh once after create so cache contains options
      fields = getProjectFields(owner, projectNumber, true);
    } catch (err) {
      createError = err;
      // Refresh once to check if concurrent creation succeeded
      fields = getProjectFields(owner, projectNumber, true);
      fieldInfo = fields.find((f) => f.name === name);
      if (!fieldInfo) {
        const msg = createError instanceof Error ? createError.message : String(createError);
        throw new Error(`Failed to upsert field ${name}: ${msg}`);
      }
    }
  }

  // Build option map from the same (potentially refreshed) field list
  const fieldWithOptions = (fields.find((f) => f.name === name) || fieldInfo);
  const optionMap: Record<string, string> = {};
  if (fieldWithOptions?.options) {
    for (const o of fieldWithOptions.options) {
      optionMap[o.name] = o.id;
    }
  }

  return { id: fieldInfo?.id || fieldWithOptions?.id || '', options: optionMap };
}

export async function ensureProjectConfiguredAsync(configOrPath?: RepoConfig | string, repo?: string): Promise<RepoConfig> {
  let config: RepoConfig;
  if (typeof configOrPath === 'string') {
    try {
      config = loadConfig(configOrPath);
    } catch {
      config = { version: '1.0.0', repository: repo || '' } as RepoConfig;
    }
  } else if (configOrPath) {
    config = configOrPath;
  } else {
    try {
      config = loadConfig();
    } catch {
      config = { version: '1.0.0', repository: repo || '' } as RepoConfig;
    }
  }

  if (!repo) {
    repo = config.repository;
  }
  
  const owner = repoOwner(repo);
  let project = config.project;
  if (!project || !project.number) {
    const projects = listProjects(owner);
    const sel = await promptSelectProject(projects);
    if (sel) {
      const projId = sel.id || getProjectId(sel.ownerArg, sel.number) || undefined;
      config.project = { owner: sel.ownerArg, number: sel.number, id: projId, fields: config.project?.fields };
      saveConfig(config);
    }
  }
  // Ensure id is populated
  if (config.project && !config.project.id) {
    const projId = getProjectId(config.project.owner || owner, config.project.number) || undefined;
    config.project = { owner: config.project.owner || owner, number: config.project.number, id: projId, fields: config.project.fields };
    saveConfig(config);
  }
  // Ensure fields and options
  if (config.project?.id && config.project?.number) {
    const owner = config.project.owner || repoOwner(repo);
    // Prefetch project fields once to populate cache and minimize gh calls
    try {
      getProjectFields(owner, config.project.number);
    } catch (e) {
      console.warn('[gh] Unable to prefetch project fields:', e instanceof Error ? e.message : String(e));
    }
    const scopeList = config.scopes || [];
    const sizeList = config.sizes || [];
    const priorityList = config.priorities || [];
    const scopeField = ensureSingleSelectField(owner, config.project.number, 'Scope', scopeList);
    const sizeField = ensureSingleSelectField(owner, config.project.number, 'Size', sizeList);
    const priorityField = ensureSingleSelectField(owner, config.project.number, 'Priority', priorityList);
    config.project.fields = {
      scope: { id: scopeField.id, options: scopeField.options },
      size: { id: sizeField.id, options: sizeField.options },
      priority: { id: priorityField.id, options: priorityField.options },
    };
    saveConfig(config);
  }
  return config;
}

function ensureIssueInProjectAndSetFields(
  repo: string,
  issueNumber: number,
  issue: Issue,
  config: RepoConfig
): void {
  if (!config.project?.number || !config.project?.id) return;
  const owner = config.project.owner || repoOwner(repo);
  const issueUrl = `https://github.com/${repo}/issues/${issueNumber}`;

  const findItemId = (): string | null => {
    try {
      const items = listProjectItems(owner, config.project!.number);
      const hit = Array.isArray(items) ? items.find((it: any) => it?.content?.url === issueUrl) : null;
      return hit?.id || null;
    } catch (err) {
      console.warn('[gh] Failed to list project items:', err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  let itemId = findItemId();
  if (!itemId) {
    try {
      const added = execGhJson([
        'project',
        'item-add',
        String(config.project!.number),
        '--owner',
        owner,
        '--url',
        issueUrl,
        '--format',
        'json'
      ]);
      itemId = added?.id || added?.item?.id || null;
      // Refresh cache after add to pick up the new item
      listProjectItems(owner, config.project!.number, true);
    } catch (err) {
      console.warn('[gh] Failed to add item to project:', err instanceof Error ? err.message : String(err));
      // On failure, try refreshing and finding again
      listProjectItems(owner, config.project!.number, true);
      itemId = findItemId();
    }
  }
  if (!itemId) return;

  const getIssueSize = (iss: Issue): string => {
    // Prefer Size column
    const valA = (iss as any).Size;
    const valB = (iss as any).Size;
    return (valA && String(valA)) || (valB && String(valB)) || '';
  };

  const setField = (fieldKey: 'scope' | 'size' | 'priority', value: string) => {
    if (!value || !config.project?.fields) return;
    const field = config.project.fields[fieldKey];
    if (!field?.id) return;
    const optionId = field.options?.[value];
    if (!optionId) return;
    try {
      execGh([
        'project',
        'item-edit',
        String(config.project!.number),
        '--project-id',
        String(config.project!.id),
        '--id',
        itemId!,
        '--field-id',
        field.id,
        '--single-select-option-id',
        optionId
      ]);
    } catch (err) {
      console.warn(`[gh] Failed to set ${fieldKey}=${value}:`, err instanceof Error ? err.message : String(err));
    }
  };

  if (issue.Scope) setField('scope', issue.Scope);
  {
    const sizeVal = getIssueSize(issue);
    if (sizeVal) setField('size', sizeVal);
  }
  if (issue.Priority) setField('priority', issue.Priority);
}

function listMilestones(repo: string): { title: string; number: number }[] {
  const milestones = execGhJson(['api', `repos/${repo}/milestones`]);
  return Array.isArray(milestones)
    ? milestones.map((m: any) => ({ title: m.title, number: m.number }))
    : [];
}

function createMilestone(repo: string, title: string): { title: string; number: number } | null {
  try {
    // Use -F to send JSON body fields; -f is for query params
    const data = execGhJson(['api', `repos/${repo}/milestones`, '-X', 'POST', '-F', `title=${title}`]);
    return { title: data.title, number: data.number };
  } catch (err) {
    console.warn(`[gh] Failed to create milestone "${title}":`, err instanceof Error ? err.message : String(err));
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
  const data = execGhJson([
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
  return Array.isArray(data) ? (data as GithubIssue[]) : [];
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
    /<!--\s*GFS-ID:.*?-->\s*\n?(?:<!--\s*GFS-HASH:.*?-->\s*\n?)?([\s\S]*)/
  );
  const description = descriptionMatch ? descriptionMatch[1].trim() : '';

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

    // milestone: outer flow ensures existence; just pass if present
    if (issue.Milestone && issue.Milestone.trim()) {
      args.push('--milestone', issue.Milestone);
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
      '--body-file',
      '-',
    ];
    if (issue.Milestone && issue.Milestone.trim()) {
      args.push('--milestone', issue.Milestone);
    }
    execGhInput(args, body);
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

${issue.Description}`;

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
  options: ImportOptions,
  config?: RepoConfig
): { created: number; updated: number; skipped: number } {
  const { dryRun, createOnly, updateOnly, autoCreateLabels, autoCreateMilestones } = options;
  const repo = options.repo;
  
  if (!config) {
    try {
      config = loadConfig();
    } catch {
      config = { version: '1.0.0', repository: repo } as RepoConfig;
    }
  }

  // Prime project list cache at the start of the run
  try {
    const owner = repoOwner(repo);
    listProjects(owner);
  } catch (e) {
    console.warn('[gh] Unable to prime project list cache:', e instanceof Error ? e.message : String(e));
  }

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

        // Link/update in project and set custom fields
        ensureIssueInProjectAndSetFields(repo, existing.number, issue, config);

        if (autoCreateLabels) {
          const sizeVal = (issue as any).Size || (issue as any)['Size'];
          const labels = [`scope:${issue.Scope || 'other'}`, `size:${sizeVal || 'M'}`];
          if (issue.Priority) {
            labels.push(`priority:${issue.Priority}`);
          }
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

        // Link/update in project and set custom fields
        ensureIssueInProjectAndSetFields(repo, result.number, issue, config);

        if (autoCreateLabels) {
          const sizeVal = (issue as any).Size || (issue as any)['Size'];
          const labels = [`scope:${issue.Scope || 'other'}`, `size:${sizeVal || 'M'}`];
          if (issue.Priority) {
            labels.push(`priority:${issue.Priority}`);
          }
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
