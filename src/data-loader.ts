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
  ServerStatusBase,
  LAFStyleGuideData,
  LAFListResult,
  LAFQueryResult,
  LAFCallbackProperty,
  ClassSurveyData,
  ClassSurveyEntry
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
  private methodNameIndex: Map<string, ScriptingAPIMethod[]> = new Map();
  private parameterIndex: Map<string, ModuleParameter> = new Map();
  private snippetIndex: Map<string, CodeSnippet> = new Map();

  // Keyword index: maps keywords to item IDs with their domain
  private keywordIndex: Map<string, Set<string>> = new Map();

  // All searchable items for fuzzy matching
  private allItems: Array<{ id: string; domain: SearchDomain; name: string; description: string; keywords: string[] }> = [];

  // Lazy-loading flag for snippets
  private snippetsLoaded = false;

  // Enriched class tracking (from filter-mcp pipeline)
  private enrichedClasses: Set<string> = new Set();
  // Class-level metadata for search indexing and class-level queries
  private classMetadata: Map<string, {
    description?: string;
    obtainedVia?: string;
    category?: string;
    constants?: Record<string, any>;
    commonMistakes?: Array<{ mistake: string; fix: string }>;
    llmRef?: string;
    methodNames?: string[];
  }> = new Map();

  // Cache timestamp for status reporting
  private cacheLoadedAt: string | null = null;

  // LAF data (loaded lazily)
  private lafData: LAFStyleGuideData | null = null;
  private lafLoaded = false;
  // Index: componentType -> { category, functions[] }
  private lafComponentIndex: Map<string, { category: 'ScriptComponents' | 'FloatingTileContentTypes' | 'Global'; functions: string[] }> = new Map();
  // Index: functionName -> { componentType, category, description, properties }
  private lafFunctionIndex: Map<string, LAFQueryResult> = new Map();

  // Class survey data (loaded lazily)
  private surveyData: ClassSurveyData | null = null;
  private surveyLoaded = false;
  // Index: lowercase class name -> canonical class name
  private surveyClassNames: Map<string, string> = new Map();
  // Index: lowercase class name -> ClassSurveyEntry
  private surveyIndex: Map<string, ClassSurveyEntry> = new Map();

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

      if (cache.version !== '1.3' || 
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
        version: '1.3',
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

    // New enriched format: { version, classes: { ClassName: { methods: [...] } } }
    if (data?.version && data?.classes) {
      // Store enriched class list
      if (Array.isArray(data.enrichedClasses)) {
        this.enrichedClasses = new Set(data.enrichedClasses);
      }

      for (const [namespace, classData] of Object.entries(data.classes)) {
        const cls = classData as any;
        if (!cls?.methods || !Array.isArray(cls.methods)) continue;

        // Store class-level metadata for search indexing and class-level queries
        const methodNames = (cls.methods || [])
          .filter((m: any) => m?.name)
          .map((m: any) => m.name as string);
        this.classMetadata.set(namespace, {
          description: cls.description || undefined,
          obtainedVia: cls.obtainedVia || undefined,
          category: cls.category || undefined,
          constants: cls.constants || undefined,
          commonMistakes: cls.commonMistakes || undefined,
          llmRef: cls.llmRef || undefined,
          methodNames,
        });

        for (const method of cls.methods) {
          if (!method?.name) continue;

          const params: APIParameter[] = (method.parameters || []).map((p: any) => ({
            name: p.name || '',
            type: p.type || 'var',
            description: p.description || '',
            optional: false,
            defaultValue: undefined,
          }));

          // First example's code serves as the singular `example` field
          // (used by hise_verify_parameters)
          const firstExample = Array.isArray(method.examples) && method.examples.length > 0
            ? method.examples[0].code
            : undefined;

          methods.push({
            id: `${namespace}.${method.name}`,
            namespace,
            methodName: method.name,
            returnType: method.returnType || 'var',
            parameters: params,
            description: method.description || '',
            example: firstExample,
            // Enriched fields (present for enriched classes, absent for Tier 2)
            callScope: method.callScope || undefined,
            crossReferences: method.crossReferences || undefined,
            pitfalls: method.pitfalls || undefined,
            llmRef: method.llmRef || undefined,
            examples: method.examples || undefined,
          });
        }
      }
    }

    return methods;
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
    this.methodNameIndex.clear();
    this.parameterIndex.clear();
    this.snippetIndex.clear();
    this.keywordIndex.clear();
    this.allItems = [];

    // Rebuild classMetadata and enrichedClasses from scripting_api.json
    // (needed because cache path skips transformScriptingAPI)
    this.classMetadata.clear();
    this.enrichedClasses.clear();
    try {
      const apiData = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'scripting_api.json'), 'utf8'));
      if (apiData?.version && apiData?.classes) {
        if (Array.isArray(apiData.enrichedClasses)) {
          this.enrichedClasses = new Set(apiData.enrichedClasses);
        }
        for (const [ns, cls] of Object.entries(apiData.classes)) {
          const c = cls as any;
          const methodNames = (c.methods || [])
            .filter((m: any) => m?.name)
            .map((m: any) => m.name as string);
          this.classMetadata.set(ns, {
            description: c.description || undefined,
            obtainedVia: c.obtainedVia || undefined,
            category: c.category || undefined,
            constants: c.constants || undefined,
            commonMistakes: c.commonMistakes || undefined,
            llmRef: c.llmRef || undefined,
            methodNames,
          });
        }
      }
    } catch (error) {
      console.error('Failed to rebuild classMetadata in buildIndexes:', error);
    }

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

      // Build method-only index (for hise_verify_parameters)
      const existing = this.methodNameIndex.get(method.methodName) || [];
      existing.push(method);
      this.methodNameIndex.set(method.methodName, existing);

      // Include class-level description and obtainedVia in keyword extraction
      const classMeta = this.classMetadata.get(method.namespace);
      const keywords = this.extractKeywords(
        method.methodName, method.description, method.namespace,
        classMeta?.description || '', classMeta?.obtainedVia || ''
      );
      this.addToKeywordIndex(key, keywords);
      this.allItems.push({
        id: key,
        domain: 'api',
        name: `${method.namespace}.${method.methodName}`,
        description: method.description,
        keywords
      });
    }

    // Index API classes (for class-level search results)
    for (const [className, meta] of this.classMetadata) {
      const key = className.toLowerCase();

      const extraSources: string[] = [];
      if (meta.description) extraSources.push(meta.description);
      if (meta.obtainedVia) extraSources.push(meta.obtainedVia);
      if (meta.methodNames) extraSources.push(...meta.methodNames);
      if (meta.constants) {
        for (const [groupName, group] of Object.entries(meta.constants)) {
          extraSources.push(groupName);
          if (typeof group === 'object' && group !== null) {
            extraSources.push(...Object.keys(group));
          }
        }
      }

      const keywords = this.extractKeywords(className, ...extraSources);
      this.addToKeywordIndex(key, keywords);
      this.allItems.push({
        id: key,
        domain: 'api',
        name: className,
        description: meta.description || '',
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
      // Class-level exact match
      const classMatch = this.resolveClassName(normalized);
      if (classMatch) {
        const classMeta = this.classMetadata.get(classMatch);
        results.push({
          id: classMatch.toLowerCase(),
          domain: 'api',
          name: classMatch,
          description: classMeta?.description || '',
          score: 1.0,
          matchType: 'exact'
        });
        seen.add(classMatch.toLowerCase());
      }

      // Method-level exact match
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

    // Process class-level matches first (they rank higher)
    for (const [itemId, matchCount] of keywordMatches) {
      if (seen.has(itemId) || itemId.includes('.')) continue;

      const item = itemsToSearch.find(i => i.id === itemId);
      if (!item) continue;

      const score = Math.min(0.9, 0.3 + (matchCount / queryKeywords.length) * 0.5 + 0.1);
      results.push({
        id: item.id,
        domain: item.domain,
        name: item.name,
        description: item.description,
        score,
        matchType: 'keyword'
      });
      seen.add(itemId);
    }

    // Then process method/property-level matches
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

      const rawScore = this.calculateSimilarity(normalized, item.id, item.name.toLowerCase(), item.keywords);
      const isClassResult = !item.id.includes('.');
      const score = rawScore + (isClassResult ? 0.1 : 0);
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
        codeSnippets: data?.codeSnippets.length || 0,
        lafComponents: this.lafComponentIndex.size,
        lafFunctions: this.lafFunctionIndex.size
      }
    };
  }

  getAllData(): HISEData | null {
    return this.data;
  }

  getNamespaceListing(): Array<{ name: string; description?: string }> {
    if (!this.data) return [];

    const namespaces = [...new Set(this.data.scriptingAPI.map(m => m.namespace))].sort();

    return namespaces.map(ns => {
      const entry: { name: string; description?: string } = { name: ns };

      // Include description for enriched classes from API data
      if (this.enrichedClasses.has(ns)) {
        const meta = this.classMetadata.get(ns);
        if (meta?.description) {
          // Truncate to first sentence
          const firstDot = meta.description.indexOf('.');
          entry.description = firstDot > 0 ? meta.description.substring(0, firstDot + 1) : meta.description;
        }
      } else {
        // Fallback: use survey brief for unenriched classes
        const surveyBrief = this.getSurveyBrief(ns);
        if (surveyBrief) {
          entry.description = surveyBrief;
        }
      }

      return entry;
    });
  }

  isEnrichedClass(namespace: string): boolean {
    return this.enrichedClasses.has(namespace);
  }

  queryScriptingClass(name: string): {
    description?: string;
    obtainedVia?: string;
    category?: string;
    constants?: Record<string, any>;
    commonMistakes?: Array<{ mistake: string; fix: string }>;
    llmRef?: string;
    methodNames?: string[];
  } | null {
    // Try exact match first
    const meta = this.classMetadata.get(name);
    if (meta) return meta;

    // Try case-insensitive match
    for (const [key, value] of this.classMetadata) {
      if (key.toLowerCase() === name.toLowerCase()) return value;
    }

    return null;
  }

  // Resolve the canonical class name (case-insensitive lookup)
  resolveClassName(name: string): string | null {
    if (this.classMetadata.has(name)) return name;
    for (const key of this.classMetadata.keys()) {
      if (key.toLowerCase() === name.toLowerCase()) return key;
    }
    return null;
  }

  lookupMethodsByName(methodNames: string[]): Record<string, string[]> {
    const result: Record<string, string[]> = {};

    for (const name of methodNames) {
      const methods = this.methodNameIndex.get(name) || [];
      
      result[name] = methods.map(method => {
        const formattedParams = method.parameters.map(param => this.formatParam(param));
        return `${method.namespace}.${method.methodName}(${formattedParams.join(', ')})`;
      });
    }

    return result;
  }

  private formatParam(param: APIParameter): string {
    const type = param.type || 'var';
    const name = param.name || '';
    const nameLower = name.toLowerCase();

    // === Callbacks ===
    if (nameLower.includes('callback') || nameLower.includes('function')) {
      return 'function() {}';
    }

    // === Boolean ===
    if (type === 'bool') {
      return 'true';
    }

    // === Arrays (areas, rects, bounds) ===
    if (nameLower.includes('area') || nameLower.includes('rect') || nameLower.includes('bounds')) {
      return 'Rectangle(0, 0, 100, 100)';
    }

    // === Colours ===
    if (nameLower.includes('colour') || nameLower.includes('color')) {
      return '0xAARRGGBB';
    }

    // === Integers ===
    if (type === 'int') {
      if (nameLower.includes('channel')) return '1';
      if (nameLower.includes('note')) return '60';
      if (nameLower.includes('velocity')) return '100';
      if (nameLower.includes('interval') || nameLower.includes('millisecond')) return '100';
      if (nameLower.includes('timestamp') || nameLower.includes('sample')) return '0';
      if (nameLower.includes('offset')) return '0';
      if (nameLower === 'x' || nameLower === 'y') return '0';
      return '0';
    }

    // === Strings ===
    if (type === 'String') {
      if (nameLower.includes('wildcard')) return '"*.txt"';
      if (nameLower.includes('title')) return '"Title"';
      if (nameLower.includes('message')) return '"Message"';
      if (nameLower.includes('url') || nameLower.includes('suburl')) return '"/endpoint"';
      if (nameLower.includes('address')) return '"/address"';
      if (nameLower.includes('separator')) return '","';
      if (nameLower.includes('name') || nameLower.includes('id')) return '"id"';
      if (nameLower.includes('text')) return '"text"';
      return '"string"';
    }

    // === Var (generic) ===
    if (type === 'var') {
      if (nameLower === 'x' || nameLower === 'y') return '0';
      if (nameLower.includes('limit')) return '0.0';
      if (nameLower.includes('parameter') || nameLower.includes('default') || nameLower.includes('values')) return '{}';
      if (nameLower.includes('folder')) return 'FileSystem.Desktop';
      if (nameLower.includes('value')) return 'value';
      if (nameLower.includes('element')) return 'element';
    }

    // === Fallback: just use the parameter name ===
    return name || param.name;
  }

  // ============================================================================
  // LAF (LookAndFeel) Methods
  // ============================================================================

  /**
   * Ensure LAF data is loaded (lazy loading)
   */
  private async ensureLAFLoaded(): Promise<void> {
    if (this.lafLoaded) return;

    try {
      const lafPath = join(__dirname, '..', 'data', 'laf_style_guide.json');
      const lafDataRaw = readFileSync(lafPath, 'utf8');
      this.lafData = JSON.parse(lafDataRaw) as LAFStyleGuideData;
      
      this.buildLAFIndexes();
      this.lafLoaded = true;
      console.error('Loaded LAF style guide data');
    } catch (error) {
      console.error('Failed to load LAF data:', error);
      throw new Error(`Failed to load LAF data: ${error}`);
    }
  }

  /**
   * Build indexes for fast LAF lookups
   */
  private buildLAFIndexes(): void {
    if (!this.lafData) return;

    this.lafComponentIndex.clear();
    this.lafFunctionIndex.clear();

    // Index ScriptComponents
    const scriptComponents = this.lafData.categories.ScriptComponents.components;
    for (const [componentType, component] of Object.entries(scriptComponents)) {
      const functions = Object.keys(component.lafFunctions);
      this.lafComponentIndex.set(componentType, { category: 'ScriptComponents', functions });

      // Index each function
      for (const [funcName, funcData] of Object.entries(component.lafFunctions)) {
        this.lafFunctionIndex.set(funcName, {
          functionName: funcName,
          componentType,
          category: 'ScriptComponents',
          description: funcData.description,
          properties: funcData.callbackProperties
        });
      }
    }

    // Index FloatingTileContentTypes
    const floatingTypes = this.lafData.categories.FloatingTileContentTypes.contentTypes;
    for (const [contentType, component] of Object.entries(floatingTypes)) {
      const functions = Object.keys(component.lafFunctions);
      this.lafComponentIndex.set(contentType, { category: 'FloatingTileContentTypes', functions });

      // Index each function
      for (const [funcName, funcData] of Object.entries(component.lafFunctions)) {
        this.lafFunctionIndex.set(funcName, {
          functionName: funcName,
          componentType: contentType,
          category: 'FloatingTileContentTypes',
          description: funcData.description,
          properties: funcData.callbackProperties
        });
      }
    }

    // Index Global categories
    const globalCategories = this.lafData.categories.Global.categories;
    for (const [categoryName, component] of Object.entries(globalCategories)) {
      const functions = Object.keys(component.lafFunctions);
      this.lafComponentIndex.set(categoryName, { category: 'Global', functions });

      // Index each function
      for (const [funcName, funcData] of Object.entries(component.lafFunctions)) {
        this.lafFunctionIndex.set(funcName, {
          functionName: funcName,
          componentType: categoryName,
          category: 'Global',
          description: funcData.description,
          properties: funcData.callbackProperties
        });
      }
    }

    console.error(`Indexed ${this.lafComponentIndex.size} LAF components, ${this.lafFunctionIndex.size} LAF functions`);
  }

  /**
   * List LAF functions for a given component type
   * @param componentType - e.g., "ScriptButton", "PresetBrowser", "PopupMenu"
   */
  async listLAFFunctions(componentType: string): Promise<LAFListResult | null> {
    await this.ensureLAFLoaded();

    const entry = this.lafComponentIndex.get(componentType);
    if (!entry) {
      return null;
    }

    return {
      componentType,
      category: entry.category,
      functions: entry.functions,
      note: "Before writing LAF code, use get_resource with IDs 'laf-functions-style' and 'hisescript-style' for correct implementation patterns."
    };
  }

  /**
   * Query details for a specific LAF function
   * @param functionName - e.g., "drawToggleButton", "drawRotarySlider"
   */
  async queryLAFFunction(functionName: string): Promise<LAFQueryResult | null> {
    await this.ensureLAFLoaded();

    return this.lafFunctionIndex.get(functionName) || null;
  }

  /**
   * Get LAF functions for multiple component types (used by runtime tool)
   * Returns a flat, deduplicated list of function names
   * @param componentTypes - Array of component types or ContentTypes
   */
  async getLAFFunctionsForTypes(componentTypes: string[]): Promise<string[]> {
    await this.ensureLAFLoaded();

    const functions = new Set<string>();

    for (const componentType of componentTypes) {
      const entry = this.lafComponentIndex.get(componentType);
      if (entry) {
        for (const func of entry.functions) {
          functions.add(func);
        }
      }
    }

    return Array.from(functions);
  }

  // ============================================================================
  // Class Survey Methods (explore_hise)
  // ============================================================================

  /**
   * Ensure survey data is loaded (lazy loading)
   */
  private async ensureSurveyLoaded(): Promise<void> {
    if (this.surveyLoaded) return;

    try {
      const surveyPath = join(__dirname, '..', 'data', 'class_survey_data.json');
      const raw = readFileSync(surveyPath, 'utf8');
      this.surveyData = JSON.parse(raw) as ClassSurveyData;

      this.buildSurveyIndexes();
      this.surveyLoaded = true;
      console.error(`Loaded class survey data (${this.surveyIndex.size} classes)`);
    } catch (error) {
      console.error('Failed to load survey data:', error);
      throw new Error(`Failed to load class survey data: ${error}`);
    }
  }

  /**
   * Build indexes for fast survey lookups
   */
  private buildSurveyIndexes(): void {
    if (!this.surveyData) return;

    this.surveyClassNames.clear();
    this.surveyIndex.clear();

    for (const [className, entry] of Object.entries(this.surveyData.classes)) {
      const key = className.toLowerCase();
      this.surveyClassNames.set(key, className);
      this.surveyIndex.set(key, entry);
    }
  }

  /**
   * Get a survey brief for a class (used as fallback for namespace listing).
   * Returns null if survey not loaded or class not found.
   */
  getSurveyBrief(className: string): string | null {
    if (!this.surveyLoaded) return null;
    const entry = this.surveyIndex.get(className.toLowerCase());
    if (!entry) return null;
    // Truncate to first sentence
    const firstDot = entry.brief.indexOf('.');
    return firstDot > 0 ? entry.brief.substring(0, firstDot + 1) : entry.brief;
  }

  /**
   * Ensure survey is loaded (public, for use by getNamespaceListing fallback)
   */
  async loadSurveyData(): Promise<void> {
    await this.ensureSurveyLoaded();
  }

  /**
   * Resolve a class name to its canonical form in the survey
   */
  private resolveSurveyClassName(name: string): string | null {
    return this.surveyClassNames.get(name.toLowerCase()) || null;
  }

  /**
   * Free-text search across class briefs and seeAlso distinctions.
   * Returns plain text output with matched classes and their most relevant seeAlso.
   */
  async exploreSurveyByQuery(
    query: string,
    options?: { domain?: string; role?: string; limit?: number }
  ): Promise<string> {
    await this.ensureSurveyLoaded();
    if (!this.surveyData) return 'Survey data not available.';

    const limit = options?.limit ?? 8;
    const queryLower = query.toLowerCase();
    const queryKeywords = this.extractKeywords(query);

    // Score each class
    const scored: Array<{
      name: string;
      entry: ClassSurveyEntry;
      score: number;
      bestSeeAlso: { class: string; distinction: string } | null;
    }> = [];

    for (const [className, entry] of Object.entries(this.surveyData.classes)) {
      // Apply domain/role filters
      if (options?.domain && entry.domain !== options.domain) continue;
      if (options?.role && entry.role !== options.role) continue;

      let score = 0;

      // 1. Class name match (highest weight)
      const nameLower = className.toLowerCase();
      if (nameLower === queryLower) {
        score += 10;
      } else if (nameLower.includes(queryLower)) {
        score += 5;
      }

      // 2. Brief text match
      const briefLower = entry.brief.toLowerCase();
      if (briefLower.includes(queryLower)) {
        score += 4;
      } else {
        // Keyword overlap with brief
        const briefKeywords = this.extractKeywords(entry.brief);
        const overlap = queryKeywords.filter(k => briefKeywords.includes(k)).length;
        if (overlap > 0) {
          score += (overlap / Math.max(queryKeywords.length, 1)) * 3;
        }
      }

      // 3. seeAlso distinction match (high value for disambiguation)
      let bestSeeAlso: { class: string; distinction: string } | null = null;
      let bestSeeAlsoScore = 0;

      for (const sa of entry.seeAlso) {
        const distLower = sa.distinction.toLowerCase();
        let saScore = 0;

        if (distLower.includes(queryLower)) {
          saScore = 3;
        } else {
          const distKeywords = this.extractKeywords(sa.distinction);
          const overlap = queryKeywords.filter(k => distKeywords.includes(k)).length;
          if (overlap > 0) {
            saScore = (overlap / Math.max(queryKeywords.length, 1)) * 2;
          }
        }

        if (saScore > bestSeeAlsoScore) {
          bestSeeAlsoScore = saScore;
          bestSeeAlso = sa;
        }
      }

      score += bestSeeAlsoScore;

      // 4. Domain/role tag match
      if (queryKeywords.includes(entry.domain)) score += 1;
      if (queryKeywords.includes(entry.role)) score += 0.5;

      // 5. Creates/createdBy match
      for (const c of entry.creates) {
        if (c.toLowerCase().includes(queryLower)) { score += 1; break; }
      }
      for (const c of entry.createdBy) {
        if (c.toLowerCase().includes(queryLower)) { score += 0.5; break; }
      }

      if (score > 0) {
        scored.push({ name: className, entry, score, bestSeeAlso });
      }
    }

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, limit);

    if (topResults.length === 0) {
      return `No classes found for "${query}". Try broader keywords or use domain/role filters.`;
    }

    // Format as plain text
    const lines: string[] = [];
    lines.push(`Found ${topResults.length} class${topResults.length > 1 ? 'es' : ''} for "${query}":\n`);

    for (const { name, entry, bestSeeAlso } of topResults) {
      lines.push(`${name}  [${entry.domain}/${entry.role}]`);
      lines.push(`  ${entry.brief}`);

      if (entry.createdBy.length > 0) {
        lines.push(`  Obtain via: ${entry.createdBy.join(', ')}`);
      }

      if (bestSeeAlso) {
        lines.push(`  vs ${bestSeeAlso.class}: ${bestSeeAlso.distinction}`);
      }

      lines.push('');
    }

    lines.push('Use explore_hise({ className: "Name" }) for full details including creates/references and all seeAlso distinctions.');

    return lines.join('\n');
  }

  /**
   * Full entry for a specific class plus one-hop briefs for all referenced classes.
   * Returns plain text output.
   */
  async exploreSurveyByClass(className: string): Promise<string | null> {
    await this.ensureSurveyLoaded();
    if (!this.surveyData) return null;

    const canonical = this.resolveSurveyClassName(className);
    if (!canonical) return null;

    const entry = this.surveyIndex.get(canonical.toLowerCase())!;

    const lines: string[] = [];

    // Header
    lines.push(`${canonical}  [${entry.domain}/${entry.role}]`);
    lines.push(`  ${entry.brief}`);
    lines.push('');

    // Factory chains
    if (entry.createdBy.length > 0) {
      lines.push(`Obtain via: ${entry.createdBy.join(', ')}`);
    } else {
      lines.push('Obtain via: always available (root-level namespace)');
    }

    if (entry.creates.length > 0) {
      lines.push(`Creates: ${entry.creates.join(', ')}`);
    }

    if (entry.references.length > 0) {
      lines.push(`References: ${entry.references.join(', ')}`);
    }

    // Complexity indicators
    const complexity: string[] = [];
    if (entry.threadingExposure > 0.5) complexity.push('high threading exposure');
    if (entry.statefulness > 0.5) complexity.push('stateful');
    if (entry.callbackDensity > 0.5) complexity.push('callback-heavy');
    if (complexity.length > 0) {
      lines.push(`Note: ${complexity.join(', ')}`);
    }

    // seeAlso distinctions
    if (entry.seeAlso.length > 0) {
      lines.push('');
      lines.push('When to use this vs:');
      for (const sa of entry.seeAlso) {
        lines.push(`  ${sa.class}: ${sa.distinction}`);
      }
    }

    // One-hop briefs
    const oneHopClasses = new Set<string>();
    for (const c of entry.creates) oneHopClasses.add(c);
    for (const c of entry.createdBy) oneHopClasses.add(c);
    for (const c of entry.references) oneHopClasses.add(c);
    // Also include classes mentioned in seeAlso
    for (const sa of entry.seeAlso) oneHopClasses.add(sa.class);

    // Remove self
    oneHopClasses.delete(canonical);

    if (oneHopClasses.size > 0) {
      lines.push('');
      lines.push('--- Related class briefs ---');

      // Sort for stable output
      const sorted = [...oneHopClasses].sort();
      for (const relName of sorted) {
        const relEntry = this.surveyIndex.get(relName.toLowerCase());
        if (relEntry) {
          lines.push(`  ${relName}  [${relEntry.domain}/${relEntry.role}]: ${relEntry.brief}`);
        } else {
          lines.push(`  ${relName}: (no survey entry)`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Filter classes by domain and/or role tags.
   * Returns plain text listing.
   */
  async exploreSurveyByFilter(
    options: { domain?: string; role?: string; limit?: number }
  ): Promise<string> {
    await this.ensureSurveyLoaded();
    if (!this.surveyData) return 'Survey data not available.';

    const limit = options.limit ?? 20;
    const matches: Array<{ name: string; entry: ClassSurveyEntry }> = [];

    for (const [className, entry] of Object.entries(this.surveyData.classes)) {
      if (options.domain && entry.domain !== options.domain) continue;
      if (options.role && entry.role !== options.role) continue;
      matches.push({ name: className, entry });
    }

    if (matches.length === 0) {
      const filters: string[] = [];
      if (options.domain) filters.push(`domain="${options.domain}"`);
      if (options.role) filters.push(`role="${options.role}"`);
      return `No classes match filters: ${filters.join(', ')}.\nAvailable domains: audio, complex-data, data, event, file, network, playback, preset-model, routing, scripting, scriptnode, ui\nAvailable roles: component, container, event, factory, handle, processor, service, utility`;
    }

    // Sort alphabetically
    matches.sort((a, b) => a.name.localeCompare(b.name));
    const display = matches.slice(0, limit);

    const lines: string[] = [];
    const filters: string[] = [];
    if (options.domain) filters.push(`domain="${options.domain}"`);
    if (options.role) filters.push(`role="${options.role}"`);
    lines.push(`${matches.length} class${matches.length > 1 ? 'es' : ''} matching ${filters.join(', ')}${matches.length > limit ? ` (showing first ${limit})` : ''}:\n`);

    for (const { name, entry } of display) {
      lines.push(`${name}  [${entry.domain}/${entry.role}]`);
      lines.push(`  ${entry.brief}`);
      if (entry.createdBy.length > 0) {
        lines.push(`  Obtain via: ${entry.createdBy.join(', ')}`);
      }
      lines.push('');
    }

    lines.push('Use explore_hise({ className: "Name" }) for full details.');

    return lines.join('\n');
  }
}
