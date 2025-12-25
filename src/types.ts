/**
 * Core types for GitHub Issue Manager
 */

// Note: Scope and TShirtSize are now dynamic per repo config
export type Scope = string;
export type TShirtSize = string;

export interface Issue {
  GFS_ID: string;
  Title: string;
  Milestone: string;
  Scope?: Scope;
  'T-Shirt Size'?: TShirtSize;
  Priority?: string;
  Description: string;
  'Acceptance Criteria': string; // Markdown task list
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ImportOptions {
  dryRun?: boolean;
  createOnly?: boolean;
  updateOnly?: boolean;
  autoCreateMilestones?: boolean;
  autoCreateLabels?: boolean;
  repo: string; // owner/repo
}

export interface ExportOptions {
  repo: string; // owner/repo
  format: 'csv' | 'json';
  output?: string; // output file path
}

export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  milestone?: {
    title: string;
  };
  labels: Array<{
    name: string;
  }>;
}

export interface InternalIssueData {
  gfsId: string;
  contentHash: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  scope: Scope;
  size: TShirtSize;
  milestone: string;
}
