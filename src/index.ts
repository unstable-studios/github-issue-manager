#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { resolve, extname } from 'path';
import { generateExampleIssues } from './commands/init.js';
import { validateIssues, fixIssues } from './commands/lint.js';
import { importIssues, setGhVerbose, ensureProjectConfiguredAsync } from './commands/import.js';
import { exportIssues } from './commands/export.js';
import { createConfig, validateConfig, loadConfig } from './commands/config.js';
import { migrateWithConfig } from './commands/migrate.js';
import { readCSV, writeCSV } from './formats/csv.js';
import { readJSON, writeJSON, writeJSONArray } from './formats/json.js';
import type { Issue } from './types.js';
import { detectGitHubRepo } from './utils/git.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  try {
    switch (command) {
      case 'init-config':
        handleInitConfig(args.slice(1));
        break;

      case 'validate-config':
        handleValidateConfig(args.slice(1));
        break;

      case 'init':
        handleInit(args.slice(1));
        break;

      case 'lint':
        handleLint(args.slice(1));
        break;

      case 'import':
        await handleImport(args.slice(1));
        break;

      case 'export':
        handleExport(args.slice(1));
        break;

      case 'migrate':
        await handleMigrate(args.slice(1));
        break;

      default:
        showHelp();
    }
  } catch (error) {
    console.error(
      'Error:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

function handleInitConfig(args: string[]) {
  let output: string | undefined;
  let repo: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      output = args[++i];
    } else if (args[i] === '--repo') {
      repo = args[++i];
    }
  }

  createConfig(output, repo);
}

function handleValidateConfig(args: string[]) {
  const configPath = args[0];
  validateConfig(configPath);
}

function handleInit(args: string[]) {
  let format = 'csv';
  let output = 'issues-template.csv';
  let example = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format') {
      format = args[++i] || 'csv';
    } else if (args[i] === '--output' || args[i] === '-o') {
      output = args[++i] || output;
    } else if (args[i] === '--example') {
      example = true;
    }
  }

  if (!output) {
    output = format === 'json' ? 'issues-template.json' : 'issues-template.csv';
  }

  const issues = example ? generateExampleIssues() : [];

  if (format === 'json') {
    writeJSON(output, issues);
  } else {
    writeCSV(output, issues);
  }

  console.log(`✓ Created template: ${output}`);
  if (example) {
    console.log(`  Includes ${issues.length} example issues`);
  }
}

