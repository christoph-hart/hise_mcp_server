#!/usr/bin/env node
/**
 * Build doc_chunks.json + graph.json from API reference and markdown content.
 *
 * Usage:
 *   node scripts/build-doc-chunks.mjs
 *
 * Reads:
 *   - data/api_reference.json
 *   - content/ (all .md files recursively)
 *   - data/class_survey_data.json
 *
 * Writes:
 *   - data/doc_chunks.json
 *   - data/graph.json
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const SCRIPT_DIR = import.meta.dirname;
const ROOT_DIR = join(SCRIPT_DIR, '..');
const DATA_DIR = join(ROOT_DIR, 'data');
const CONTENT_DIR = join(ROOT_DIR, 'content');
const API_REF = join(DATA_DIR, 'api_reference.json');
const SURVEY_DATA = join(DATA_DIR, 'class_survey_data.json');
const CHUNKS_OUT = join(DATA_DIR, 'doc_chunks.json');
const GRAPH_OUT = join(DATA_DIR, 'graph.json');

// Sections where we include the full markdown body, chunked by heading
const FULL_BODY_SECTIONS = ['guide', 'architecture', 'getting-started', 'reference', 'examples'];

// Domain lookup from class_survey_data.json
function buildDomainMap() {
  try {
    const survey = JSON.parse(readFileSync(SURVEY_DATA, 'utf-8'));
    const map = {};
    for (const [cls, entry] of Object.entries(survey.classes)) {
      map[cls] = entry.domain;
    }
    // Hardcode the 2 missing classes
    map['DisplayBufferSource'] = 'complex-data';
    map['SliderPackProcessor'] = 'audio';
    return map;
  } catch {
    console.warn('Warning: class_survey_data.json not found, skipping domain enrichment');
    return {};
  }
}

// Map content URL paths to domains
function getContentDomain(url) {
  if (url.includes('/reference/audio-modules/')) return 'audio';
  if (url.includes('/reference/scriptnodes/')) return 'scriptnode';
  if (url.includes('/reference/ui-components/')) return 'ui';
  if (url.includes('/reference/languages/')) return 'scripting';
  if (url.includes('/guide/')) return 'guide';
  if (url.includes('/architecture/')) return 'architecture';
  if (url.includes('/getting-started/')) return 'getting-started';
  if (url.includes('/examples/')) return 'examples';
  return 'other';
}

function extractFrontmatter(content) {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return { fm: null, body: content };
  const yaml = m[1];
  const body = content.slice(m[0].length).trim();
  const result = {};

  for (const field of ['title', 'description', 'contentType', 'componentType']) {
    const match = yaml.match(new RegExp(`^${field}:\\s*"?(.*?)"?\\s*$`, 'm'));
    if (match) result[field] = match[1].replace(/^["']|["']$/g, '');
  }

  const llmMatch = yaml.match(/^llmRef:\s*\|\s*\n([\s\S]*?)(?=\n\w|\n---)/m);
  if (llmMatch) {
    result.llmRef = llmMatch[1].replace(/^  /gm, '').trim();
  } else {
    const singleMatch = yaml.match(/^llmRef:\s*"?(.*?)"?\s*$/m);
    if (singleMatch) result.llmRef = singleMatch[1];
  }

  return { fm: result, body };
}

function extractSeeAlsoLinks(content) {
  const links = [];
  const seeAlsoBlocks = content.matchAll(/::see-also\s*\n---\s*\nlinks:\s*\n([\s\S]*?)\n---\s*\n::/g);
  for (const block of seeAlsoBlocks) {
    const toMatches = block[1].matchAll(/to:\s*"([^"]+)"/g);
    for (const m of toMatches) {
      if (!m[1].includes('<!--')) links.push(m[1]);
    }
  }
  return links;
}

function chunkByHeading(body) {
  const cleaned = body.replace(/::\w[\s\S]*?::/g, '').trim();
  if (!cleaned) return [];

  const sections = cleaned.split(/^## /m);
  const chunks = [];

  if (sections[0].trim().length > 100) {
    chunks.push({ heading: null, text: sections[0].trim() });
  }

  for (let i = 1; i < sections.length; i++) {
    const lines = sections[i].split('\n');
    const heading = lines[0].trim();
    const text = lines.slice(1).join('\n').trim();
    if (text.length > 50) {
      chunks.push({ heading, text });
    }
  }

  return chunks;
}

function normalizeDescription(desc) {
  if (!desc) return '';
  if (typeof desc === 'string') return desc;
  if (typeof desc === 'object' && desc.brief) return desc.brief;
  return '';
}

function firstSentence(text) {
  if (!text) return '';
  const clean = text.replace(/^#+\s+.*/m, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  const match = clean.match(/^(.+?\.)\s/);
  return match ? match[1] : clean.slice(0, 120);
}

