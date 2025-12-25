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
  customFields?: Record<string, any>; // Future extensibility
}

export const DEFAULT_CONFIG: RepoConfig = {
  version: '1.0.0',
  repository: '',
  scopes: ['frontend', 'backend', 'devops', 'documentation', 'other'],
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  priorities: ['P0', 'P1', 'P2', 'P3'],
};
