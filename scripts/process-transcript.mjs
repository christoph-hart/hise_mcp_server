#!/usr/bin/env node
/**
 * Fetch and pre-process a YouTube video transcript for HISE tutorial content.
 *
 * Usage:
 *   node scripts/process-transcript.mjs <youtube-url>
 *
 * Requires: yt-dlp installed and on PATH.
 *
 * Outputs a JSON file to /tmp/transcript-<videoId>.json with metadata and
 * chapter-segmented raw text ready for LLM compression.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

// ---------------------------------------------------------------------------
// HISE domain dictionary — fixes common auto-caption misrecognitions
// ---------------------------------------------------------------------------
const corrections = [
  [/\bhigh\b(?!\s*(?:quality|level|pass|end|frequency|hat))/gi, 'HISE'],
  [/\bhighs\b/gi, 'HISE'],
  [/\bhigh so\b/gi, 'HISE'],
  [/\bhise\b/gi, 'HISE'],
  [/\bscript node\b/gi, 'ScriptNode'],
  [/\bscript processor\b/gi, 'ScriptProcessor'],
  [/\bmidi\b/gi, 'MIDI'],
  [/\bgui\b/gi, 'GUI'],
  [/\blaf\b/gi, 'LAF'],
  [/\bjuce\b/gi, 'JUCE'],
  [/\bvst\b/gi, 'VST'],
  [/\bdaw\b/gi, 'DAW'],
  [/\bdoor\b(?=\s+will|\s+just)/gi, 'DAW'],
  [/\bhdsr\b/gi, 'AHDSR'],
  [/\ba h d s r\b/gi, 'AHDSR'],
  [/\bcc\b(?=\s*\d|\s+one|\s+modulation)/gi, 'CC'],
];

// ---------------------------------------------------------------------------
// VTT parser — deduplicated plain text segments with timestamps
// ---------------------------------------------------------------------------
function parseVTT(vttText) {
  const lines = vttText.split('\n');
  const segments = [];
  let i = 0;

  while (i < lines.length) {
    const timeMatch = lines[i].match(
      /^(\d{2}):(\d{2}):(\d{2}\.\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}\.\d{3})/
    );
    if (timeMatch) {
      const startSec =
        parseInt(timeMatch[1]) * 3600 +
        parseInt(timeMatch[2]) * 60 +
        parseFloat(timeMatch[3]);
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        const clean = lines[i].replace(/<[^>]+>/g, '').trim();
        if (clean) textLines.push(clean);
        i++;
      }
      if (textLines.length > 0) {
        segments.push({ startSec, text: textLines[textLines.length - 1] });
      }
    }
    i++;
  }

  // Deduplicate consecutive identical text
  const deduped = [];
  for (const seg of segments) {
    if (deduped.length === 0 || deduped[deduped.length - 1].text !== seg.text) {
      deduped.push(seg);
    }
  }
  return deduped;
}

// ---------------------------------------------------------------------------
// Apply domain corrections
// ---------------------------------------------------------------------------
function fixTerminology(text) {
  let result = text;
  for (const [pattern, replacement] of corrections) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Group segments by chapters or sliding window
// ---------------------------------------------------------------------------
function groupByChapters(segments, chapters, duration) {
  const groups = [];
  for (let c = 0; c < chapters.length; c++) {
    const startSec = chapters[c].start_time ?? chapters[c].t ?? 0;
    const endSec =
      c + 1 < chapters.length
        ? (chapters[c + 1].start_time ?? chapters[c + 1].t)
        : duration;
    const label = chapters[c].title ?? chapters[c].label ?? `Section ${c + 1}`;
    const chSegments = segments.filter(
      (s) => s.startSec >= startSec && s.startSec < endSec
    );
    if (chSegments.length === 0) continue;
    const rawText = fixTerminology(chSegments.map((s) => s.text).join(' '));
    groups.push({ label, startSec, endSec, rawText });
  }
  return groups;
}

function groupBySlidingWindow(segments, duration) {
  const WINDOW = 180; // 3 minutes
  const OVERLAP = 30;
  const groups = [];
  for (let start = 0; start < duration; start += WINDOW - OVERLAP) {
    const end = Math.min(start + WINDOW, duration);
    const winSegments = segments.filter(
      (s) => s.startSec >= start && s.startSec < end
    );
    if (winSegments.length === 0) continue;
    const rawText = fixTerminology(winSegments.map((s) => s.text).join(' '));
    const label = `Section at ${formatTime(start)}`;
    groups.push({ label, startSec: start, endSec: end, rawText });
    if (end >= duration) break;
  }
  return groups;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
// Strip playlist/extra params — keep only ?v=VIDEO_ID
const rawUrl = process.argv[2];
if (!rawUrl) {
  console.error('Usage: node scripts/process-transcript.mjs <youtube-url>');
  process.exit(1);
}

const urlObj = new URL(rawUrl);
urlObj.searchParams.forEach((_, key) => {
  if (key !== 'v') urlObj.searchParams.delete(key);
});
const url = urlObj.toString();

const tmpDir = '/tmp/yt-transcript-work';
mkdirSync(tmpDir, { recursive: true });

try {
  // 1. Fetch metadata
  console.log('Fetching video metadata...');
  const metaJson = execSync(
    `yt-dlp --dump-json --skip-download "${url}"`,
    { maxBuffer: 50 * 1024 * 1024, encoding: 'utf-8' }
  );
  const ytMeta = JSON.parse(metaJson);

  const videoId = ytMeta.id;
  const title = ytMeta.title;
  const channel = ytMeta.channel || ytMeta.uploader;
  const duration = ytMeta.duration;
  const uploadDate = ytMeta.upload_date
    ? `${ytMeta.upload_date.slice(0, 4)}-${ytMeta.upload_date.slice(4, 6)}-${ytMeta.upload_date.slice(6, 8)}`
    : null;
  const viewCount = ytMeta.view_count ?? null;
  const likeCount = ytMeta.like_count ?? null;
  const description = ytMeta.description ?? '';
  const chapters = ytMeta.chapters ?? [];

  console.log(`  "${title}" by ${channel} (${formatTime(duration)})`);
  console.log(`  ${chapters.length} chapter markers found`);

  // 2. Fetch captions
  console.log('Fetching auto-captions...');
  execSync(
    `yt-dlp --write-auto-sub --sub-lang en --skip-download --sub-format vtt -o "${tmpDir}/%(id)s" "${url}"`,
    { maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }
  );

  const vttPath = join(tmpDir, `${videoId}.en.vtt`);
  const vttText = readFileSync(vttPath, 'utf-8');

  // 3. Parse VTT
  console.log('Parsing captions...');
  const segments = parseVTT(vttText);
  console.log(`  ${segments.length} unique text segments`);

  // 4. Group by chapters or sliding window
  const groups =
    chapters.length > 0
      ? groupByChapters(segments, chapters, duration)
      : groupBySlidingWindow(segments, duration);

  console.log(`  ${groups.length} chapter groups`);

  // 5. Output
  const output = {
    meta: {
      id: videoId,
      title,
      channel,
      duration,
      url: `https://youtube.com/watch?v=${videoId}`,
      uploadDate,
      viewCount,
      likeCount,
      description,
    },
    chapters: groups,
  };

  const outPath = `/tmp/transcript-${videoId}.json`;
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nOutput: ${outPath}`);

  // Stats
  const totalChars = groups.reduce((sum, g) => sum + g.rawText.length, 0);
  console.log(`Total raw text: ${totalChars} chars across ${groups.length} chapters`);
  for (const g of groups) {
    console.log(`  [${formatTime(g.startSec)}] ${g.label} — ${g.rawText.length} chars`);
  }
} finally {
  // Clean up temp VTT files
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}
