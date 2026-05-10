/**
 * HISE Forum Search - MCP tool implementation
 *
 * Ports the search/fetch/scoring/cleaning logic from forum-search.py
 * for stateless MCP use. No caching, no pipeline commands.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { log } from './log.js';

// ============================================================================
// Types
// ============================================================================

export interface ForumConfig {
  trusted_posters: Record<string, {
    name: string;
    reputation: number;
    postcount: number;
    role: 'author' | 'expert' | 'trusted';
  }>;
  excluded_categories: number[];
  category_weights: Record<string, number>;
  scoring: {
    trusted_poster_reply: number;
    high_reply_count_threshold: number;
    high_reply_count_weight: number;
    solved_weight: number;
    recency_weight: number;
    recency_months: number;
    upvote_weight: number;
  };
  defaults: {
    max_age_years: number;
    max_search_pages: number;
    max_posts_per_topic: number;
    max_post_words: number;
  };
}

export interface ForumSearchOptions {
  maxPages?: number;
  maxAgeYears?: number;
  maxResults?: number;
}

export interface ForumTopicSummary {
  tid: number;
  title: string;
  brief: string;
  postcount: number;
  category: string;
  age_months: number;
  is_solved: boolean;
  signal_score: number;
  has_trusted_poster: boolean;
  trusted_posters: string[];
}

export interface ForumSearchResult {
  query_terms: string[];
  total_raw_results: number;
  topics_after_filter: number;
  topics: ForumTopicSummary[];
}

export interface ForumFetchOptions {
  maxPostsPerTopic?: number;
  maxPostWords?: number;
}

export interface ForumCleanedPost {
  header: string;
  content: string;
  upvotes?: number;
}

export interface ForumTopicDetail {
  tid: number;
  title: string;
  posts: ForumCleanedPost[];
}

// ============================================================================
// Rate Limiter
// ============================================================================

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(maxPerSecond: number = 2, burst: number = 5) {
    this.maxTokens = burst;
    this.tokens = burst;
    this.refillRate = maxPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

const rateLimiter = new RateLimiter();

// ============================================================================
// Config
// ============================================================================

let config: ForumConfig | null = null;

export function getForumConfig(): ForumConfig {
  if (!config) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const configPath = join(__dirname, '..', 'data', 'forum-config.json');
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  }
  return config!;
}

// ============================================================================
// HTTP Helper
// ============================================================================

const FORUM_BASE = 'https://forum.hise.audio';
const API_BASE = `${FORUM_BASE}/api`;

async function forumApiGet(endpoint: string, params?: Record<string, string | number>): Promise<any> {
  await rateLimiter.acquire();

  let url = `${API_BASE}/${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      searchParams.set(k, String(v));
    }
    url += '?' + searchParams.toString();
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'HISE-MCP-Server/1.0',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (resp.status === 429 && attempt === 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      continue;
    }

    if (!resp.ok) {
      throw new Error(`Forum API ${resp.status}: ${resp.statusText}`);
    }

    return resp.json();
  }
}

// ============================================================================
// Content Cleaning
// ============================================================================

function stripHtml(text: string): string {
  text = text.replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(text).trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ');
}

export function cleanPostContent(html: string, maxWords: number = 500): string {
  let text = html;

  // 1. Remove HiseSnippet blocks in <pre><code> tags
  text = text.replace(
    /<pre><code>\s*HiseSnippet\s+[A-Za-z0-9+/=.\s]{50,}\s*<\/code><\/pre>/gs,
    '[HiseSnippet omitted]'
  );

  // 2. Remove bare HiseSnippet strings (100+ chars)
  text = text.replace(
    /HiseSnippet\s+[A-Za-z0-9+/=]{100,}/g,
    '[HiseSnippet omitted]'
  );

  // 3. Shorten blockquotes
  text = text.replace(
    /<blockquote>\s*(.*?)\s*<\/blockquote>/gs,
    (_m, inner) => {
      const plain = stripHtml(inner);
      const firstLine = plain.split('\n')[0]?.slice(0, 100);
      return firstLine ? `[Quoting: ${firstLine}...]` : '[Quote omitted]';
    }
  );

  // 4. Convert <pre><code> to fenced code
  text = text.replace(/<pre><code>(.*?)<\/code><\/pre>/gs, '```\n$1\n```');

  // 5. Convert inline <code>
  text = text.replace(/<code>(.*?)<\/code>/gs, '`$1`');

  // 6. Strip emoji <img> tags
  text = text.replace(/<img[^>]*class="[^"]*emoji[^"]*"[^>]*\/?>/g, '');

  // 7. Convert other <img> to [image: alt]
  text = text.replace(/<img[^>]*alt="([^"]*)"[^>]*\/?>/g, '[image: $1]');
  text = text.replace(/<img[^>]*\/?>/g, '[image]');

  // 8. Convert <a href> to text (url)
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs, '$2 ($1)');

  // 9. Convert HTML structure to markdown
  text = text.replace(/<br\s*\/?>/g, '\n');
  text = text.replace(/<p[^>]*>/g, '\n');
  text = text.replace(/<\/p>/g, '');
  text = text.replace(/<li[^>]*>/g, '- ');
  text = text.replace(/<\/li>/g, '\n');
  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gs, '\n## $1\n');
  text = text.replace(/<strong>(.*?)<\/strong>/gs, '**$1**');
  text = text.replace(/<em>(.*?)<\/em>/gs, '*$1*');

  // 10. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // 11. Decode HTML entities
  text = decodeHtmlEntities(text);

  // 12. Strip URLs (keep link text from markdown links, drop bare URLs)
  text = text.replace(/\[([^\]]*)\]\(https?:\/\/[^)]+\)/g, '$1');
  text = text.replace(/\(https?:\/\/[^)]+\)/g, '');
  text = text.replace(/https?:\/\/\S+/g, '');

  // 13. Strip @mentions
  text = text.replace(/@[\w-]+/g, '');

  // 14. Strip NodeBB quote autotext
  text = text.replace(/said in .+? \(\/post\/\d+\):\s*\n\[Quoting:[^\]]*\.\.\.\]\s*/gs, '');

  // 15. Collapse multiple newlines
  text = text.replace(/\n{3,}/g, '\n\n');

  // 16. Collapse multiple spaces
  text = text.replace(/ {2,}/g, ' ');
  text = text.trim();

  // 17. Truncate to maxWords
  const words = text.split(/\s+/);
  if (words.length > maxWords) {
    text = words.slice(0, maxWords).join(' ') + ' [... truncated]';
  }

  return text;
}

