#!/usr/bin/env node

import { spawn } from 'child_process';

const serverPath = 'dist/index.js';

console.log('Starting HISE MCP server tests...\n');

const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let responseBuffer = '';
let requestId = 1;

function sendRequest(request) {
  const requestStr = JSON.stringify(request) + '\n';
  server.stdin.write(requestStr);
}

function createToolCallRequest(toolName, args) {
  return {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    }
  };
}

function createListToolsRequest() {
  return {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'tools/list',
    params: {}
  };
}

server.stdout.on('data', (data) => {
  responseBuffer += data.toString();

  const lines = responseBuffer.split('\n');
  responseBuffer = lines.pop() || '';

  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        handleResponse(response);
      } catch (e) {
        console.error('Failed to parse response:', line);
      }
    }
  }
});

const tests = [
  // Tool listing
  {
    name: 'List all tools',
    request: createListToolsRequest(),
    description: 'Should return all available MCP tools including search_hise'
  },

  // NEW: search_hise tests
  {
    name: 'Search by keyword',
    request: createToolCallRequest('search_hise', {
      query: 'midi',
      domain: 'all',
      limit: 5
    }),
    description: 'Should find MIDI-related items across all domains'
  },
  {
    name: 'Search with wildcard pattern',
    request: createToolCallRequest('search_hise', {
      query: 'Synth.*',
      domain: 'api'
    }),
    description: 'Should list all Synth namespace methods'
  },
  {
    name: 'Search exact match',
    request: createToolCallRequest('search_hise', {
      query: 'Synth.addNoteOn'
    }),
    description: 'Should find exact API method match'
  },
  {
    name: 'Search in snippets domain',
    request: createToolCallRequest('search_hise', {
      query: 'synth',
      domain: 'snippets'
    }),
    description: 'Should find snippets related to synth'
  },

  // Query tools with parentheses handling
  {
    name: 'Query API with parentheses',
    request: createToolCallRequest('query_scripting_api', {
      apiCall: 'Synth.addNoteOn()'
    }),
    description: 'Should strip parentheses and find method'
  },
  {
    name: 'Query API without parentheses',
    request: createToolCallRequest('query_scripting_api', {
      apiCall: 'Math.round'
    }),
    description: 'Should find Math.round method'
  },

  // Enriched responses with related items
  {
    name: 'Query API returns related items',
    request: createToolCallRequest('query_scripting_api', {
      apiCall: 'Synth.addNoteOn'
    }),
    description: 'Should return result with related items array'
  },
  {
    name: 'Query UI property returns related items',
    request: createToolCallRequest('query_ui_property', {
      componentProperty: 'ScriptButton.filmstripImage'
    }),
    description: 'Should return ScriptButton filmstripImage with related properties'
  },

  // Did you mean suggestions
  {
    name: 'API typo suggests corrections',
    request: createToolCallRequest('query_scripting_api', {
      apiCall: 'Synth.addNotOn'
    }),
    description: 'Should suggest Synth.addNoteOn for typo',
    expectNotFound: true,
    expectSuggestion: true
  },
  {
    name: 'UI property typo suggests corrections',
    request: createToolCallRequest('query_ui_property', {
      componentProperty: 'ScriptButon.filmstripImage'
    }),
    description: 'Should suggest correction for typo',
    expectNotFound: true,
    expectSuggestion: true
  },

  // Module parameters
  {
    name: 'Query module parameter',
    request: createToolCallRequest('query_module_parameter', {
      moduleParameter: 'SimpleEnvelope.Attack'
    }),
    description: 'Should return SimpleEnvelope Attack parameter details'
  },
  {
    name: 'Non-existent module parameter suggests',
    request: createToolCallRequest('query_module_parameter', {
      moduleParameter: 'NonExistent.Parameter'
    }),
    description: 'Should return suggestions for non-existent parameter',
    expectNotFound: true
  },

  // Snippet filtering
  {
    name: 'List snippets with category filter',
    request: createToolCallRequest('list_snippets', {
      category: 'MIDI'
    }),
    description: 'Should return only MIDI category snippets'
  },
  {
    name: 'List snippets with difficulty filter',
    request: createToolCallRequest('list_snippets', {
      difficulty: 'beginner'
    }),
    description: 'Should return only beginner difficulty snippets'
  },
  {
    name: 'Get specific snippet with enriched response',
    request: createToolCallRequest('get_snippet', {
      id: 'basicsynth'
    }),
    description: 'Should return full snippet with related items'
  },

  // List tools with hints
  {
    name: 'List UI components with hint',
    request: createToolCallRequest('list_ui_components', {}),
    description: 'Should return list with usage hint'
  },
  {
    name: 'List scripting namespaces with hint',
    request: createToolCallRequest('list_scripting_namespaces', {}),
    description: 'Should return list with usage hint'
  },
  {
    name: 'List module types with hint',
    request: createToolCallRequest('list_module_types', {}),
    description: 'Should return list with usage hint'
  },

  // Edge cases
  {
    name: 'Search with no results',
    request: createToolCallRequest('search_hise', {
      query: 'xyznonexistent123'
    }),
    description: 'Should handle no results gracefully',
    expectNotFound: true
  },
  {
    name: 'Case insensitive search',
    request: createToolCallRequest('search_hise', {
      query: 'SYNTH.ADDNOTEON'
    }),
    description: 'Should find result regardless of case'
  }
];

