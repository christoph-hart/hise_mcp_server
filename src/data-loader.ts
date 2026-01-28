import { readFileSync } from 'fs';
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
  EnrichedResult
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

  constructor() {
  }

  async loadData(dataPath: string = join(process.cwd(), 'data', 'hise-data.json')): Promise<void> {
    try {
      const uiPropertiesData = readFileSync(join(__dirname, '..', 'data', 'ui_component_properties.json'), 'utf8');
      const uiProperties = JSON.parse(uiPropertiesData);
      
      const apiMethodsData = readFileSync(join(__dirname, '..', 'data', 'scripting_api.json'), 'utf8');
      const apiMethods = JSON.parse(apiMethodsData);
      
      const processorsData = readFileSync(join(__dirname, '..', 'data', 'processors.json'), 'utf8');
      const processors = JSON.parse(processorsData);
      
      const snippetData = readFileSync(join(__dirname, '..', 'data', 'snippet_dataset.json'), 'utf8');
      const snippets = JSON.parse(snippetData);
      
      this.data = {
        uiComponentProperties: this.transformUIProperties(uiProperties),
        scriptingAPI: this.transformScriptingAPI(apiMethods),
        moduleParameters: this.transformProcessors(processors),
        codeSnippets: this.transformSnippets(snippets)
      };
      
      this.buildIndexes();
    } catch (error) {
      throw new Error(`Failed to load HISE data: ${error}`);
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

    // Index snippets
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
  }

  private extractKeywords(...texts: string[]): string[] {
    const keywords = new Set<string>();
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'this', 'that', 'these', 'those', 'it', 'its']);

    for (const text of texts) {
      if (!text) continue;

      // Split camelCase and PascalCase
      const expanded = text.replace(/([a-z])([A-Z])/g, '$1 $2');

      // Extract words
      const words = expanded.toLowerCase().match(/[a-z0-9]+/g) || [];

      for (const word of words) {
        if (word.length > 2 && !stopWords.has(word)) {
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
  findSimilar(query: string, limit: number = 3, domain?: SearchDomain): string[] {
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

  // Unified search across all domains
  search(query: string, domain: SearchDomain = 'all', limit: number = 10): SearchResult[] {
    const normalized = this.normalizeQuery(query);
    const results: SearchResult[] = [];
    const seen = new Set<string>();

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

    // 2. Prefix matching (e.g., "Synth.*" or "*.setValue")
    const hasPrefixWildcard = normalized.includes('*');
    if (hasPrefixWildcard) {
      const pattern = normalized.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`, 'i');

      for (const item of this.allItems) {
        if (domain !== 'all' && item.domain !== domain) continue;
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
        }
      }
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

      const item = this.allItems.find(i => i.id === itemId);
      if (!item) continue;
      if (domain !== 'all' && item.domain !== domain) continue;

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
    }

    // 4. Fuzzy matching on remaining items
    for (const item of this.allItems) {
      if (domain !== 'all' && item.domain !== domain) continue;
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

  listSnippets(): SnippetSummary[] {
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

  getSnippet(id: string): CodeSnippet | null {
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
  getSnippetEnriched(id: string): EnrichedResult<CodeSnippet> | null {
    const result = this.getSnippet(id);
    if (!result) return null;

    return {
      result,
      related: this.getRelatedItems(result.id)
    };
  }

  // List snippets with optional filtering
  listSnippetsFiltered(options?: {
    category?: string;
    difficulty?: "beginner" | "intermediate" | "advanced";
    tags?: string[];
  }): SnippetSummary[] {
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

  getAllData(): HISEData | null {
    return this.data;
  }
}
