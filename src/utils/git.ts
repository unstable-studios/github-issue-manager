import { execSync } from 'child_process';

/**
 * Detects GitHub repo (owner/repo) from local git remote
 * Returns undefined if not in a git repo or remote isn't GitHub
 */
export function detectGitHubRepo(): string | undefined {
  try {
    // Get the remote URL for 'origin'
    const remoteUrl = execSync('git remote get-url origin', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'], // suppress stderr
    }).trim();

    // Parse GitHub repo from various URL formats:
    // - https://github.com/owner/repo.git
    // - git@github.com:owner/repo.git
    // - https://github.com/owner/repo

    let match: RegExpMatchArray | null = null;

    // Try HTTPS format
    match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/);
    
    if (match) {
      return match[1];
    }

    return undefined;
  } catch {
    // Not in a git repo or no origin remote
    return undefined;
  }
}
