#!/usr/bin/env node
/**
 * Build example_chunks.json + example_graph.json from API examples,
 * snippet dataset, and forum code examples.
 *
 * Usage:
 *   node scripts/build-example-chunks.mjs
 *
 * Reads:
 *   - data/api_reference.json
 *   - data/snippet_dataset.json
 *   - data/forum_examples.json
 *   - data/class_survey_data.json
 *
 * Writes:
 *   - data/example_chunks.json
 *   - data/example_graph.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SCRIPT_DIR = import.meta.dirname;
const DATA_DIR = join(SCRIPT_DIR, '..', 'data');
const API_REF = join(DATA_DIR, 'api_reference.json');
const SNIPPET_DATA = join(DATA_DIR, 'snippet_dataset.json');
const FORUM_DATA = join(DATA_DIR, 'forum_examples.json');
const SURVEY_DATA = join(DATA_DIR, 'class_survey_data.json');
const CHUNKS_OUT = join(DATA_DIR, 'example_chunks.json');
const GRAPH_OUT = join(DATA_DIR, 'example_graph.json');

function buildDomainMap() {
  try {
    const survey = JSON.parse(readFileSync(SURVEY_DATA, 'utf-8'));
    const map = {};
    for (const [cls, entry] of Object.entries(survey.classes)) {
      map[cls] = entry.domain;
    }
    map['DisplayBufferSource'] = 'complex-data';
    map['SliderPackProcessor'] = 'audio';
    return map;
  } catch {
    console.warn('Warning: class_survey_data.json not found, skipping domain enrichment');
    return {};
  }
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function extractContext(code) {
  if (!code) return '';
  const lines = code.split('\n');
  const contextLines = [];
  let inContext = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inContext && trimmed.startsWith('// Context:')) {
      inContext = true;
      contextLines.push(trimmed.replace(/^\/\/\s*Context:\s*/, ''));
    } else if (inContext && trimmed.startsWith('//')) {
      contextLines.push(trimmed.replace(/^\/\/\s*/, ''));
    } else if (inContext) {
      break;
    }
  }

  return contextLines.join(' ').trim();
}

function firstSentence(text) {
  if (!text) return '';
  const clean = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  const match = clean.match(/^(.+?\.)\s/);
  return match ? match[1] : clean.slice(0, 150);
}

function categoryToDomain(category) {
  const map = {
    'UI': 'ui',
    'Scriptnode': 'scriptnode',
    'Modules': 'audio',
    'MIDI': 'audio',
    'Scripting': 'scripting',
    'All': 'general',
  };
  return map[category] || 'general';
}

