import { createHash } from 'crypto';
import type { Issue } from '../types.js';

/**
 * Computes a SHA-256 hash of the logical fields of an issue
 * Used to detect if an issue has changed
 */
export function computeContentHash(issue: Issue): string {
  const content = JSON.stringify({
    description: issue.Description,
    scope: issue.Scope,
    size: issue['Size'],
    priority: issue.Priority,
    milestone: issue.Milestone,
  });

  return createHash('sha256').update(content).digest('hex');
}

/**
 * Computes a combined hash of title + content for full-issue comparison
 */
export function computeFullHash(issue: Issue): string {
  const content = JSON.stringify({
    title: issue.Title,
    description: issue.Description,
    scope: issue.Scope,
    size: issue['Size'],
    milestone: issue.Milestone,
  });

  return createHash('sha256').update(content).digest('hex');
}
