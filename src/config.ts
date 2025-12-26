/**
 * Repository-specific configuration schema
 */

export interface RepoConfig {
  version: string;
  repository: string; // owner/repo
  scopes?: string[]; // Optional: e.g., ["frontend", "backend", "core", "ui", "middleware"]
  sizes?: string[]; // Optional: e.g., ["XS", "S", "M", "L", "XL", "XXL"]
  priorities?: string[]; // Optional: e.g., ["P0", "P1", "P2", "P3"] or ["Critical", "High", "Medium", "Low"]
  milestones?: string[]; // Optional list of valid milestones
  scopeAliases?: Record<string, string>; // Optional mapping of legacy scope -> canonical scope
  sizeAliases?: Record<string, string>; // Optional mapping of legacy size -> canonical size
  priorityAliases?: Record<string, string>; // Optional mapping of legacy priority -> canonical priority
  customFields?: Record<string, any>; // Future extensibility
  project?: {
    owner: string; // project owner (defaults to repo owner)
    number: number; // project number (as shown in GitHub UI)
    id?: string; // project ID
    fields?: {
      scope?: { id: string; options?: Record<string, string> };
      size?: { id: string; options?: Record<string, string> };
      priority?: { id: string; options?: Record<string, string> };
    };
  };
}

export const DEFAULT_CONFIG: RepoConfig = {
  version: '1.0.0',
  repository: '',
  scopes: ['frontend', 'backend', 'devops', 'documentation', 'other'],
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  priorities: ['P0', 'P1', 'P2', 'P3'],
  scopeAliases: {},
  sizeAliases: {},
  priorityAliases: {},
  project: undefined,
};
