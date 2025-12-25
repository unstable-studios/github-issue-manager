import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { RepoConfig } from '../config.js';
import { DEFAULT_CONFIG } from '../config.js';

const CONFIG_FILE = '.gim-config.json';

/**
 * Loads repo configuration from file
 */
export function loadConfig(configPath?: string): RepoConfig {
  const path = configPath || CONFIG_FILE;

  if (!existsSync(path)) {
    throw new Error(
      `Config file not found: ${path}\n\nRun 'gim init-config' to create one.`
    );
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const config = JSON.parse(content) as RepoConfig;

    // Note: scopes, sizes, and priorities are now optional
    // If not provided, validation will skip those checks

    return config;
  } catch (error) {
    throw new Error(
      `Failed to load config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Creates a new config file with example values
 */
export function createConfig(
  outputPath?: string,
  repo?: string
): void {
  const path = outputPath || CONFIG_FILE;

  if (existsSync(path)) {
    throw new Error(`Config file already exists: ${path}`);
  }

  const config: RepoConfig = {
    ...DEFAULT_CONFIG,
    repository: repo || 'owner/repo',
    scopes: [
      'frontend',
      'backend',
      'core',
      'ui',
      'middleware',
      'devops',
      'documentation',
      'other',
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    priorities: ['P0', 'P1', 'P2', 'P3'],
    milestones: ['v1.0.0', 'v2.0.0'],
  };

  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`✓ Created config file: ${path}`);
  console.log('\nEdit this file to customize:');
  console.log('  - repository: GitHub owner/repo');
  console.log('  - scopes: (optional) Valid scope values for your project');
  console.log('  - sizes: (optional) Valid t-shirt sizes');
  console.log('  - priorities: (optional) Valid priority values');
  console.log('  - milestones: (optional) Valid milestone names');
}

/**
 * Validates a config file
 */
export function validateConfig(configPath?: string): void {
  const path = configPath || CONFIG_FILE;

  try {
    const config = loadConfig(path);

    console.log('✓ Config file is valid\n');
    console.log(`Repository: ${config.repository}`);
    
    if (config.scopes && config.scopes.length > 0) {
      console.log(`Scopes: ${config.scopes.join(', ')}`);
    }
    
    if (config.sizes && config.sizes.length > 0) {
      console.log(`Sizes: ${config.sizes.join(', ')}`);
    }
    
    if (config.priorities && config.priorities.length > 0) {
      console.log(`Priorities: ${config.priorities.join(', ')}`);
    }

    if (config.milestones && config.milestones.length > 0) {
      console.log(`Milestones: ${config.milestones.join(', ')}`);
    }
  } catch (error) {
    console.error(
      '❌',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}
