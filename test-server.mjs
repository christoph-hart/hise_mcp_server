#!/usr/bin/env node

import { spawn } from 'child_process';

const serverPath = 'dist/index.js';
const testDataPath = 'data/hise-data.json';

console.log('Starting HISE MCP server tests...\n');

const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, HISE_DATA_PATH: testDataPath }
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
  {
    name: 'List all tools',
    request: createListToolsRequest(),
    description: 'Should return all available MCP tools'
  },
  {
    name: 'Query UI property',
    request: createToolCallRequest('query_ui_property', {
      componentProperty: 'ScriptButton.filmstripImage'
    }),
    description: 'Should return ScriptButton filmstripImage property details'
  },
  {
    name: 'Query Scripting API',
    request: createToolCallRequest('query_scripting_api', {
      apiCall: 'Synth.addNoteOn'
    }),
    description: 'Should return Synth.addNoteOn method details'
  },
  {
    name: 'Query module parameter',
    request: createToolCallRequest('query_module_parameter', {
      moduleParameter: 'SimpleEnvelope.Attack'
    }),
    description: 'Should return SimpleEnvelope Attack parameter details'
  },
  {
    name: 'List snippets',
    request: createToolCallRequest('list_snippets', {}),
    description: 'Should return all snippet metadata'
  },
  {
    name: 'Get specific snippet',
    request: createToolCallRequest('get_snippet', {
      id: 'basicsynth'
    }),
    description: 'Should return full snippet with code'
  },
  {
    name: 'Query non-existent UI property',
    request: createToolCallRequest('query_ui_property', {
      componentProperty: 'NonExistentComponent.nonExistentProperty'
    }),
    description: 'Should return "No property found" message',
    expectNotFound: true
  },
  {
    name: 'Query non-existent Scripting API',
    request: createToolCallRequest('query_scripting_api', {
      apiCall: 'NonExistentNamespace.nonExistentMethod'
    }),
    description: 'Should return "No API method found" message',
    expectNotFound: true
  },
  {
    name: 'Query non-existent module parameter',
    request: createToolCallRequest('query_module_parameter', {
      moduleParameter: 'NonExistentModule.NonExistentParameter'
    }),
    description: 'Should return "No parameter found" message',
    expectNotFound: true
  },
  {
    name: 'Get non-existent snippet',
    request: createToolCallRequest('get_snippet', {
      id: 'non-existent-snippet-id'
    }),
    description: 'Should return "No snippet found" message',
    expectNotFound: true
  },
  {
    name: 'List UI components',
    request: createToolCallRequest('list_ui_components', {}),
    description: 'Should return list of all UI component types'
  },
  {
    name: 'List scripting namespaces',
    request: createToolCallRequest('list_scripting_namespaces', {}),
    description: 'Should return list of all Scripting API namespaces'
  },
  {
    name: 'List module types',
    request: createToolCallRequest('list_module_types', {}),
    description: 'Should return list of all module types'
  }
];

let testIndex = 0;

function handleResponse(response) {
  const test = tests[testIndex];

  if (test) {
    console.log(`\n✓ Test ${testIndex + 1}/${tests.length}: ${test.name}`);
    console.log(`  ${test.description}`);

    if (response.error) {
      console.log(`  ❌ Error: ${response.error.message}`);
    } else if (response.result && response.result.content) {
      const content = response.result.content[0];
      if (content.type === 'text') {
        try {
          const data = JSON.parse(content.text);
          console.log(`  ✅ Success - Got ${Array.isArray(data) ? data.length + ' items' : typeof data} response`);

          if (test.name === 'List snippets') {
            console.log(`     Found ${data.length} code snippets`);
          } else if (test.name === 'Get specific snippet') {
            console.log(`     Snippet: ${data.title}`);
            console.log(`     Code length: ${data.code?.length || 0} characters`);
          } else if (test.name === 'List UI components') {
            console.log(`     Found ${data.length} component types`);
          } else if (test.name === 'List scripting namespaces') {
            console.log(`     Found ${data.length} namespaces`);
          } else if (test.name === 'List module types') {
            console.log(`     Found ${data.length} module types`);
          } else if (test.expectNotFound) {
            console.log(`  ❌ Expected not found message but got data`);
          }
        } catch (e) {
          if (test.expectNotFound) {
            console.log(`  ✅ Success - Got expected not found message: "${content.text.substring(0, 60)}..."`);
          } else {
            console.log(`  ✅ Success - Got text response (${content.text.substring(0, 50)}...)`);
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
      console.log('\n✅ All tests completed!');
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
