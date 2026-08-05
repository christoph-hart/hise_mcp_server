#!/usr/bin/env node

/**
 * Prompt Variant Testing Framework
 *
 * This script tests different tool description variants to measure
 * which descriptions lead to better tool selection by LLMs.
 *
 * Usage:
 *   node scripts/test-prompt-variants.mjs [variant]
 *
 * If no variant specified, tests all variants.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load configuration
const configPath = join(rootDir, 'prompt-variants', 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

// Load test cases
const testCasesDir = join(rootDir, 'prompt-variants', 'test-cases');
const toolSelectionTests = JSON.parse(
  readFileSync(join(testCasesDir, 'tool-selection.json'), 'utf8')
);
const edgeCaseTests = JSON.parse(
  readFileSync(join(testCasesDir, 'edge-cases.json'), 'utf8')
);

// MCP Server communication
class MCPTestClient {
  constructor() {
    this.server = null;
    this.responseBuffer = '';
    this.requestId = 1;
    this.pendingRequests = new Map();
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = spawn('node', [join(rootDir, 'dist', 'index.js')], {
        stdio: ['pipe', 'pipe', 'inherit'],
      });

      this.server.stdout.on('data', (data) => {
        this.responseBuffer += data.toString();
        this.processResponses();
      });

      this.server.on('error', reject);

      // Wait for server to start
      setTimeout(resolve, 500);
    });
  }

  processResponses() {
    const lines = this.responseBuffer.split('\n');
    this.responseBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            pending.resolve(response);
            this.pendingRequests.delete(response.id);
          }
        } catch (e) {
          // Ignore non-JSON lines
        }
      }
    }
  }

  async callTool(toolName, args) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const request = {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: toolName, arguments: args }
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.server.stdin.write(JSON.stringify(request) + '\n');

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  async listTools() {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const request = {
        jsonrpc: '2.0',
        id,
        method: 'tools/list',
        params: {}
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.server.stdin.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  stop() {
    if (this.server) {
      this.server.kill();
    }
  }
}

// Test execution
async function runServerTests() {
  console.log('\\n=== HISE MCP Server Functional Tests ===\\n');

  const client = new MCPTestClient();
  await client.start();

  const results = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: { passed: 0, failed: 0, total: 0 }
  };

  // Test 1: List tools
  console.log('Testing tool listing...');
  try {
    const toolsResponse = await client.listTools();
    const tools = toolsResponse.result?.tools || [];
    console.log(`  Found ${tools.length} tools`);

    const expectedTools = [
      'search_hise', 'query_scripting_api', 'query_ui',
      'query_module', 'list_snippets', 'get_snippet',
      'list_ui_components', 'list_scripting_namespaces', 'list_module_types'
    ];

    const missingTools = expectedTools.filter(t => !tools.find(tool => tool.name === t));
    if (missingTools.length === 0) {
      console.log('  ✓ All expected tools present');
      results.tests.push({ name: 'list_tools', passed: true });
      results.summary.passed++;
    } else {
      console.log(`  ✗ Missing tools: ${missingTools.join(', ')}`);
      results.tests.push({ name: 'list_tools', passed: false, error: `Missing: ${missingTools}` });
      results.summary.failed++;
    }
    results.summary.total++;
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
    results.tests.push({ name: 'list_tools', passed: false, error: error.message });
    results.summary.failed++;
    results.summary.total++;
  }

  // Test 2: search_hise tool
  console.log('\\nTesting search_hise...');
  const searchTests = [
    { query: 'midi', expectedMinResults: 1, description: 'keyword search' },
    { query: 'Synth.addNoteOn', expectedMinResults: 1, description: 'exact match' },
    { query: 'setValue', expectedMinResults: 1, description: 'cross-namespace search' },
  ];

  for (const test of searchTests) {
    try {
      const response = await client.callTool('search_hise', { query: test.query });
      const content = response.result?.content?.[0]?.text;
      const data = JSON.parse(content);

      if (data.resultCount >= test.expectedMinResults) {
        console.log(`  ✓ ${test.description}: found ${data.resultCount} results`);
        results.tests.push({ name: `search_${test.query}`, passed: true });
        results.summary.passed++;
      } else {
        console.log(`  ✗ ${test.description}: expected ${test.expectedMinResults}+ results, got ${data.resultCount}`);
        results.tests.push({ name: `search_${test.query}`, passed: false });
        results.summary.failed++;
      }
    } catch (error) {
      console.log(`  ✗ ${test.description}: ${error.message}`);
      results.tests.push({ name: `search_${test.query}`, passed: false, error: error.message });
      results.summary.failed++;
    }
    results.summary.total++;
  }

  // Test 3: query_scripting_api with parentheses handling
  console.log('\\nTesting query_scripting_api (parentheses handling)...');
  const apiTests = [
    { input: 'Synth.addNoteOn', description: 'without parentheses' },
    { input: 'Synth.addNoteOn()', description: 'with empty parentheses' },
    { input: 'Math.round', description: 'Math namespace' },
  ];

  for (const test of apiTests) {
    try {
      const response = await client.callTool('query_scripting_api', { apiCall: test.input });
      const content = response.result?.content?.[0]?.text;

      if (content && !content.includes('No API method found')) {
        const data = JSON.parse(content);
        console.log(`  ✓ ${test.description}: found ${data.result?.methodName || 'method'}`);
        results.tests.push({ name: `api_${test.input}`, passed: true });
        results.summary.passed++;
      } else {
        console.log(`  ✗ ${test.description}: not found`);
        results.tests.push({ name: `api_${test.input}`, passed: false });
        results.summary.failed++;
      }
    } catch (error) {
      console.log(`  ✗ ${test.description}: ${error.message}`);
      results.tests.push({ name: `api_${test.input}`, passed: false, error: error.message });
      results.summary.failed++;
    }
    results.summary.total++;
  }

  // Test 4: Related items in responses
  console.log('\\nTesting related items in responses...');
  try {
    const response = await client.callTool('query_scripting_api', { apiCall: 'Synth.addNoteOn' });
    const content = response.result?.content?.[0]?.text;
    const data = JSON.parse(content);

    if (data.related && Array.isArray(data.related)) {
      console.log(`  ✓ Related items present: ${data.related.length} items`);
      results.tests.push({ name: 'related_items', passed: true });
      results.summary.passed++;
    } else {
      console.log('  ✗ Related items missing');
      results.tests.push({ name: 'related_items', passed: false });
      results.summary.failed++;
    }
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
    results.tests.push({ name: 'related_items', passed: false, error: error.message });
    results.summary.failed++;
  }
  results.summary.total++;

  // Test 5: Did you mean suggestions
  console.log('\\nTesting "did you mean" suggestions...');
  try {
    const response = await client.callTool('query_scripting_api', { apiCall: 'Synth.addNotOn' });
    const content = response.result?.content?.[0]?.text;

    if (content && content.includes('Did you mean')) {
      console.log('  ✓ Suggestions provided for typo');
      results.tests.push({ name: 'did_you_mean', passed: true });
      results.summary.passed++;
    } else {
      console.log('  ✗ No suggestions for typo');
      results.tests.push({ name: 'did_you_mean', passed: false });
      results.summary.failed++;
    }
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
    results.tests.push({ name: 'did_you_mean', passed: false, error: error.message });
    results.summary.failed++;
  }
  results.summary.total++;

  // Test 6: Snippet filtering
  console.log('\\nTesting snippet filtering...');
  try {
    const response = await client.callTool('list_snippets', { difficulty: 'beginner' });
    const content = response.result?.content?.[0]?.text;
    const data = JSON.parse(content);

    if (data.filters && data.count !== undefined) {
      console.log(`  ✓ Filtered snippets: ${data.count} beginner snippets`);
      results.tests.push({ name: 'snippet_filter', passed: true });
      results.summary.passed++;
    } else {
      console.log('  ✗ Filtering not working');
      results.tests.push({ name: 'snippet_filter', passed: false });
      results.summary.failed++;
    }
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
    results.tests.push({ name: 'snippet_filter', passed: false, error: error.message });
    results.summary.failed++;
  }
  results.summary.total++;

  client.stop();

  // Print summary
  console.log('\\n=== Test Summary ===');
  console.log(`Passed: ${results.summary.passed}/${results.summary.total}`);
  console.log(`Failed: ${results.summary.failed}/${results.summary.total}`);
  console.log(`Success Rate: ${((results.summary.passed / results.summary.total) * 100).toFixed(1)}%`);

  // Save results
  const resultsPath = join(rootDir, 'prompt-variants', 'results', `server-tests-${Date.now()}.json`);
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\\nResults saved to: ${resultsPath}`);

  return results;
}

// Print test case summary
function printTestCaseSummary() {
  console.log('\\n=== Test Case Summary ===\\n');

  console.log('Tool Selection Tests:');
  console.log(`  Total: ${toolSelectionTests.testCases.length}`);
  const categories = {};
  for (const tc of toolSelectionTests.testCases) {
    categories[tc.category] = (categories[tc.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(categories)) {
    console.log(`    ${cat}: ${count}`);
  }

  console.log('\\nEdge Case Tests:');
  console.log(`  Total: ${edgeCaseTests.testCases.length}`);
  const edgeCategories = {};
  for (const tc of edgeCaseTests.testCases) {
    edgeCategories[tc.category] = (edgeCategories[tc.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(edgeCategories)) {
    console.log(`    ${cat}: ${count}`);
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--summary')) {
    printTestCaseSummary();
    return;
  }

  if (args.includes('--help')) {
    console.log(`
HISE MCP Server - Prompt Variant Testing Framework

Usage:
  node scripts/test-prompt-variants.mjs [options]

Options:
  --summary    Print test case summary
  --help       Show this help message

This script tests the MCP server functionality including:
- Tool listing
- Search functionality (keyword, exact, cross-namespace)
- Query tools with input normalization
- Related items in responses
- "Did you mean" suggestions
- Snippet filtering

Test cases are defined in prompt-variants/test-cases/
Results are saved to prompt-variants/results/
    `);
    return;
  }

  await runServerTests();
}

main().catch(console.error);