export function extractBrief(html: string, maxWords: number = 50): string {
  let text = html;
  text = text.replace(/<pre><code>\s*HiseSnippet\s+[A-Za-z0-9+/=.\s]{50,}\s*<\/code><\/pre>/gs, '');
  text = text.replace(/HiseSnippet\s+[A-Za-z0-9+/=]{100,}/g, '');
  text = text.replace(/<blockquote>.*?<\/blockquote>/gs, '');
  text = text.replace(/<pre><code>.*?<\/code><\/pre>/gs, '[code]');
  text = text.replace(/<img[^>]*class="[^"]*emoji[^"]*"[^>]*\/?>/g, '');
  text = text.replace(/<img[^>]*\/?>/g, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeHtmlEntities(text);
  text = text.replace(/\s+/g, ' ').trim();
  const words = text.split(/\s+/);
  if (words.length > maxWords) {
    text = words.slice(0, maxWords).join(' ') + '...';
  }
  return text;
}

// ============================================================================
// Scoring
// ============================================================================

interface TopicMeta {
  cid?: number;
  postcount?: number;
  isSolved?: boolean;
  timestamp?: number;
}

function scoreTopic(topicMeta: TopicMeta, cfg: ForumConfig, searchPosts?: any[]): number {
  const scoring = cfg.scoring;
  const trusted = cfg.trusted_posters;
  const catWeights = cfg.category_weights;
  let score = 0.0;

  const cid = String(topicMeta.cid ?? '');
  score += catWeights[cid] ?? 0.0;

  const postcount = topicMeta.postcount ?? 1;
  if (postcount >= scoring.high_reply_count_threshold) {
    score += scoring.high_reply_count_weight;
  }

  if (topicMeta.isSolved) {
    score += scoring.solved_weight;
  }

  const ts = topicMeta.timestamp ?? 0;
  if (ts) {
    const ageMonths = (Date.now() - ts) / (1000 * 60 * 60 * 24 * 30);
    if (ageMonths <= scoring.recency_months) {
      score += scoring.recency_weight;
    }
  }

  if (searchPosts) {
    for (const post of searchPosts) {
      const uid = String(post.uid ?? '');
      if (uid in trusted) {
        score += scoring.trusted_poster_reply;
        break;
      }
    }

    const maxUpvotes = Math.max(...searchPosts.map(p => p.upvotes ?? 0), 0);
    if (maxUpvotes > 0) {
      score += scoring.upvote_weight * Math.min(maxUpvotes / 5, 1.0);
    }
  }

  return Math.min(score, 1.0);
}

// ============================================================================
// Search
// ============================================================================

export async function searchForum(
  term: string,
  alsoTerms: string[] = [],
  options: ForumSearchOptions = {}
): Promise<ForumSearchResult> {
  const cfg = getForumConfig();
  const defaults = cfg.defaults;
  const terms = [term, ...alsoTerms];
  const maxPages = options.maxPages ?? defaults.max_search_pages;
  const maxAgeYears = options.maxAgeYears ?? defaults.max_age_years;
  const maxResults = options.maxResults ?? 15;
  const excludedCats = new Set(cfg.excluded_categories);
  const cutoffTs = (Date.now() - maxAgeYears * 365.25 * 24 * 3600 * 1000);

  const topics: Map<number, {
    tid: number;
    title: string;
    postcount: number;
    category: string;
    cid: number;
    timestamp: number;
    age_months: number;
    isSolved: boolean;
    brief: string;
    posts: any[];
  }> = new Map();
  let totalRaw = 0;

  for (const searchTerm of terms) {
    for (let page = 1; page <= maxPages; page++) {
      let data: any;
      try {
        data = await forumApiGet('search', {
          term: searchTerm,
          in: 'titlesposts',
          sortBy: 'relevance',
          page,
        });
      } catch (e) {
        log.warn(`[warn] Search failed for '${searchTerm}' page ${page}: ${e}`);
        break;
      }

      const posts = data?.posts ?? [];
      if (posts.length === 0) break;

      for (const post of posts) {
        totalRaw++;
        const topic = post.topic ?? {};
        const tid = topic.tid;
        if (!tid) continue;

        if (topics.has(tid)) {
          topics.get(tid)!.posts.push(post);
          continue;
        }

        const cat = post.category ?? {};
        const cid = cat.cid ?? 0;
        if (excludedCats.has(cid)) continue;

        const postcount = topic.postcount ?? 1;
        if (postcount <= 1) continue;

        const ts = topic.timestamp ?? 0;
        if (ts && ts < cutoffTs) continue;

        const brief = extractBrief(post.content ?? '', 50);

        topics.set(tid, {
          tid,
          title: stripHtml(topic.titleRaw ?? topic.title ?? ''),
          postcount,
          category: cat.name ?? 'Unknown',
          cid,
          timestamp: ts,
          age_months: ts ? Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24 * 30)) : 0,
          isSolved: !!topic.isSolved,
          brief,
          posts: [post],
        });
      }
    }
  }

  // Score and build results
  const trusted = cfg.trusted_posters;
  const results: ForumTopicSummary[] = [];

  for (const [, t] of topics) {
    const trustedNames: string[] = [];
    for (const post of t.posts) {
      const uid = String(post.uid ?? '');
      if (uid in trusted) {
        const name = trusted[uid].name || post.user?.username || '';
        if (!trustedNames.includes(name)) {
          trustedNames.push(name);
        }
      }
    }

    const score = scoreTopic(t, cfg, t.posts);

    results.push({
      tid: t.tid,
      title: t.title,
      brief: t.brief,
      postcount: t.postcount,
      category: t.category,
      age_months: t.age_months,
      is_solved: t.isSolved,
      signal_score: Math.round(score * 1000) / 1000,
      has_trusted_poster: trustedNames.length > 0,
      trusted_posters: trustedNames,
    });
  }

  results.sort((a, b) => b.signal_score - a.signal_score);

  return {
    query_terms: terms,
    total_raw_results: totalRaw,
    topics_after_filter: results.length,
    topics: results.slice(0, maxResults),
  };
}

