#!/usr/bin/env node
/**
 * Build video_chunks.json + video_graph.json from transcript markdown files.
 *
 * Usage:
 *   node scripts/build-video-chunks.mjs
 *
 * Reads:
 *   - content/transcripts/*.md
 *
 * Writes:
 *   - data/video_chunks.json
 *   - data/video_graph.json
 */
import { readFileSync, readdirSync, writeFileSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';

const SCRIPT_DIR = import.meta.dirname;
const ROOT_DIR = join(SCRIPT_DIR, '..');
const DATA_DIR = join(ROOT_DIR, 'data');
const TRANSCRIPTS_DIR = join(ROOT_DIR, 'content', 'transcripts');
const CHUNKS_OUT = join(DATA_DIR, 'video_chunks.json');
const GRAPH_OUT = join(DATA_DIR, 'video_graph.json');

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------
function parseFrontmatter(content) {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return { fm: {}, body: content };
  const yaml = m[1];
  const body = content.slice(m[0].length).trim();
  const fm = {};

  for (const field of ['title', 'summary', 'channel', 'videoId', 'url', 'publishDate', 'domain']) {
    const match = yaml.match(new RegExp(`^${field}:\\s*"?(.*?)"?\\s*$`, 'm'));
    if (match) fm[field] = match[1].replace(/^["']|["']$/g, '');
  }

  for (const field of ['views', 'likes', 'duration']) {
    const match = yaml.match(new RegExp(`^${field}:\\s*(\\d+)`, 'm'));
    if (match) fm[field] = parseInt(match[1]);
  }

  return { fm, body };
}

// ---------------------------------------------------------------------------
// Split markdown body into sections by ## headings
// ---------------------------------------------------------------------------
function splitSections(body) {
  const sections = [];
  const parts = body.split(/^## /m);

  for (let i = 1; i < parts.length; i++) {
    const lines = parts[i].split('\n');
    const headerLine = lines[0].trim();
    const sectionBody = lines.slice(1).join('\n').trim();

    // Parse timestamp from header: "Section Name [MM:SS]"
    const tsMatch = headerLine.match(/^(.*?)\s*\[(\d{2}):(\d{2})\]\s*$/);
    let label, startSec;
    if (tsMatch) {
      label = tsMatch[1].trim();
      startSec = parseInt(tsMatch[2]) * 60 + parseInt(tsMatch[3]);
    } else {
      label = headerLine;
      startSec = null;
    }

    if (sectionBody.length > 30) {
      sections.push({ label, startSec, body: sectionBody });
    }
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Strip code blocks from text for embedding (keep prose only)
// ---------------------------------------------------------------------------
function stripCodeBlocks(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Extract Namespace.method() references from section body for graph edges
// ---------------------------------------------------------------------------
// Methods too common to be useful as graph edges
const TRIVIAL_METHODS = new Set([
  'Console.print', 'Console.stop',
]);

function extractApiRefs(body) {
  const refs = new Set();
  // Match Namespace.method() patterns only — no class-level edges (too noisy)
  const matches = body.matchAll(/\b([A-Z][a-zA-Z]+)\.([a-z][a-zA-Z]+)\s*\(/g);
  for (const m of matches) {
    // Skip JS builtins
    if (['Math', 'Array', 'JSON', 'Object', 'String', 'Date'].includes(m[1])) continue;
    const ref = `${m[1]}.${m[2]}`;
    if (TRIVIAL_METHODS.has(ref)) continue;
    refs.add(`api:${ref}`);
  }
  return [...refs];
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const chunks = [];
  const graph = {};
  const videos = [];

  function walkMarkdown(dir) {
    const files = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        files.push(...walkMarkdown(full));
      } else if (entry.endsWith('.md') && entry !== 'index.md' && !entry.startsWith('_')) {
        files.push(full);
      }
    }
    return files;
  }

  const files = walkMarkdown(TRANSCRIPTS_DIR);
  console.log(`Found ${files.length} transcript files`);

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const { fm, body } = parseFrontmatter(content);

    if (!fm.videoId) {
      console.warn(`  Skipping ${file} — no videoId in frontmatter`);
      continue;
    }

    const sections = splitSections(body);
    const videoChunkIds = [];

    console.log(`  ${fm.videoId}: "${fm.title}" — ${sections.length} sections`);

    // Collect video-level metadata for index generation
    const relPath = relative(TRANSCRIPTS_DIR, file).replace(/\.md$/, '');
    videos.push({
      title: fm.title,
      summary: fm.summary || '',
      channel: fm.channel || 'David Healey',
      domain: fm.domain || 'guide',
      url: fm.url,
      relPath,
    });

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];

      // Skip Introduction sections (already a summary, not a recipe)
      if (sec.label.toLowerCase() === 'introduction') continue;

      const chunkId = `video:${fm.videoId}:${slugify(sec.label)}`;
      videoChunkIds.push(chunkId);

      // text field: header + prose-only body (no code blocks), truncated
      const proseBody = stripCodeBlocks(sec.body);
      const text = `${fm.title} — ${sec.label}. ${proseBody}`.slice(0, 500);

      // Website URL: /v2/videos/<domain>/<slug>#<section-slug>
      const sectionAnchor = slugify(sec.label);
      const url = `/v2/videos/${relPath}#${sectionAnchor}`;

      // YouTube deep link
      const youtubeUrl = sec.startSec !== null
        ? `https://youtube.com/watch?v=${fm.videoId}&t=${sec.startSec}`
        : `https://youtube.com/watch?v=${fm.videoId}`;

      chunks.push({
        id: chunkId,
        text,
        body: sec.body,
        metadata: {
          source: 'video',
          type: 'tutorial',
          title: fm.title,
          chapter: sec.label,
          channel: fm.channel || 'David Healey',
          videoId: fm.videoId,
          url,
          youtubeUrl,
          timestamp: sec.startSec,
          domain: fm.domain || 'guide',
          summary: fm.summary || '',
        }
      });

      // Graph: cross-source edges to API docs
      const apiRefs = extractApiRefs(sec.body);
      if (apiRefs.length > 0) {
        graph[chunkId] = graph[chunkId] || [];
        for (const ref of apiRefs) {
          graph[chunkId].push(ref);
          // Bidirectional edge
          graph[ref] = graph[ref] || [];
          graph[ref].push(chunkId);
        }
      }
    }

    // Graph: sequential edges between sections of the same video
    for (let i = 0; i < videoChunkIds.length - 1; i++) {
      graph[videoChunkIds[i]] = graph[videoChunkIds[i]] || [];
      graph[videoChunkIds[i]].push(videoChunkIds[i + 1]);
      graph[videoChunkIds[i + 1]] = graph[videoChunkIds[i + 1]] || [];
      graph[videoChunkIds[i + 1]].push(videoChunkIds[i]);
    }
  }

  // Deduplicate graph edges
  for (const key of Object.keys(graph)) {
    graph[key] = [...new Set(graph[key])];
  }

  console.log(`\nCollected ${chunks.length} chunks`);
  console.log(`Graph: ${Object.keys(graph).length} nodes, ${Object.values(graph).reduce((s, e) => s + e.length, 0)} edges`);

  writeFileSync(CHUNKS_OUT, JSON.stringify(chunks));
  writeFileSync(GRAPH_OUT, JSON.stringify(graph));

  const chunksMB = (Buffer.byteLength(JSON.stringify(chunks)) / 1024 / 1024).toFixed(1);
  console.log(`Done! ${chunks.length} chunks (${chunksMB}MB), graph: ${Object.keys(graph).length} nodes`);

  // Generate index.md
  generateIndex(videos);
}

function generateIndex(videos) {
  const introPath = join(TRANSCRIPTS_DIR, '_intro.md');
  const intro = existsSync(introPath) ? readFileSync(introPath, 'utf-8').trim() : '';

  // Group by domain
  const byDomain = {};
  for (const v of videos) {
    byDomain[v.domain] = byDomain[v.domain] || [];
    byDomain[v.domain].push(v);
  }

  // Sort domains, sort videos within each domain by title
  const domainOrder = ['guide', 'audio', 'scripting', 'ui', 'scriptnode', 'architecture', 'examples'];
  const sortedDomains = Object.keys(byDomain).sort((a, b) => {
    const ai = domainOrder.indexOf(a);
    const bi = domainOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const domainLabels = {
    guide: 'Getting Started',
    audio: 'Audio & Sampling',
    scripting: 'Scripting',
    ui: 'User Interface',
    scriptnode: 'ScriptNode',
    architecture: 'Architecture',
    examples: 'Examples',
  };

  const lines = [];
  lines.push('---');
  lines.push('title: Video Tutorials');
  lines.push('---');
  lines.push('');
  lines.push('# Video Tutorials');
  lines.push('');
  if (intro) {
    lines.push(intro);
    lines.push('');
  }

  for (const domain of sortedDomains) {
    const label = domainLabels[domain] || domain.charAt(0).toUpperCase() + domain.slice(1);
    lines.push(`## ${label}`);
    lines.push('');

    const sorted = byDomain[domain].sort((a, b) => a.title.localeCompare(b.title));
    for (const v of sorted) {
      const linkPath = `/v2/videos/${v.relPath}`;
      lines.push(`- [${v.title}](${linkPath}) — ${v.summary} ([YouTube](${v.url}))`);
    }
    lines.push('');
  }

  const indexPath = join(TRANSCRIPTS_DIR, 'index.md');
  writeFileSync(indexPath, lines.join('\n'));
  console.log(`Generated index.md (${videos.length} videos across ${sortedDomains.length} domains)`);
}

main();
