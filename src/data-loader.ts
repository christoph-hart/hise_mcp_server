import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  HISEData,
  UIComponentProperty,
  ScriptingAPIMethod,
  APIParameter,
  ModuleParameter,
  CodeSnippet,
  SearchDomain,
  SearchResult,
  EnrichedResult,
  ServerStatusBase
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SnippetSummary {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

export class HISEDataLoader {
  private data: HISEData | null = null;
  private propertyIndex: Map<string, UIComponentProperty> = new Map();
  private apiMethodIndex: Map<string, ScriptingAPIMethod> = new Map();
  private parameterIndex: Map<string, ModuleParameter> = new Map();
  private snippetIndex: Map<string, CodeSnippet> = new Map();

  // Keyword index: maps keywords to item IDs with their domain
  private keywordIndex: Map<string, Set<string>> = new Map();

  // All searchable items for fuzzy matching
  private allItems: Array<{ id: string; domain: SearchDomain; name: string; description: string; keywords: string[] }> = [];

  // Lazy-loading flag for snippets
  private snippetsLoaded = false;

  // Cache timestamp for status reporting
  private cacheLoadedAt: string | null = null;

  // Static stopwords set (optimization #3)
  private static readonly STOPWORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 
    'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for', 'on', 
    'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 
    'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 
    'or', 'because', 'until', 'while', 'this', 'that', 'these', 'those', 'it', 'its'
  ]);

  constructor() {
  }

  async loadData(dataPath: string = join(process.cwd(), 'data', 'hise-data.json')): Promise<void> {
    try {
      // Optimization #1: Try to load from cache first
      const cacheLoaded = await this.loadCache();
      if (cacheLoaded) {
        console.error('Loaded HISE data from cache');
        return;
      }

      console.error('Building HISE data indexes...');
      
      const uiPropertiesData = readFileSync(join(__dirname, '..', 'data', 'ui_component_properties.json'), 'utf8');
      const uiProperties = JSON.parse(uiPropertiesData);
      
      const apiMethodsData = readFileSync(join(__dirname, '..', 'data', 'scripting_api.json'), 'utf8');
      const apiMethods = JSON.parse(apiMethodsData);
      
      const processorsData = readFileSync(join(__dirname, '..', 'data', 'processors.json'), 'utf8');
      const processors = JSON.parse(processorsData);
      
      // Optimization #2: Don't load snippets yet (lazy load)
      this.data = {
        uiComponentProperties: this.transformUIProperties(uiProperties),
        scriptingAPI: this.transformScriptingAPI(apiMethods),
        moduleParameters: this.transformProcessors(processors),
        codeSnippets: [] // Will be loaded lazily
      };
      
      this.buildIndexes();
      
      // Save cache for next startup
      await this.saveCache();
      console.error('Built and cached HISE data indexes');
    } catch (error) {
      throw new Error(`Failed to load HISE data: ${error}`);
    }
  }

  // Optimization #1: Cache management
  private async loadCache(): Promise<boolean> {
    try {
      const cachePath = join(__dirname, '..', 'data', '.cache.json');
      if (!existsSync(cachePath)) {
        return false;
      }

      const cacheData = readFileSync(cachePath, 'utf8');
      const cache = JSON.parse(cacheData);

      // Check cache version (invalidate if data files changed)
      const dataDir = join(__dirname, '..', 'data');
      const uiMtime = this.getFileMtime(join(dataDir, 'ui_component_properties.json'));
      const apiMtime = this.getFileMtime(join(dataDir, 'scripting_api.json'));
      const procMtime = this.getFileMtime(join(dataDir, 'processors.json'));

      if (cache.version !== '1.1' || 
          cache.uiMtime !== uiMtime || 
          cache.apiMtime !== apiMtime || 
          cache.procMtime !== procMtime) {
        console.error('Cache invalidated due to data file changes');
        return false;
      }

      // Restore data and rebuild indexes (fast operation)
      this.data = cache.data;
      this.snippetsLoaded = false;
      this.cacheLoadedAt = cache.cachedAt || null;
      this.buildIndexes();

      return true;
    } catch (error) {
      console.error('Failed to load cache:', error);
      return false;
    }
  }

  private async saveCache(): Promise<void> {
    try {
      const dataDir = join(__dirname, '..', 'data');
      const cachePath = join(dataDir, '.cache.json');

      // Only cache the transformed data, not the indexes (they're quick to rebuild)
      const cachedAt = new Date().toISOString();
      const cache = {
        version: '1.1',
        cachedAt,
        uiMtime: this.getFileMtime(join(dataDir, 'ui_component_properties.json')),
        apiMtime: this.getFileMtime(join(dataDir, 'scripting_api.json')),
        procMtime: this.getFileMtime(join(dataDir, 'processors.json')),
        data: this.data
      };
      this.cacheLoadedAt = cachedAt;

      writeFileSync(cachePath, JSON.stringify(cache));
    } catch (error) {
      console.error('Failed to save cache:', error);
    }
  }

  private getFileMtime(path: string): number {
    try {
      const fs = require('fs');
      return fs.statSync(path).mtimeMs;
    } catch {
      return 0;
    }
  }

  // Optimization #2: Lazy load snippets
  private async ensureSnippetsLoaded(): Promise<void> {
    if (this.snippetsLoaded || !this.data) return;

    try {
      const snippetData = readFileSync(join(__dirname, '..', 'data', 'snippet_dataset.json'), 'utf8');
      const snippets = JSON.parse(snippetData);
      
      this.data.codeSnippets = this.transformSnippets(snippets);
      
      // Build snippet indexes
      for (const snippet of this.data.codeSnippets) {
        this.snippetIndex.set(snippet.id, snippet);

        const keywords = this.extractKeywords(
          snippet.title,
          snippet.description,
          snippet.category,
          ...snippet.tags
        );
        this.addToKeywordIndex(snippet.id, keywords);
        this.allItems.push({
          id: snippet.id,
          domain: 'snippets',
          name: snippet.title,
          description: snippet.description,
          keywords
        });
      }

      this.snippetsLoaded = true;
      console.error('Lazy-loaded snippets');
    } catch (error) {
      console.error('Failed to load snippets:', error);
    }
  }

  private transformUIProperties(data: Record<string, any>): UIComponentProperty[] {
    const properties: UIComponentProperty[] = [];

    for (const [componentType, props] of Object.entries(data)) {
      if (typeof props !== 'object' || props === null) continue;

      for (const [propertyName, propData] of Object.entries(props)) {
        const pd = propData as Record<string, any>;
        properties.push({
          id: `${componentType}.${propertyName}`,
          componentType,
          propertyName,
          propertyType: pd.type || 'unknown',
          defaultValue: pd.defaultValue ?? null,
          description: pd.description || '',
          possibleValues: pd.options || null
        });
      }
    }

    return properties;
  }

  private transformScriptingAPI(data: any): ScriptingAPIMethod[] {
    const methods: ScriptingAPIMethod[] = [];

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      for (const [namespace, nsData] of Object.entries(data)) {
        if (typeof nsData !== 'object' || nsData === null) continue;

        for (const [index, method] of Object.entries(nsData)) {
          if (typeof method !== 'object' || method === null) continue;
          methods.push({
            id: method.name,
            namespace: namespace,
            methodName: method.name,
            returnType: method.returnType || 'var',
            parameters: this.parseParameters(method.arguments),
            description: method.description || '',
            example: method.example || undefined
          });
        }
      }
    }

    return methods;
  }

  private parseParameters(args: string): any[] {
    if (!args || args === '()') {
      return [];
    }
    
    const match = args.match(/\((.*?)\)/);
    if (!match) {
      return [];
    }
    
    const params = match[1].split(',').map(p => p.trim());
    
    return params.map(param => ({
      name: param,
      type: 'unknown',
      description: '',
      optional: false,
      defaultValue: undefined
    }));
  }

  private transformProcessors(data: Record<string, any>): ModuleParameter[] {
    const parameters: ModuleParameter[] = [];

    for (const [processorType, procData] of Object.entries(data)) {
      if (!procData.parameters || typeof procData.parameters !== 'object') continue;

      for (const [paramId, paramData] of Object.entries(procData.parameters)) {
        const pd = paramData as Record<string, any>;
        parameters.push({
          id: `${processorType}.${paramId}`,
          moduleType: processorType,
          parameterId: paramId,
          parameterName: paramId,
          min: pd.min ?? 0,
          max: pd.max ?? 0,
          step: pd.step ?? 0,
          defaultValue: pd.defaultValue ?? 0,
          description: pd.description || ''
        });
      }
    }

    return parameters;
  }

  private transformSnippets(data: any[]): CodeSnippet[] {
    if (!Array.isArray(data)) {
      return [];
    }
    
    return data.map((snippet: any, index: number) => ({
      id: this.slugify(snippet.title),
      title: snippet.title || '',
      description: snippet.description || '',
      category: snippet.category || 'All',
      tags: snippet.tags || [],
      code: this.cleanCode(snippet.code || ''),
      relatedAPIs: snippet.relatedAPIs || [],
      relatedComponents: snippet.relatedComponents || [],
      difficulty: snippet.difficulty || 'intermediate'
    }));
  }

  private cleanCode(code: string): string {
    return code.replace(/\r\n/g, '\n');
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private buildIndexes(): void {
    if (!this.data) return;

    this.propertyIndex.clear();
    this.apiMethodIndex.clear();
    this.parameterIndex.clear();
    this.snippetIndex.clear();
    this.keywordIndex.clear();
    this.allItems = [];

    // Index UI properties
    for (const prop of this.data.uiComponentProperties) {
      const key = `${prop.componentType}.${prop.propertyName}`.toLowerCase();
      this.propertyIndex.set(key, prop);

      const keywords = this.extractKeywords(prop.propertyName, prop.description, prop.componentType);
      this.addToKeywordIndex(key, keywords);
      this.allItems.push({
        id: key,
        domain: 'ui',
        name: `${prop.componentType}.${prop.propertyName}`,
        description: prop.description,
        keywords
      });
    }

    // Index API methods
    for (const method of this.data.scriptingAPI) {
      const key = `${method.namespace}.${method.methodName}`.toLowerCase();
      this.apiMethodIndex.set(key, method);

      const keywords = this.extractKeywords(method.methodName, method.description, method.namespace);
      this.addToKeywordIndex(key, keywords);
      this.allItems.push({
        id: key,
        domain: 'api',
        name: `${method.namespace}.${method.methodName}`,
        description: method.description,
        keywords
      });
    }

    // Index module parameters
    for (const param of this.data.moduleParameters) {
      const key = `${param.moduleType}.${param.parameterId}`.toLowerCase();
      this.parameterIndex.set(key, param);

      const keywords = this.extractKeywords(param.parameterId, param.description, param.moduleType);
      this.addToKeywordIndex(key, keywords);
      this.allItems.push({
        id: key,
        domain: 'modules',
        name: `${param.moduleType}.${param.parameterId}`,
        description: param.description,
        keywords
      });
    }

    // Note: Snippets are now loaded lazily via ensureSnippetsLoaded()
  }

  // Optimization #3: Optimized keyword extraction
  private extractKeywords(...texts: string[]): string[] {
    const keywords = new Set<string>();

    for (const text of texts) {
      if (!text) continue;

      // Extract words in a single pass (no camelCase splitting for performance)
      const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];

      for (const word of words) {
        if (word.length > 2 && !HISEDataLoader.STOPWORDS.has(word)) {
          keywords.add(word);
        }
      }
    }

    return Array.from(keywords);
  }

  private addToKeywordIndex(itemId: string, keywords: string[]): void {
    for (const keyword of keywords) {
      if (!this.keywordIndex.has(keyword)) {
        this.keywordIndex.set(keyword, new Set());
      }
      this.keywordIndex.get(keyword)!.add(itemId);
    }
  }

  private normalizeQuery(query: string): string {
    return query
      .replace(/\(\)$/, '')      // Strip trailing ()
      .replace(/\(.*\)$/, '')    // Strip (args)
      .toLowerCase()
      .trim();
  }

  queryUIProperty(componentProperty: string): UIComponentProperty | null {
    const key = this.normalizeQuery(componentProperty);
    return this.propertyIndex.get(key) || null;
  }

  queryScriptingAPI(apiCall: string): ScriptingAPIMethod | null {
    const key = this.normalizeQuery(apiCall);
    return this.apiMethodIndex.get(key) || null;
  }

  queryModuleParameter(moduleParameter: string): ModuleParameter | null {
    const key = this.normalizeQuery(moduleParameter);
    return this.parameterIndex.get(key) || null;
  }

  // Find similar items when exact match fails (for "did you mean?" suggestions)
  async findSimilar(query: string, limit: number = 3, domain?: SearchDomain): Promise<string[]> {
    // Ensure snippets are loaded if searching in snippets domain
    if (domain === 'all' || domain === 'snippets') {
      await this.ensureSnippetsLoaded();
    }

    const normalized = this.normalizeQuery(query);
    const results: Array<{ id: string; score: number }> = [];

    for (const item of this.allItems) {
      if (domain && domain !== 'all' && item.domain !== domain) continue;

      const score = this.calculateSimilarity(normalized, item.id, item.name.toLowerCase(), item.keywords);
      if (score > 0.3) {
        results.push({ id: item.name, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.id);
  }

  private calculateSimilarity(query: string, id: string, name: string, keywords: string[]): number {
    let score = 0;

    // Exact match on id or name
    if (id === query || name === query) return 1.0;

    // Prefix match
    if (id.startsWith(query) || name.startsWith(query)) score = Math.max(score, 0.8);
    if (id.includes(query) || name.includes(query)) score = Math.max(score, 0.6);

    // Query parts match
    const queryParts = query.split('.');
    const idParts = id.split('.');
    for (const qp of queryParts) {
      for (const ip of idParts) {
        if (ip.includes(qp)) score = Math.max(score, 0.5);
      }
    }

    // Keyword match
    const queryWords = this.extractKeywords(query);
    for (const qw of queryWords) {
      if (keywords.includes(qw)) score = Math.max(score, 0.4);
    }

    return score;
  }

  // Unified search across all domains (optimizations #4 and #5)
  async search(query: string, domain: SearchDomain = 'all', limit: number = 10): Promise<SearchResult[]> {
    // Ensure snippets are loaded if searching in snippets domain
    if (domain === 'all' || domain === 'snippets') {
      await this.ensureSnippetsLoaded();
    }

    const normalized = this.normalizeQuery(query);
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    // Optimization #4: Filter items to search ONCE at the start
    const itemsToSearch = domain === 'all' 
      ? this.allItems 
      : this.allItems.filter(item => item.domain === domain);

    // 1. Check for exact matches first
    if (domain === 'all' || domain === 'api') {
      const exactApi = this.apiMethodIndex.get(normalized);
      if (exactApi) {
        results.push({
          id: `${exactApi.namespace}.${exactApi.methodName}`,
          domain: 'api',
          name: `${exactApi.namespace}.${exactApi.methodName}`,
          description: exactApi.description,
          score: 1.0,
          matchType: 'exact'
        });
        seen.add(normalized);
      }
    }

    if (domain === 'all' || domain === 'ui') {
      const exactUi = this.propertyIndex.get(normalized);
      if (exactUi) {
        results.push({
          id: `${exactUi.componentType}.${exactUi.propertyName}`,
          domain: 'ui',
          name: `${exactUi.componentType}.${exactUi.propertyName}`,
          description: exactUi.description,
          score: 1.0,
          matchType: 'exact'
        });
        seen.add(normalized);
      }
    }

    if (domain === 'all' || domain === 'modules') {
      const exactMod = this.parameterIndex.get(normalized);
      if (exactMod) {
        results.push({
          id: `${exactMod.moduleType}.${exactMod.parameterId}`,
          domain: 'modules',
          name: `${exactMod.moduleType}.${exactMod.parameterId}`,
          description: exactMod.description,
          score: 1.0,
          matchType: 'exact'
        });
        seen.add(normalized);
      }
    }

    if (domain === 'all' || domain === 'snippets') {
      const exactSnippet = this.snippetIndex.get(normalized);
      if (exactSnippet) {
        results.push({
          id: exactSnippet.id,
          domain: 'snippets',
          name: exactSnippet.title,
          description: exactSnippet.description,
          score: 1.0,
          matchType: 'exact'
        });
        seen.add(normalized);
      }
    }

    // Optimization #5: Early exit if we have enough exact matches
    if (results.length >= limit) {
      return results.slice(0, limit);
    }

    // 2. Prefix matching (e.g., "Synth.*" or "*.setValue")
    const hasPrefixWildcard = normalized.includes('*');
    if (hasPrefixWildcard) {
      const pattern = normalized.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`, 'i');

      for (const item of itemsToSearch) {
        if (seen.has(item.id)) continue;

        if (regex.test(item.id) || regex.test(item.name.toLowerCase())) {
          results.push({
            id: item.id,
            domain: item.domain,
            name: item.name,
            description: item.description,
            score: 0.9,
            matchType: 'prefix'
          });
          seen.add(item.id);

          // Optimization #5: Early exit
          if (results.length >= limit * 2) break;
        }
      }
    }

    // Optimization #5: Early exit after prefix matches
    if (results.length >= limit) {
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }

    // 3. Keyword matching
    const queryKeywords = this.extractKeywords(normalized);
    const keywordMatches = new Map<string, number>();

    for (const keyword of queryKeywords) {
      const matches = this.keywordIndex.get(keyword);
      if (matches) {
        for (const itemId of matches) {
          keywordMatches.set(itemId, (keywordMatches.get(itemId) || 0) + 1);
        }
      }
    }

    for (const [itemId, matchCount] of keywordMatches) {
      if (seen.has(itemId)) continue;

      const item = itemsToSearch.find(i => i.id === itemId);
      if (!item) continue;

      const score = Math.min(0.8, 0.3 + (matchCount / queryKeywords.length) * 0.5);
      results.push({
        id: item.id,
        domain: item.domain,
        name: item.name,
        description: item.description,
        score,
        matchType: 'keyword'
      });
      seen.add(itemId);

      // Optimization #5: Early exit
      if (results.length >= limit * 3) break;
    }

    // Optimization #5: Early exit after keyword matches
    if (results.length >= limit) {
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }

    // 4. Fuzzy matching on remaining items (most expensive, do last)
    for (const item of itemsToSearch) {
      if (seen.has(item.id)) continue;

      const score = this.calculateSimilarity(normalized, item.id, item.name.toLowerCase(), item.keywords);
      if (score >= 0.4) {
        results.push({
          id: item.id,
          domain: item.domain,
          name: item.name,
          description: item.description,
          score,
          matchType: 'fuzzy'
        });
        seen.add(item.id);

        // Optimization #5: Early exit
        if (results.length >= limit * 5) break;
      }
    }

    // Sort by score and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Get related items for a given item ID
  getRelatedItems(id: string, limit: number = 5): string[] {
    const normalized = this.normalizeQuery(id);
    const item = this.allItems.find(i => i.id === normalized);
    if (!item) return [];

    const related: Array<{ id: string; score: number }> = [];

    // Find items with overlapping keywords in the same domain
    for (const other of this.allItems) {
      if (other.id === normalized) continue;

      // Prefer same domain
      const domainBonus = other.domain === item.domain ? 0.2 : 0;

      // Count keyword overlap
      const overlap = item.keywords.filter(k => other.keywords.includes(k)).length;
      if (overlap > 0) {
        const score = (overlap / Math.max(item.keywords.length, 1)) + domainBonus;
        related.push({ id: other.name, score });
      }
    }

    // For snippets, also include relatedAPIs and relatedComponents
    if (item.domain === 'snippets') {
      const snippet = this.snippetIndex.get(normalized);
      if (snippet) {
        for (const api of snippet.relatedAPIs || []) {
          if (!related.find(r => r.id.toLowerCase() === api.toLowerCase())) {
            related.push({ id: api, score: 0.9 });
          }
        }
        for (const comp of snippet.relatedComponents || []) {
          if (!related.find(r => r.id.toLowerCase() === comp.toLowerCase())) {
            related.push({ id: comp, score: 0.85 });
          }
        }
      }
    }

    return related
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.id);
  }

  // Enriched query methods that return related items
  queryUIPropertyEnriched(componentProperty: string): EnrichedResult<UIComponentProperty> | null {
    const result = this.queryUIProperty(componentProperty);
    if (!result) return null;

    const key = this.normalizeQuery(componentProperty);
    return {
      result,
      related: this.getRelatedItems(key)
    };
  }

  queryScriptingAPIEnriched(apiCall: string): EnrichedResult<ScriptingAPIMethod> | null {
    const result = this.queryScriptingAPI(apiCall);
    if (!result) return null;

    const key = this.normalizeQuery(apiCall);
    return {
      result,
      related: this.getRelatedItems(key)
    };
  }

  queryModuleParameterEnriched(moduleParameter: string): EnrichedResult<ModuleParameter> | null {
    const result = this.queryModuleParameter(moduleParameter);
    if (!result) return null;

    const key = this.normalizeQuery(moduleParameter);
    return {
      result,
      related: this.getRelatedItems(key)
    };
  }

  async listSnippets(): Promise<SnippetSummary[]> {
    await this.ensureSnippetsLoaded();
    
    if (!this.data) {
      return [];
    }

    return this.data.codeSnippets.map((snippet: CodeSnippet) => ({
      id: snippet.id,
      title: snippet.title,
      description: snippet.description,
      category: snippet.category,
      tags: snippet.tags,
      difficulty: snippet.difficulty
    }));
  }

  async getSnippet(id: string): Promise<CodeSnippet | null> {
    await this.ensureSnippetsLoaded();
    
    if (!this.data) {
      return null;
    }

    // Try direct lookup first
    const direct = this.snippetIndex.get(id);
    if (direct) return direct;

    // Fallback to find for partial matches
    return this.data.codeSnippets.find((snippet: CodeSnippet) =>
      snippet.id === id || snippet.id.includes(id) || snippet.title.toLowerCase().includes(id.toLowerCase())
    ) || null;
  }

  // Enriched snippet that includes related items
  async getSnippetEnriched(id: string): Promise<EnrichedResult<CodeSnippet> | null> {
    const result = await this.getSnippet(id);
    if (!result) return null;

    return {
      result,
      related: this.getRelatedItems(result.id)
    };
  }

  // List snippets with optional filtering
  async listSnippetsFiltered(options?: {
    category?: string;
    difficulty?: "beginner" | "intermediate" | "advanced";
    tags?: string[];
  }): Promise<SnippetSummary[]> {
    await this.ensureSnippetsLoaded();
    
    if (!this.data) return [];

    let snippets = this.data.codeSnippets;

    if (options?.category) {
      snippets = snippets.filter(s => s.category.toLowerCase() === options.category!.toLowerCase());
    }

    if (options?.difficulty) {
      snippets = snippets.filter(s => s.difficulty === options.difficulty);
    }

    if (options?.tags && options.tags.length > 0) {
      const searchTags = options.tags.map(t => t.toLowerCase());
      snippets = snippets.filter(s =>
        s.tags.some(t => searchTags.includes(t.toLowerCase()))
      );
    }

    return snippets.map((snippet: CodeSnippet) => ({
      id: snippet.id,
      title: snippet.title,
      description: snippet.description,
      category: snippet.category,
      tags: snippet.tags,
      difficulty: snippet.difficulty
    }));
  }

  getServerStatus(name: string, version: string): ServerStatusBase {
    const data = this.data;
    
    // Calculate cache age in minutes
    let cacheAgeMinutes: number | null = null;
    if (this.cacheLoadedAt) {
      const cacheDate = new Date(this.cacheLoadedAt);
      const now = new Date();
      cacheAgeMinutes = Math.round((now.getTime() - cacheDate.getTime()) / (1000 * 60));
    }

    return {
      server: {
        name,
        version
      },
      runtime: {
        nodeVersion: process.version,
        platform: process.platform
      },
      data: {
        loaded: !!data,
        cachedAt: this.cacheLoadedAt,
        cacheAgeMinutes,
        snippetsLoaded: this.snippetsLoaded
      },
      statistics: {
        uiComponents: data ? new Set(data.uiComponentProperties.map(p => p.componentType)).size : 0,
        uiProperties: data?.uiComponentProperties.length || 0,
        scriptingNamespaces: data ? new Set(data.scriptingAPI.map(m => m.namespace)).size : 0,
        scriptingMethods: data?.scriptingAPI.length || 0,
        moduleTypes: data ? new Set(data.moduleParameters.map(p => p.moduleType)).size : 0,
        moduleParameters: data?.moduleParameters.length || 0,
        codeSnippets: data?.codeSnippets.length || 0
      }
    };
  }

  getAllData(): HISEData | null {
    return this.data;
  }
}