// ============================================================================
// Fetch
// ============================================================================

async function fetchTopicPosts(
  tid: number,
  maxPosts: number,
  trusted: ForumConfig['trusted_posters']
): Promise<{ title: string; postcount: number; posts: any[] }> {
  const data = await forumApiGet(`topic/${tid}`);
  const title = stripHtml(data.titleRaw ?? data.title ?? `Topic ${tid}`);
  const postcount = data.postcount ?? 0;
  let allPosts: any[] = data.posts ?? [];

  const pageCount = data.pagination?.pageCount ?? 1;

  if (pageCount > 1) {
    const pagesToFetch = new Set<number>();

    if (postcount <= maxPosts) {
      for (let p = 2; p <= pageCount; p++) pagesToFetch.add(p);
    } else {
      pagesToFetch.add(2);
      if (pageCount > 2) pagesToFetch.add(pageCount);
      if (pageCount > 5) pagesToFetch.add(Math.floor(pageCount / 2));
    }

    for (const pageNum of [...pagesToFetch].sort((a, b) => a - b)) {
      try {
        const pageData = await forumApiGet(`topic/${tid}`, { page: pageNum });
        allPosts.push(...(pageData.posts ?? []));
      } catch (e) {
        log.warn(`[warn] Failed to fetch page ${pageNum} of topic ${tid}: ${e}`);
      }
    }
  }

  // Deduplicate by pid
  const seenPids = new Set<number>();
  const uniquePosts: any[] = [];
  for (const post of allPosts) {
    const pid = post.pid;
    if (pid && !seenPids.has(pid)) {
      seenPids.add(pid);
      uniquePosts.push(post);
    }
  }

  // Limit total posts, prioritize trusted + OP
  if (uniquePosts.length > maxPosts) {
    const trustedUids = new Set(Object.keys(trusted));
    const priorityPosts = uniquePosts.filter(
      p => trustedUids.has(String(p.uid ?? '')) || p.isMainPost
    );
    const otherPosts = uniquePosts
      .filter(p => !trustedUids.has(String(p.uid ?? '')) && !p.isMainPost)
      .sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0));
    const remainingSlots = Math.max(0, maxPosts - priorityPosts.length);
    return { title, postcount, posts: [...priorityPosts, ...otherPosts.slice(0, remainingSlots)] };
  }

  return { title, postcount, posts: uniquePosts };
}