function handleLint(args: string[]) {
  if (args.length === 0) {
    console.error('Usage: lint <file> [--config path] [--fix] [--output file]');
    process.exit(1);
  }

  const inputFile = args[0];
  let fix = false;
  let outputFile: string | null = null;
  let configPath: string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--fix') {
      fix = true;
    } else if (args[i] === '--output' || args[i] === '-o') {
      outputFile = args[++i];
    } else if (args[i] === '--config') {
      configPath = args[++i];
    }
  }

  // Load config
  const config = loadConfig(configPath);

  const ext = extname(inputFile).toLowerCase();
  let issues: Issue[];

  if (ext === '.json') {
    issues = readJSON(inputFile);
  } else {
    issues = readCSV(inputFile);
  }

  const result = validateIssues(issues, config, fix);

  console.log('\n📋 Validation Results:');
  console.log(`Total issues: ${issues.length}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach((err) => console.log(`  - ${err}`));
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach((warn) => console.log(`  - ${warn}`));
  }

  if (fix && outputFile) {
    const fixed = fixIssues(issues, config);
    if (ext === '.json') {
      writeJSON(outputFile, fixed);
    } else {
      writeCSV(outputFile, fixed);
    }
    console.log(`\n✓ Fixed issues written to: ${outputFile}`);
  }

  if (!result.valid) {
    process.exit(1);
  }
}

async function handleImport(args: string[]) {
  if (args.length === 0) {
    console.error(
      'Usage: import <file> [--repo <owner/repo>] [--config path] [--dry-run] [--create-only] [--update-only] [--auto-labels] [--auto-milestones]'
    );
    process.exit(1);
  }

  const inputFile = args[0];
  let repo = '';
  let dryRun = false;
  let createOnly = false;
  let updateOnly = false;
  let autoCreateLabels = false;
  let autoCreateMilestones = false;
  let verbose = false;
  let configPath: string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--repo') {
      repo = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--create-only') {
      createOnly = true;
    } else if (args[i] === '--update-only') {
      updateOnly = true;
    } else if (args[i] === '--auto-labels') {
      autoCreateLabels = true;
    } else if (args[i] === '--auto-milestones') {
      autoCreateMilestones = true;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      verbose = true;
    } else if (args[i] === '--config') {
      configPath = args[++i];
    }
  }

  // Auto-detect repo from git remote if not provided
  if (!repo) {
    const detected = detectGitHubRepo();
    if (detected) {
      repo = detected;
      console.log(`✓ Detected GitHub repo from git remote: ${repo}`);
    } else {
      console.error('Error: --repo flag is required (or run from within a git repo with GitHub remote)');
      process.exit(1);
    }
  }

  // Load config
  const config = loadConfig(configPath);

  const ext = extname(inputFile).toLowerCase();
  let issues: Issue[];

  if (ext === '.json') {
    issues = readJSON(inputFile);
  } else {
    issues = readCSV(inputFile);
  }

  console.log(`📤 Importing ${issues.length} issues to ${repo}...`);
  if (dryRun) {
    console.log('   (DRY-RUN mode)\n');
  }

  // Validate before import
  const validation = validateIssues(issues, config);
  if (!validation.valid) {
    console.error('\n❌ Validation failed:');
    validation.errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  if (verbose) {
    setGhVerbose(true);
  }

  // Ensure project is configured before import (handles async prompt)
  const configWithProject = await ensureProjectConfiguredAsync(config, repo);

  const result = importIssues(issues, {
    dryRun,
    createOnly,
    updateOnly,
    autoCreateLabels,
    autoCreateMilestones,
    repo,
  }, configWithProject);

  console.log('\n📊 Import Summary:');
  console.log(`  Created: ${result.created}`);
  console.log(`  Updated: ${result.updated}`);
  console.log(`  Skipped: ${result.skipped}`);

  if (dryRun) {
    console.log('\n(No changes made - DRY-RUN mode)');
  }
}

  async function handleMigrate(args: string[]) {
    if (args.length === 0) {
      console.error('Usage: migrate <input-file> [--output file] [--config path]');
      process.exit(1);
    }

    const inputFile = args[0];
    let outputFile: string | undefined;
    let configPath: string | undefined;

    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--output' || args[i] === '-o') {
        outputFile = args[++i];
      } else if (args[i] === '--config') {
        configPath = args[++i];
      }
    }

    const resolvedOutput = outputFile || 'migrated.csv';
    await migrateWithConfig(inputFile, resolvedOutput, configPath);
  }

function handleExport(args: string[]) {
  let repo = '';
  let format = 'csv';
  let output: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo') {
      repo = args[++i];
    } else if (args[i] === '--format') {
      format = args[++i];
    } else if (args[i] === '--output' || args[i] === '-o') {
      output = args[++i];
    }
  }

  // Auto-detect repo from git remote if not provided
  if (!repo) {
    const detected = detectGitHubRepo();
    if (detected) {
      repo = detected;
      console.log(`✓ Detected GitHub repo from git remote: ${repo}`);
    } else {
      console.error('Usage: export --repo <owner/repo> [--format csv|json] [--output file]');
      console.error('(or run from within a git repo with GitHub remote)');
      process.exit(1);
    }
  }

  if (!output) {
    output = format === 'json' ? 'issues-export.json' : 'issues-export.csv';
  }

  const issues = exportIssues({ repo, format: format as 'csv' | 'json', output });

  if (format === 'json') {
    writeJSON(output, issues);
  } else {
    writeCSV(output, issues);
  }

  console.log(`✓ Exported to: ${output}`);
}

function showHelp() {
  console.log(`
GitHub Issue Manager v1.0.0

Usage: gim <command> [options]

Commands:

  init-config         Create a repository configuration file
    --repo OWNER/REPO             GitHub repository
    --output, -o FILE             Output file path (default: .gim-config.json)

  validate-config [file]  Validate a repository configuration file
                          (default: .gim-config.json)

  init                Generate a template file for writing issues
    --format csv|json             Output format (default: csv)
    --output, -o FILE             Output file path
    --example                     Include example issues

  lint <file>         Validate issues in a CSV or JSON file
    --config FILE                 Path to config file (default: .gim-config.json)
    --fix                         Auto-fix validation errors
    --output, -o FILE             Write fixed output to file

  import <file>       Import issues from CSV or JSON file to GitHub
    --repo OWNER/REPO             GitHub repository (auto-detects from git remote if omitted)
    --config FILE                 Path to config file (default: .gim-config.json)
    --dry-run                     Show what would happen without changes
    --create-only                 Only create new issues, skip updates
    --update-only                 Only update existing issues, skip creation
    --auto-labels                 Auto-create scope:*, size:*, priority:* labels
    --auto-milestones             Create missing milestones by name if they don't exist
    --verbose, -v                 Print gh commands as they run

  export              Export issues from GitHub to CSV or JSON
    --repo OWNER/REPO             GitHub repository (auto-detects from git remote if omitted)
    --format csv|json             Output format (default: csv)
    --output, -o FILE             Output file path

  migrate <file>     Interactive migrate/normalize CSV against config
    --output, -o FILE             Output file path (default: migrated.csv)
    --config FILE                 Path to config file (default: .gim-config.json)

Examples:

  # Setup repo config first
  gim init-config --repo myorg/myrepo
  # Edit .gim-config.json to define your scopes and sizes

  # Validate config
  gim validate-config

  # Create a template file
  gim init --output issues.csv --example

  # Validate and auto-fix issues
  gim lint issues.csv --fix --output issues-fixed.csv

  # Import to GitHub (dry-run first)
  gim import issues.csv --repo myorg/myrepo --dry-run
  gim import issues.csv --repo myorg/myrepo --auto-labels

  # Export back from GitHub
  gim export --repo myorg/myrepo --output exported.csv
`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
