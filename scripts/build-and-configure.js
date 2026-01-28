#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = resolve(__dirname, '..');

function getConfigPath() {
  const platform = process.platform;
  
  if (platform === 'win32') {
    return join(homedir(), '.config', 'opencode', 'opencode.json');
  } else {
    return join(homedir(), '.local', 'share', 'opencode', 'opencode.json');
  }
}

function getConfigDirectory() {
  return dirname(getConfigPath());
}

function getIndexPath() {
  return join(projectRoot, 'dist', 'index.js');
}

function buildProject() {
  console.error('Building TypeScript...');
  try {
    execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });
    console.error('Build successful!');
  } catch (error) {
    console.error('Build failed!');
    process.exit(1);
  }
}

function updateConfig() {
  const configPath = getConfigPath();
  const configDir = getConfigDirectory();
  const indexPath = getIndexPath();

  console.error(`Updating opencode config: ${configPath}`);

  let config = {};

  if (existsSync(configPath)) {
    try {
      const existingConfig = readFileSync(configPath, 'utf8');
      config = JSON.parse(existingConfig);
      console.error('Found existing opencode config');
    } catch (error) {
      console.error('Error reading existing config, creating new one');
      config = {};
    }
  }

  if (!config.$schema) {
    config.$schema = 'https://opencode.ai/config.json';
  }

  if (!config.mcp) {
    config.mcp = {};
  }

  config.mcp.hise = {
    type: 'local',
    command: ['node', indexPath],
    enabled: true
  };

  const configString = JSON.stringify(config, null, 2);

  try {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, configString, 'utf8');
    console.error(`✓ Updated opencode config with HISE MCP server`);
    console.error(`  Command: node ${indexPath}`);
    console.error(`\nRestart Opencode to apply changes`);
  } catch (error) {
    console.error(`Error writing config file: ${error.message}`);
    console.error(`You may need to run this script with elevated privileges`);
    console.error(`\nManual config entry:`);
    console.error(JSON.stringify({ mcp: { hise: config.mcp.hise } }, null, 2));
    process.exit(1);
  }
}

buildProject();
updateConfig();