export async function fetchForumTopics(
  tids: number[],
  options: ForumFetchOptions = {}
): Promise<ForumTopicDetail[]> {
  const cfg = getForumConfig();
  const defaults = cfg.defaults;
  const maxPosts = options.maxPostsPerTopic ?? defaults.max_posts_per_topic;
  const maxWords = options.maxPostWords ?? defaults.max_post_words;
  const trusted = cfg.trusted_posters;

  const results: ForumTopicDetail[] = [];

  for (const tid of tids) {
    const topicData = await fetchTopicPosts(tid, maxPosts, trusted);

    const cleanedPosts: {
      uid: string;
      username: string;
      is_trusted: boolean;
      is_op: boolean;
      upvotes: number;
      header: string;
      content: string;
    }[] = [];

    for (const post of topicData.posts) {
      const uid = String(post.uid ?? '');
      const username = post.user?.username ?? 'Unknown';
      const tsIso = (post.timestampISO ?? '').slice(0, 10);
      const upvotes = post.upvotes ?? 0;
      const isTrusted = uid in trusted;
      const isOp = !!post.isMainPost;
      const trustedRole = isTrusted ? (trusted[uid].role ?? '') : '';
      const isAuthority = trustedRole === 'author' || trustedRole === 'expert';

      // Signal filter: OP, author/expert replies, and upvoted posts
      if (!(isOp || isAuthority || upvotes > 0)) {
        continue;
      }

      const content = cleanPostContent(post.content ?? '', maxWords);
      if (!content.trim()) continue;

      const metaParts = [username];
      if (isTrusted) {
        const role = trusted[uid].role ?? 'trusted';
        metaParts[0] = `${username} [${role}]`;
      }
      if (tsIso) metaParts.push(tsIso);
      if (upvotes > 0) metaParts.push(`+${upvotes}`);
      if (isOp) metaParts.push('OP');

      cleanedPosts.push({
        uid,
        username,
        is_trusted: isTrusted,
        is_op: isOp,
        upvotes,
        header: metaParts.join(' | '),
        content,
      });
    }

    // Sort: OP first, then trusted, then by upvotes desc
    cleanedPosts.sort((a, b) => {
      if (a.is_op !== b.is_op) return a.is_op ? -1 : 1;
      if (a.is_trusted !== b.is_trusted) return a.is_trusted ? -1 : 1;
      return b.upvotes - a.upvotes;
    });

    // Slim down for token efficiency
    const slimPosts: ForumCleanedPost[] = cleanedPosts.map(p => {
      const sp: ForumCleanedPost = { header: p.header, content: p.content };
      if (p.upvotes > 0) sp.upvotes = p.upvotes;
      return sp;
    });

    results.push({
      tid,
      title: topicData.title,
      posts: slimPosts,
    });
  }

  return results;
}
