import type { Issue, ValidationResult } from '../types.js';
import { isValidUUID, generateUUID } from '../utils/uuid.js';
import type { RepoConfig } from '../config.js';

/**
 * Validates an array of issues against repo config
 */
export function validateIssues(
  issues: Issue[],
  config: RepoConfig,
  fix: boolean = false
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const fixedIssues: Issue[] = [];

  const VALID_SCOPES = config.scopes || [];
  const VALID_SIZES = config.sizes || [];
  const VALID_PRIORITIES = config.priorities || [];

  issues.forEach((issue, index) => {
    const row = index + 2; // Account for header row

    // Validate GFS_ID
    if (!issue.GFS_ID || !issue.GFS_ID.trim()) {
      if (fix) {
        issue.GFS_ID = generateUUID();
        warnings.push(`Row ${row}: Generated missing GFS_ID`);
      } else {
        errors.push(`Row ${row}: GFS_ID is required and cannot be empty`);
      }
    } else if (!isValidUUID(issue.GFS_ID)) {
      if (fix) {
        issue.GFS_ID = generateUUID();
        warnings.push(`Row ${row}: Invalid GFS_ID format, regenerated`);
      } else {
        errors.push(`Row ${row}: GFS_ID must be a valid UUID v4`);
      }
    }

    // Check for duplicate GFS_IDs
    if (issue.GFS_ID && seen.has(issue.GFS_ID)) {
      errors.push(
        `Row ${row}: Duplicate GFS_ID "${issue.GFS_ID}" (already seen in earlier row)`
      );
    } else if (issue.GFS_ID) {
      seen.add(issue.GFS_ID);
    }

    // Validate Title
    if (!issue.Title || !issue.Title.trim()) {
      errors.push(`Row ${row}: Title is required and cannot be empty`);
    }

    // Check for duplicate Titles
    const existingTitles = fixedIssues.map((i) => i.Title);
    if (
      issue.Title &&
      existingTitles.includes(issue.Title) &&
      !errors.some((e) => e.includes('duplicate'))
    ) {
      warnings.push(
        `Row ${row}: Duplicate title "${issue.Title}" (already seen in earlier row)`
      );
    }

    // Validate Scope (only if scopes are configured)
    if (VALID_SCOPES.length > 0 && issue.Scope && !VALID_SCOPES.includes(issue.Scope)) {
      errors.push(
        `Row ${row}: Invalid Scope "${issue.Scope}". Must be one of: ${VALID_SCOPES.join(', ')}`
      );
    }

    // Validate Size (only if sizes are configured)
    if (VALID_SIZES.length > 0 && issue['Size'] && !VALID_SIZES.includes(issue['Size'])) {
      errors.push(
        `Row ${row}: Invalid Size "${issue['Size']}". Must be one of: ${VALID_SIZES.join(', ')}`
      );
    }

    // Validate Priority (only if priorities are configured)
    if (VALID_PRIORITIES.length > 0 && issue.Priority && !VALID_PRIORITIES.includes(issue.Priority)) {
      errors.push(
        `Row ${row}: Invalid Priority "${issue.Priority}". Must be one of: ${VALID_PRIORITIES.join(', ')}`
      );
    }

    // Validate Acceptance Criteria format (should be markdown task list)
    if (issue['Acceptance Criteria'] && issue['Acceptance Criteria'].trim()) {
      const lines = issue['Acceptance Criteria'].split('\n');
      const hasTaskItems = lines.some((line) => line.match(/^\s*-\s*\[\s*[\sx]\s*\]/));

      if (!hasTaskItems) {
        warnings.push(
          `Row ${row}: Acceptance Criteria should use markdown task list format (- [ ] item)`
        );
      }
    }

    // Warn if Milestone is empty
    if (!issue.Milestone || !issue.Milestone.trim()) {
      warnings.push(`Row ${row}: Milestone is empty`);
    }

    fixedIssues.push(issue);
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Fixes issues in-place and returns fixed array
 */
export function fixIssues(issues: Issue[], config: RepoConfig): Issue[] {
  const fixed = [...issues];
  validateIssues(fixed, config, true);
  return fixed;
}