function collectChunks() {
  const chunks = [];
  const graph = {};
  const domainMap = buildDomainMap();

  // Source A: API method examples
  console.log('Reading api_reference.json...');
  const api = JSON.parse(readFileSync(API_REF, 'utf-8'));
  let apiExampleCount = 0;

  for (const [clsName, cls] of Object.entries(api.classes)) {
    const methods = cls.methods || {};

    for (const [methodName, methodData] of Object.entries(methods)) {
      const examples = methodData.examples || [];
      if (examples.length === 0) continue;

      const methodId = `api:${clsName}.${methodName}`;
      const methodLlmRef = methodData.llmRef ? firstSentence(methodData.llmRef) : '';
      const siblingIds = [];

      for (const example of examples) {
        if (!example.slug || !example.code) continue;

        const exampleId = `example:${clsName}.${methodName}:${example.slug}`;
        siblingIds.push(exampleId);
        apiExampleCount++;

        const context = extractContext(example.code);
        const textParts = [];
        textParts.push(`${clsName}.${methodName}`);
        if (example.title) textParts.push(example.title);
        if (context) textParts.push(context);
        if (methodLlmRef) textParts.push(methodLlmRef);
        const text = textParts.join('\n\n');

        const bodyParts = [];
        bodyParts.push(`# ${example.title || example.slug}`);
        bodyParts.push(`**Class:** ${clsName} | **Method:** ${methodName}`);
        if (context) bodyParts.push(`> ${context}`);
        bodyParts.push('```javascript\n' + example.code + '\n```');
        const body = bodyParts.join('\n\n');

        const description = context || example.title || '';

        chunks.push({
          id: exampleId,
          text,
          body,
          metadata: {
            source: 'example',
            type: 'example',
            class: clsName,
            method: methodName,
            title: example.title || example.slug,
            slug: example.slug,
            description,
            domain: domainMap[clsName] || 'scripting',
            url: `/v2/scripting-api/${clsName.toLowerCase()}#${methodName.toLowerCase()}`
          }
        });

        graph[exampleId] = graph[exampleId] || [];
        graph[exampleId].push(methodId);
        graph[methodId] = graph[methodId] || [];
        graph[methodId].push(exampleId);
      }

      for (let i = 0; i < siblingIds.length; i++) {
        for (let j = i + 1; j < siblingIds.length; j++) {
          graph[siblingIds[i]] = graph[siblingIds[i]] || [];
          graph[siblingIds[i]].push(siblingIds[j]);
          graph[siblingIds[j]] = graph[siblingIds[j]] || [];
          graph[siblingIds[j]].push(siblingIds[i]);
        }
      }
    }
  }

  // Source B: Snippet dataset
  console.log('Reading snippet_dataset.json...');
  let snippetCount = 0;

  try {
    const snippets = JSON.parse(readFileSync(SNIPPET_DATA, 'utf-8'));

    for (const snippet of snippets) {
      if (!snippet.title || !snippet.code) continue;

      const snippetSlug = slugify(snippet.title);
      const snippetId = `snippet:${snippetSlug}`;
      snippetCount++;

      const textParts = [snippet.title];
      if (snippet.description) {
        textParts.push(snippet.description.trim().replace(/```[\s\S]*?```/g, '').trim());
      }
      if (snippet.tags && snippet.tags.length > 0) {
        const validTags = snippet.tags.filter(t => t && t.trim());
        if (validTags.length) textParts.push('Tags: ' + validTags.join(', '));
      }
      const text = textParts.join('\n\n');

      const bodyParts = [];
      bodyParts.push(`# ${snippet.title}`);
      bodyParts.push(`**Category:** ${snippet.category}`);
      if (snippet.tags && snippet.tags.length > 0) {
        const validTags = snippet.tags.filter(t => t && t.trim());
        if (validTags.length) bodyParts.push(`**Tags:** ${validTags.join(', ')}`);
      }
      if (snippet.description) bodyParts.push(snippet.description.trim());
      bodyParts.push('```javascript\n' + snippet.code + '\n```');
      const body = bodyParts.join('\n\n');

      const description = snippet.description
        ? firstSentence(snippet.description.trim().replace(/```[\s\S]*?```/g, '').trim())
        : '';

      chunks.push({
        id: snippetId,
        text,
        body,
        metadata: {
          source: 'snippet',
          type: 'snippet',
          title: snippet.title,
          category: snippet.category,
          tags: snippet.tags || [],
          description,
          domain: categoryToDomain(snippet.category),
          url: `/v2/examples/snippet/${snippetSlug}`
        }
      });

      graph[snippetId] = graph[snippetId] || [];
    }
  } catch (e) {
    console.warn('Warning: Could not read snippet_dataset.json:', e.message);
  }

  // Source C: Forum code examples
  console.log('Reading forum_examples.json...');
  let forumCount = 0;
  let forumDupes = 0;

  try {
    const allForumEntries = JSON.parse(readFileSync(FORUM_DATA, 'utf-8'));
    const seenSlugs = new Set();

    for (const entry of allForumEntries) {
      if (!entry.title || !entry.code) continue;

      const forumSlug = slugify(entry.title);
      if (seenSlugs.has(forumSlug)) {
        forumDupes++;
        continue;
      }
      seenSlugs.add(forumSlug);

      const forumId = `forum:${forumSlug}`;
      forumCount++;

      const textParts = [entry.title];
      if (entry.description) {
        textParts.push(entry.description.trim());
      }
      if (entry.tags && entry.tags.length > 0) {
        const validTags = entry.tags.filter(t => t && t.trim() && t !== 'forum');
        if (validTags.length) textParts.push('Tags: ' + validTags.join(', '));
      }
      const text = textParts.join('\n\n');

      const bodyParts = [];
      bodyParts.push(`# ${entry.title}`);
      bodyParts.push(`**Source:** [Forum Topic](${entry.url})`);
      if (entry.tags && entry.tags.length > 0) {
        const validTags = entry.tags.filter(t => t && t.trim() && t !== 'forum');
        if (validTags.length) bodyParts.push(`**Tags:** ${validTags.join(', ')}`);
      }
      if (entry.description) bodyParts.push(entry.description.trim());
      bodyParts.push('```javascript\n' + entry.code + '\n```');
      const body = bodyParts.join('\n\n');

      const description = entry.description
        ? firstSentence(entry.description.trim())
        : '';

      chunks.push({
        id: forumId,
        text,
        body,
        metadata: {
          source: 'forum',
          type: 'forum',
          title: entry.title,
          category: 'Forum',
          tags: entry.tags || [],
          description,
          featured: !!entry.featured,
          domain: 'scripting',
          url: entry.url
        }
      });

      graph[forumId] = graph[forumId] || [];
    }
    if (forumDupes) console.log(`  Deduplicated: removed ${forumDupes} duplicates`);
  } catch (e) {
    console.warn('Warning: Could not read forum batch files:', e.message);
  }

  // Deduplicate graph edges
  for (const key of Object.keys(graph)) {
    graph[key] = [...new Set(graph[key])];
  }

  return { chunks, graph, apiExampleCount, snippetCount, forumCount };
}

function main() {
  const { chunks, graph, apiExampleCount, snippetCount, forumCount } = collectChunks();

  console.log(`Collected ${chunks.length} chunks (${apiExampleCount} API examples + ${snippetCount} snippets + ${forumCount} forum)`);
  console.log(`Graph: ${Object.keys(graph).length} nodes, ${Object.values(graph).reduce((s, e) => s + e.length, 0)} edges`);

  console.log('Saving example_chunks.json...');
  writeFileSync(CHUNKS_OUT, JSON.stringify(chunks));

  console.log('Saving example_graph.json...');
  writeFileSync(GRAPH_OUT, JSON.stringify(graph));

  const chunksMB = (Buffer.byteLength(JSON.stringify(chunks)) / 1024 / 1024).toFixed(1);
  console.log(`Done! ${chunks.length} chunks (${chunksMB}MB), graph: ${Object.keys(graph).length} nodes`);
}

main();
