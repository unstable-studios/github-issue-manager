#!/usr/bin/env node

/**
 * Example workflow demonstrating all CLI commands
 * Run: node examples/workflow.js
 */

import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const CLI = 'npm run cli --';

function run(command) {
  console.log(`\n$ ${command}`);
  try {
    const output = execSync(command, { encoding: 'utf-8', cwd: resolve(import.meta.dirname, '..') });
    console.log(output);
  } catch (error) {
    console.error(error.stdout || error.message);
    throw error;
  }
}

function cleanup(file) {
  if (existsSync(file)) {
    unlinkSync(file);
  }
}

console.log('='.repeat(60));
console.log('GitHub Issue Manager - Example Workflow');
console.log('='.repeat(60));

try {
  // Step 1: Create template with examples
  console.log('\n[1/5] Creating template with examples...');
  cleanup('example-issues.csv');
  run(`${CLI} init --output example-issues.csv --example`);

  // Step 2: Validate the template
  console.log('\n[2/5] Validating template...');
  run(`${CLI} lint example-issues.csv`);

  // Step 3: Create JSON version
  console.log('\n[3/5] Creating JSON template...');
  cleanup('example-issues.json');
  run(`${CLI} init --output example-issues.json --format json --example`);

  // Step 4: Validate JSON
  console.log('\n[4/5] Validating JSON...');
  run(`${CLI} lint example-issues.json`);

  // Step 5: Test validation error
  console.log('\n[5/5] Testing validation with invalid data...');
  console.log('(This should show errors)');
  
  // Write a bad CSV for testing
  const badCSV = resolve('bad-issues.csv');
  const fs = await import('fs');
  fs.writeFileSync(
    badCSV,
    'GFS_ID,Title,Milestone,Scope,Size,Description,Acceptance Criteria\n' +
      'invalid-uuid,Duplicate Title,v1.0.0,invalid-scope,INVALID-SIZE,Test,Test\n' +
      'another-invalid,Duplicate Title,v1.0.0,frontend,M,Test2,Test2\n'
  );

  try {
    run(`${CLI} lint bad-issues.csv`);
  } catch (error) {
    console.log('✓ Validation correctly caught errors');
  }

  cleanup(badCSV);

  console.log('\n' + '='.repeat(60));
  console.log('✓ All examples completed successfully!');
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('  1. Edit example-issues.csv with your issues');
  console.log('  2. Run: npm run cli import example-issues.csv --repo owner/repo --dry-run');
  console.log('  3. Run: npm run cli import example-issues.csv --repo owner/repo --auto-labels');
  console.log('  4. Run: npm run cli export --repo owner/repo --output exported.csv');

} catch (error) {
  console.error('\n❌ Example workflow failed:', error.message);
  process.exit(1);
}