function walkMarkdown(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkMarkdown(full));
    } else if (entry.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildMethodBody(methodName, methodData) {
  const parts = [];
  if (methodData.signature) parts.push(`### ${methodData.signature}`);
  if (methodData.llmRef) parts.push(methodData.llmRef);
  if (methodData.description && methodData.description !== methodData.llmRef) {
    parts.push(methodData.description);
  }
  if (methodData.parameters && Object.keys(methodData.parameters).length > 0) {
    parts.push('**Parameters:**');
    for (const [pName, pData] of Object.entries(methodData.parameters)) {
      const desc = typeof pData === 'string' ? pData : pData.description || '';
      parts.push(`- \`${pName}\`: ${desc}`);
    }
  }
  if (methodData.returnType) parts.push(`**Returns:** ${methodData.returnType}`);
  if (methodData.pitfalls) parts.push(`**Common pitfalls:** ${methodData.pitfalls}`);
  if (methodData.minimalExample) {
    parts.push('**Example:**\n```javascript\n' + methodData.minimalExample + '\n```');
  }
  if (methodData.userDocs) parts.push(methodData.userDocs);
  return parts.join('\n\n');
}

function collectChunks() {
  const chunks = [];
  const graph = {};
  const domainMap = buildDomainMap();

  // 1. API reference
  console.log('Reading api_reference.json...');
  const api = JSON.parse(readFileSync(API_REF, 'utf-8'));

  for (const [clsName, cls] of Object.entries(api.classes)) {
    const clsId = `api:${clsName}`;
    graph[clsId] = graph[clsId] || [];

    if (cls.llmRef) {
      chunks.push({
        id: clsId,
        text: cls.llmRef,
        body: cls.llmRef + (cls.description ? '\n\n' + cls.description : ''),
        metadata: {
          source: 'api',
          type: 'class',
          class: clsName,
          description: normalizeDescription(cls.description),
          domain: domainMap[clsName] || 'scripting',
          url: `/v2/scripting-api/${clsName.toLowerCase()}`
        }
      });
    }

    const methods = cls.methods || {};
    for (const [methodName, methodData] of Object.entries(methods)) {
      const methodId = `api:${clsName}.${methodName}`;

      const textParts = [];
      if (methodData.llmRef) textParts.push(methodData.llmRef);
      else if (methodData.description) textParts.push(methodData.description);
      if (methodData.pitfalls) textParts.push('Common pitfalls: ' + methodData.pitfalls);
      if (methodData.examples?.length) {
        const titles = methodData.examples.map(e => e.title).filter(Boolean);
        if (titles.length) textParts.push('Examples: ' + titles.join('; '));
      }

      const text = textParts.join('\n\n');
      if (!text) continue;

      const body = buildMethodBody(methodName, methodData);

      chunks.push({
        id: methodId,
        text,
        body,
        metadata: {
          source: 'api',
          type: 'method',
          class: clsName,
          method: methodName,
          description: normalizeDescription(methodData.description),
          domain: domainMap[clsName] || 'scripting',
          url: `/v2/scripting-api/${clsName.toLowerCase()}#${methodName.toLowerCase()}`
        }
      });

      graph[clsId] = graph[clsId] || [];
      graph[clsId].push(methodId);
      graph[methodId] = graph[methodId] || [];
      graph[methodId].push(clsId);

      if (methodData.crossReferences) {
        for (const ref of methodData.crossReferences) {
          const m = ref.match(/^\$API\.(\w+)\.(\w+)\$$/);
          if (m) {
            const targetId = `api:${m[1]}.${m[2]}`;
            graph[methodId] = graph[methodId] || [];
            graph[methodId].push(targetId);
          }
        }
      }
    }
  }

  // 2. Markdown files
  console.log('Reading markdown files...');
  const mdFiles = walkMarkdown(CONTENT_DIR);

  for (const file of mdFiles) {
    const content = readFileSync(file, 'utf-8');
    const { fm, body } = extractFrontmatter(content);
    if (!fm) continue;

    const relPath = ('v2/' + relative(CONTENT_DIR, file))
      .replace(/\.md$/, '').replace(/\/index$/, '');
    const url = '/' + relPath;
    const section = relPath.split('/')[1] || '';
    const seeAlsoLinks = extractSeeAlsoLinks(content);

    if (FULL_BODY_SECTIONS.includes(section)) {
      const bodyChunks = chunkByHeading(body);

      const fmText = [fm.llmRef, fm.description].filter(Boolean).join('\n\n');
      if (fmText) {
        const fmId = `content:${url}`;
        chunks.push({
          id: fmId,
          text: fmText,
          body: body,
          metadata: {
            source: 'content',
            type: fm.componentType || 'page',
            title: fm.title || '',
            description: fm.description || '',
            domain: getContentDomain(url),
            url
          }
        });

        if (seeAlsoLinks.length) {
          graph[fmId] = graph[fmId] || [];
          for (const link of seeAlsoLinks) {
            graph[fmId].push(`content:${link}`);
          }
        }

        for (const chunk of bodyChunks) {
          const anchor = chunk.heading ? '#' + slugify(chunk.heading) : '';
          const chunkId = `content:${url}${anchor}`;
          graph[fmId] = graph[fmId] || [];
          graph[fmId].push(chunkId);
          graph[chunkId] = graph[chunkId] || [];
          graph[chunkId].push(fmId);
        }
      }

      for (const chunk of bodyChunks) {
        const anchor = chunk.heading ? '#' + slugify(chunk.heading) : '';
        const chunkId = `content:${url}${anchor}`;
        const chunkText = chunk.heading ? `${chunk.heading}\n\n${chunk.text}` : chunk.text;
        chunks.push({
          id: chunkId,
          text: chunkText,
          body: chunkText,
          metadata: {
            source: 'content',
            type: 'section',
            title: chunk.heading || fm.title || '',
            pageTitle: fm.title || '',
            description: firstSentence(chunk.text),
            domain: getContentDomain(url),
            url: url + anchor
          }
        });
      }
    } else {
      const text = [fm.llmRef, fm.description].filter(Boolean).join('\n\n');
      if (!text) continue;

      const chunkId = `content:${url}`;
      chunks.push({
        id: chunkId,
        text,
        body: body || text,
        metadata: {
          source: 'content',
          type: fm.componentType || 'page',
          title: fm.title || '',
          description: fm.description || '',
          domain: getContentDomain(url),
          url
        }
      });

      if (seeAlsoLinks.length) {
        graph[chunkId] = graph[chunkId] || [];
        for (const link of seeAlsoLinks) {
          graph[chunkId].push(`content:${link}`);
        }
      }
    }
  }

  // Deduplicate graph edges
  for (const key of Object.keys(graph)) {
    graph[key] = [...new Set(graph[key])];
  }

  return { chunks, graph };
}

function main() {
  const { chunks, graph } = collectChunks();

  console.log(`Collected ${chunks.length} chunks`);
  console.log(`Graph: ${Object.keys(graph).length} nodes, ${Object.values(graph).reduce((s, e) => s + e.length, 0)} edges`);

  console.log('Saving doc_chunks.json...');
  writeFileSync(CHUNKS_OUT, JSON.stringify(chunks));

  console.log('Saving graph.json...');
  writeFileSync(GRAPH_OUT, JSON.stringify(graph));

  const chunksMB = (Buffer.byteLength(JSON.stringify(chunks)) / 1024 / 1024).toFixed(1);
  console.log(`Done! ${chunks.length} chunks (${chunksMB}MB), graph: ${Object.keys(graph).length} nodes`);
}

main();