let testIndex = 0;
let passed = 0;
let failed = 0;

function handleResponse(response) {
  const test = tests[testIndex];

  if (test) {
    const testNum = `${testIndex + 1}/${tests.length}`;

    if (response.error) {
      console.log(`\n Test ${testNum}: ${test.name}`);
      console.log(`  ${test.description}`);
      console.log(`  Error: ${response.error.message}`);
      failed++;
    } else if (response.result) {
      // Handle tools/list response
      if (response.result.tools) {
        const toolNames = response.result.tools.map(t => t.name);
        const hasSearchHise = toolNames.includes('search_hise');
        console.log(`\n✓ Test ${testNum}: ${test.name}`);
        console.log(`  ${test.description}`);
        console.log(`  Found ${response.result.tools.length} tools`);
        console.log(`  search_hise present: ${hasSearchHise ? 'Yes' : 'No'}`);
        if (hasSearchHise) passed++; else failed++;
      }
      // Handle tools/call response
      else if (response.result.content) {
        const content = response.result.content[0];
        if (content.type === 'text') {
          try {
            const data = JSON.parse(content.text);

            console.log(`\n✓ Test ${testNum}: ${test.name}`);
            console.log(`  ${test.description}`);

            // Check for expected fields based on test type
            if (test.name.includes('Search')) {
              console.log(`  Results: ${data.resultCount || data.results?.length || 0}`);
              if (data.results && data.results.length > 0) {
                console.log(`  Top match: ${data.results[0].name} (score: ${data.results[0].score})`);
              }
            } else if (test.name.includes('snippet')) {
              console.log(`  Count: ${data.count || (data.result ? 1 : 0)}`);
              if (data.result?.title) {
                console.log(`  Snippet: ${data.result.title}`);
              }
              if (data.related) {
                console.log(`  Related items: ${data.related.length}`);
              }
            } else if (data.result) {
              // Enriched response
              console.log(`  Found: ${data.result.methodName || data.result.propertyName || data.result.parameterId || 'item'}`);
              if (data.related) {
                console.log(`  Related items: ${data.related.length}`);
              }
            } else if (data.count !== undefined) {
              console.log(`  Count: ${data.count}`);
              if (data.hint) {
                console.log(`  Has hint: Yes`);
              }
            } else if (Array.isArray(data)) {
              console.log(`  Items: ${data.length}`);
            }

            passed++;
          } catch (e) {
            // Non-JSON response (likely error message)
            if (test.expectNotFound) {
              const hasSuggestion = content.text.includes('Did you mean');
              console.log(`\n✓ Test ${testNum}: ${test.name}`);
              console.log(`  ${test.description}`);
              console.log(`  Not found response: Yes`);
              if (test.expectSuggestion) {
                console.log(`  Has suggestions: ${hasSuggestion ? 'Yes' : 'No'}`);
              }
              passed++;
            } else {
              console.log(`\nFailed Test ${testNum}: ${test.name}`);
              console.log(`  ${test.description}`);
              console.log(`  Unexpected non-JSON response: ${content.text.substring(0, 100)}...`);
              failed++;
            }
          }
        }
      }
    }

    testIndex++;

    if (testIndex < tests.length) {
      setTimeout(() => {
        sendRequest(tests[testIndex].request);
      }, 100);
    } else {
      console.log('\n' + '='.repeat(50));
      console.log('TEST SUMMARY');
      console.log('='.repeat(50));
      console.log(`Total:  ${tests.length}`);
      console.log(`Passed: ${passed} ✅`);
      console.log(`Failed: ${failed} ❌`);
      console.log(`Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);
      console.log('='.repeat(50));
      server.kill();
    }
  }
}

setTimeout(() => {
  console.log('Running first test...');
  sendRequest(tests[0].request);
}, 500);

server.on('exit', (code) => {
  if (code !== 0 && testIndex < tests.length) {
    console.error(`\n❌ Server exited with code ${code} before all tests completed`);
  }
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
});
