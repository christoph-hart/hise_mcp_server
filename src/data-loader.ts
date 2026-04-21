import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
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

  // Enriched component-level data (from ui_components.json)
  private uiComponentEnriched: Map<string, { llmRef?: string; commonMistakes?: any[]; seeAlso?: any[] }> = new Map();

  // Enriched module-level data (from processors.json)
  private moduleEnriched: Map<string, { llmRef?: string; commonMistakes?: any[]; seeAlso?: any[]; cpuProfile?: any; customEquivalent?: any; tags?: string[] }> = new Map();

  // Scriptnode node data (from scriptnode.json)
  private scriptnodeIndex: Map<string, { factoryPath: string; factory: string; title: string; description: string; llmRef?: string; commonMistakes?: any[]; seeAlso?: any[]; tags?: string[]; polyphonic?: boolean; cpuProfile?: any; parameters?: any }> = new Map();

  // Cross-domain explore index (modules, scriptnode, UI enrichment for explore_hise)
  private exploreEnrichmentIndex: Map<string, {
    name: string;
    category: 'module' | 'scriptnode' | 'ui';
    domainTag: string;
    brief: string;
    whenToUse: string;
    commonMistakes: string[];
    tags: string[];
  }> = new Map();

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
      
      // Load UI components (enriched format with llmRef, or legacy format)
      const uiPath = existsSync(join(__dirname, '..', 'data', 'ui_components.json'))
        ? join(__dirname, '..', 'data', 'ui_components.json')
        : join(__dirname, '..', 'data', 'ui_component_properties.json');
      const uiPropertiesData = readFileSync(uiPath, 'utf8');
      const uiProperties = JSON.parse(uiPropertiesData);
      
      const apiMethodsData = readFileSync(join(__dirname, '..', 'data', 'scripting_api.json'), 'utf8');
      const apiMethods = JSON.parse(apiMethodsData);
      
      const processorsData = readFileSync(join(__dirname, '..', 'data', 'processors.json'), 'utf8');
      const processors = JSON.parse(processorsData);

      // Load scriptnode data (optional)
      let scriptnodeData: any = null;
      const snPath = join(__dirname, '..', 'data', 'scriptnode.json');
      if (existsSync(snPath)) {
        scriptnodeData = JSON.parse(readFileSync(snPath, 'utf8'));
      }
      
      // Optimization #2: Don't load snippets yet (lazy load)
      this.data = {
        uiComponentProperties: this.transformUIProperties(uiProperties),
        scriptingAPI: this.transformScriptingAPI(apiMethods),
        moduleParameters: this.transformProcessors(processors),
        codeSnippets: [] // Will be loaded lazily
      };

      // Store enriched data for component/module/scriptnode-level queries
      this.storeEnrichedUI(uiProperties);
      this.storeEnrichedModules(processors);
      if (scriptnodeData) {
        this.storeScriptnodeData(scriptnodeData);
      }
      this.buildExploreEnrichmentIndex();
      
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
      const uiFile = existsSync(join(dataDir, 'ui_components.json'))
        ? 'ui_components.json' : 'ui_component_properties.json';
      const uiMtime = this.getFileMtime(join(dataDir, uiFile));
      const apiMtime = this.getFileMtime(join(dataDir, 'scripting_api.json'));
      const procMtime = this.getFileMtime(join(dataDir, 'processors.json'));
      const snMtime = this.getFileMtime(join(dataDir, 'scriptnode.json'));

      if (cache.version !== '1.4' || 
          cache.uiMtime !== uiMtime || 
          cache.apiMtime !== apiMtime || 
          cache.procMtime !== procMtime ||
          cache.snMtime !== snMtime) {
        console.error('Cache invalidated due to data file changes');
        return false;
      }

      // Restore data and rebuild indexes (fast operation)
      this.data = cache.data;
      this.snippetsLoaded = false;
      this.cacheLoadedAt = cache.cachedAt || null;

      // Reload enriched data from source files (not stored in cache)
      this.reloadEnrichedData();

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
      const uiFile = existsSync(join(dataDir, 'ui_components.json'))
        ? 'ui_components.json' : 'ui_component_properties.json';
      const cache = {
        version: '1.4',
        cachedAt,
        uiMtime: this.getFileMtime(join(dataDir, uiFile)),
        apiMtime: this.getFileMtime(join(dataDir, 'scripting_api.json')),
        procMtime: this.getFileMtime(join(dataDir, 'processors.json')),
        snMtime: this.getFileMtime(join(dataDir, 'scriptnode.json')),
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
      return statSync(path).mtimeMs;
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

    for (const [componentType, compData] of Object.entries(data)) {
      if (typeof compData !== 'object' || compData === null) continue;

      // New enriched format: { id, type, llmRef, properties: { propName: {...} } }
      // Legacy format: { propName: { type, defaultValue, ... } }
      const props = compData.properties || compData;
      // Skip non-property top-level keys from enriched format
      if (compData.properties && typeof compData.properties === 'object') {
        for (const [propertyName, propData] of Object.entries(compData.properties)) {
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
      } else {
        // Legacy flat format
        for (const [propertyName, propData] of Object.entries(props)) {
          if (typeof propData !== 'object' || propData === null) continue;
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
        // Support both old format (string description) and new format (object with description/range/default)
        const desc = typeof pd === 'string' ? pd : (pd.description || pd.desc || '');
        parameters.push({
          id: `${processorType}.${paramId}`,
          moduleType: processorType,
          parameterId: paramId,
          parameterName: paramId,
          min: pd.min ?? 0,
          max: pd.max ?? 0,
          step: pd.step ?? 0,
          defaultValue: pd.defaultValue ?? pd.default ?? 0,
          description: desc
        });
      }
    }

    return parameters;
  }

  private storeEnrichedModules(data: Record<string, any>): void {
    this.moduleEnriched.clear();
    for (const [moduleId, modData] of Object.entries(data)) {
      if (modData.llmRef || modData.commonMistakes) {
        this.moduleEnriched.set(moduleId.toLowerCase(), {
          llmRef: modData.llmRef,
          commonMistakes: modData.commonMistakes,
          seeAlso: modData.seeAlso,
          cpuProfile: modData.cpuProfile,
          customEquivalent: modData.customEquivalent,
          tags: modData.tags,
        });
      }
    }
  }

  private storeEnrichedUI(data: Record<string, any>): void {
    this.uiComponentEnriched.clear();
    for (const [compId, compData] of Object.entries(data)) {
      if (compData.llmRef || compData.commonMistakes) {
        this.uiComponentEnriched.set(compId.toLowerCase(), {
          llmRef: compData.llmRef,
          commonMistakes: compData.commonMistakes,
          seeAlso: compData.seeAlso,
        });
      }
    }
  }

  private storeScriptnodeData(data: any): void {
    this.scriptnodeIndex.clear();
    const nodes = data?.nodes || {};
    for (const [factoryPath, nodeData] of Object.entries(nodes)) {
      const nd = nodeData as any;
      this.scriptnodeIndex.set(factoryPath.toLowerCase(), {
        factoryPath: nd.factoryPath || factoryPath,
        factory: nd.factory || '',
        title: nd.title || '',
        description: nd.description || '',
        llmRef: nd.llmRef,
        commonMistakes: nd.commonMistakes,
        seeAlso: nd.seeAlso,
        tags: nd.tags,
        polyphonic: nd.polyphonic,
        cpuProfile: nd.cpuProfile,
        parameters: nd.parameters,
      });
    }
  }

  /**
   * Reload enriched data from source JSON files.
   * Called both during fresh load and cache restore.
   */
  private reloadEnrichedData(): void {
    const dataDir = join(__dirname, '..', 'data');
    try {
      // UI enrichment
      const uiPath = existsSync(join(dataDir, 'ui_components.json'))
        ? join(dataDir, 'ui_components.json')
        : join(dataDir, 'ui_component_properties.json');
      const uiData = JSON.parse(readFileSync(uiPath, 'utf8'));
      this.storeEnrichedUI(uiData);

      // Module enrichment
      const procData = JSON.parse(readFileSync(join(dataDir, 'processors.json'), 'utf8'));
      this.storeEnrichedModules(procData);

      // Scriptnode
      const snPath = join(dataDir, 'scriptnode.json');
      if (existsSync(snPath)) {
        const snData = JSON.parse(readFileSync(snPath, 'utf8'));
        this.storeScriptnodeData(snData);
      }
      // Build cross-domain explore index
      this.buildExploreEnrichmentIndex();
    } catch (error) {
      console.error('Failed to reload enriched data:', error);
    }
  }

  /**
   * Extract a named section from an llmRef text block.
   * Sections start with "SectionName:" at the start of a line and end at the next section or EOF.
   */
  private extractLlmRefSection(llmRef: string, sectionName: string): string {
    const pattern = new RegExp(`^\\s*${sectionName}:\\s*\\n((?:[ \\t]+.+\\n?)*)`, 'm');
    const match = llmRef.match(pattern);
    if (!match) return '';
    return match[1].replace(/^[ \t]+/gm, '').trim();
  }

  /**
   * Extract the first line/paragraph from an llmRef as a brief.
   * Skips the header line (e.g., "LFO Modulator (Modulator/TimeVariantModulator)")
   * and returns the next non-empty paragraph.
   */
  private extractLlmRefBrief(llmRef: string): string {
    const lines = llmRef.split('\n');
    // Skip first line (title/header) and empty lines
    let started = false;
    const briefLines: string[] = [];
    for (const line of lines) {
      if (!started) {
        // Skip until we find a non-empty content line (after header)
        if (line.trim() === '' || line.includes('(') && !line.startsWith(' ')) continue;
        started = true;
      }
      if (started) {
        if (line.trim() === '' && briefLines.length > 0) break;
        if (line.match(/^\s*(Signal flow|CPU|Parameters|When to use|Common mistakes|Custom equivalent|See also|Modulation chains|Customisation):/)) break;
        briefLines.push(line.trim());
      }
    }
    return briefLines.join(' ').trim();
  }

  /**
   * Build the cross-domain explore enrichment index from modules, scriptnode, and UI data.
   */
  private buildExploreEnrichmentIndex(): void {
    this.exploreEnrichmentIndex.clear();

    // Modules
    for (const [key, mod] of this.moduleEnriched) {
      if (!mod.llmRef) continue;
      const whenToUse = this.extractLlmRefSection(mod.llmRef, 'When to use');
      const brief = this.extractLlmRefBrief(mod.llmRef);
      const mistakes = (mod.commonMistakes || [])
        .slice(0, 3)
        .map((m: any) => m.title || m.wrong || String(m));

      // Extract name and type from first line of llmRef, e.g., "LFO Modulator (Modulator/TimeVariantModulator)"
      const firstLine = mod.llmRef.split('\n')[0] || '';
      const typeMatch = firstLine.match(/\(([^)]+)\)/);
      const domainTag = typeMatch ? `module/${typeMatch[1]}` : 'module';
      // Use first word(s) before the parenthesized type as the display name
      const nameFromRef = firstLine.replace(/\s*\(.*\)\s*$/, '').trim();

      this.exploreEnrichmentIndex.set(key, {
        name: nameFromRef || key,
        category: 'module',
        domainTag,
        brief: brief || firstLine,
        whenToUse,
        commonMistakes: mistakes,
        tags: mod.tags || [],
      });
    }

    // Scriptnode nodes
    for (const [key, node] of this.scriptnodeIndex) {
      if (!node.llmRef) continue;
      const whenToUse = this.extractLlmRefSection(node.llmRef, 'When to use');
      const brief = this.extractLlmRefBrief(node.llmRef) || node.description;
      const mistakes = (node.commonMistakes || [])
        .slice(0, 3)
        .map((m: any) => m.title || m.wrong || String(m));

      this.exploreEnrichmentIndex.set(key, {
        name: node.factoryPath,
        category: 'scriptnode',
        domainTag: `scriptnode/${node.factory}`,
        brief,
        whenToUse,
        commonMistakes: mistakes,
        tags: node.tags || [],
      });
    }

    // UI components
    for (const [key, comp] of this.uiComponentEnriched) {
      if (!comp.llmRef) continue;
      const whenToUse = this.extractLlmRefSection(comp.llmRef, 'When to use');
      const brief = this.extractLlmRefBrief(comp.llmRef);
      const mistakes = (comp.commonMistakes || [])
        .slice(0, 3)
        .map((m: any) => m.title || m.wrong || String(m));

      // Extract name from first line of llmRef, e.g., "ScriptSlider (UI component)"
      const uiFirstLine = comp.llmRef.split('\n')[0] || '';
      const uiName = uiFirstLine.replace(/\s*\(.*\)\s*$/, '').trim();

      this.exploreEnrichmentIndex.set(key, {
        name: uiName || key,
        category: 'ui',
        domainTag: 'ui/component',
        brief,
        whenToUse,
        commonMistakes: mistakes,
        tags: [],
      });
    }

    console.error(`Built explore enrichment index (${this.exploreEnrichmentIndex.size} items)`);
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

    // Index scriptnode nodes
    for (const [key, node] of this.scriptnodeIndex) {
      const keywords = this.extractKeywords(
        node.factoryPath, node.title, node.description, node.factory,
        ...(node.tags || [])
      );
      this.addToKeywordIndex(key, keywords);
      this.allItems.push({
        id: key,
        domain: 'scriptnode',
        name: node.factoryPath,
        description: node.description,
        keywords
      });
    }

    // Index enriched modules at module level (for module-level search results)
    for (const [key, mod] of this.moduleEnriched) {
      // Only add if not already indexed via parameters
      const alreadyIndexed = this.allItems.some(i => i.id === key && i.domain === 'modules');
      if (!alreadyIndexed) {
        const keywords = this.extractKeywords(key, ...(mod.tags || []));
        this.addToKeywordIndex(key, keywords);
        this.allItems.push({
          id: key,
          domain: 'modules',
          name: key,
          description: mod.llmRef?.split('\n')[0] || '',
          keywords
        });
      }
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

    if (domain === 'all' || domain === 'scriptnode') {
      const exactNode = this.scriptnodeIndex.get(normalized);
      if (exactNode) {
        results.push({
          id: exactNode.factoryPath,
          domain: 'scriptnode',
          name: exactNode.factoryPath,
          description: exactNode.description,
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

  /**
   * Get enriched module-level data (llmRef, commonMistakes, etc.)
   * Query with just the module name, e.g., "LFO"
   */
  queryModuleEnriched(moduleName: string): { llmRef?: string; commonMistakes?: any[]; seeAlso?: any[]; cpuProfile?: any; customEquivalent?: any; tags?: string[] } | null {
    return this.moduleEnriched.get(moduleName.toLowerCase()) || null;
  }

  /**
   * Get enriched UI component-level data (llmRef, commonMistakes, etc.)
   * Query with just the component name, e.g., "ScriptSlider"
   */
  queryUIComponentEnriched(componentName: string): { llmRef?: string; commonMistakes?: any[]; seeAlso?: any[] } | null {
    return this.uiComponentEnriched.get(componentName.toLowerCase()) || null;
  }

  /**
   * Query a scriptnode node by factory path, e.g., "filters.svf"
   */
  queryScriptnodeNode(factoryPath: string): { factoryPath: string; factory: string; title: string; description: string; llmRef?: string; commonMistakes?: any[]; seeAlso?: any[]; tags?: string[]; polyphonic?: boolean; cpuProfile?: any; parameters?: any } | null {
    return this.scriptnodeIndex.get(factoryPath.toLowerCase()) || null;
  }

  /**
   * Get scriptnode statistics for server status
   */
  getScriptnodeStats(): { nodeCount: number; factories: string[] } {
    const factories = new Set<string>();
    for (const node of this.scriptnodeIndex.values()) {
      if (node.factory) factories.add(node.factory);
    }
    return {
      nodeCount: this.scriptnodeIndex.size,
      factories: [...factories].sort(),
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
        lafFunctions: this.lafFunctionIndex.size,
        scriptnodeNodes: this.scriptnodeIndex.size
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

    // Also score enrichment items (modules, scriptnode, UI)
    const enrichmentScored: Array<{
      name: string;
      item: { name: string; category: string; domainTag: string; brief: string; whenToUse: string; commonMistakes: string[]; tags: string[] };
      score: number;
    }> = [];

    for (const [key, item] of this.exploreEnrichmentIndex) {
      let score = 0;

      // Name match
      const nameLower = item.name.toLowerCase();
      if (nameLower === queryLower) {
        score += 10;
      } else if (nameLower.includes(queryLower) || key.includes(queryLower)) {
        score += 5;
      }

      // Brief/whenToUse text match
      const textLower = (item.brief + ' ' + item.whenToUse).toLowerCase();
      if (textLower.includes(queryLower)) {
        score += 4;
      } else {
        const textKeywords = this.extractKeywords(item.brief, item.whenToUse, ...item.tags);
        const overlap = queryKeywords.filter(k => textKeywords.includes(k)).length;
        if (overlap > 0) {
          score += (overlap / Math.max(queryKeywords.length, 1)) * 3;
        }
      }

      // Tag match
      for (const tag of item.tags) {
        if (queryKeywords.includes(tag.toLowerCase())) { score += 1; break; }
      }

      if (score > 0) {
        enrichmentScored.push({ name: item.name, item, score });
      }
    }

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    enrichmentScored.sort((a, b) => b.score - a.score);

    // Merge: interleave by score
    type MergedResult = {
      kind: 'survey' | 'enrichment';
      name: string;
      score: number;
      surveyEntry?: ClassSurveyEntry;
      bestSeeAlso?: { class: string; distinction: string } | null;
      enrichmentItem?: typeof enrichmentScored[0]['item'];
    };

    const merged: MergedResult[] = [];
    for (const s of scored) {
      merged.push({ kind: 'survey', name: s.name, score: s.score, surveyEntry: s.entry, bestSeeAlso: s.bestSeeAlso });
    }
    for (const e of enrichmentScored) {
      // Avoid duplicates (survey class with same name as enrichment module)
      if (!merged.some(m => m.name.toLowerCase() === e.name.toLowerCase())) {
        merged.push({ kind: 'enrichment', name: e.name, score: e.score, enrichmentItem: e.item });
      }
    }
    merged.sort((a, b) => b.score - a.score);
    const topResults = merged.slice(0, limit);

    if (topResults.length === 0) {
      return `No classes found for "${query}". Try broader keywords or use domain/role filters.`;
    }

    // Format as plain text
    const lines: string[] = [];
    lines.push(`Found ${topResults.length} result${topResults.length > 1 ? 's' : ''} for "${query}":\n`);

    for (const result of topResults) {
      if (result.kind === 'survey' && result.surveyEntry) {
        const entry = result.surveyEntry;
        lines.push(`${result.name}  [${entry.domain}/${entry.role}]`);
        lines.push(`  ${entry.brief}`);
        if (entry.createdBy.length > 0) {
          lines.push(`  Obtain via: ${entry.createdBy.join(', ')}`);
        }
        if (result.bestSeeAlso) {
          lines.push(`  vs ${result.bestSeeAlso.class}: ${result.bestSeeAlso.distinction}`);
        }
      } else if (result.kind === 'enrichment' && result.enrichmentItem) {
        const item = result.enrichmentItem;
        lines.push(`${item.name}  [${item.domainTag}]`);
        lines.push(`  ${item.brief}`);
        if (item.whenToUse) {
          lines.push(`  When to use: ${item.whenToUse}`);
        }
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

    // If not in survey, check enrichment index (modules, scriptnode, UI)
    if (!canonical) {
      let enriched = this.exploreEnrichmentIndex.get(className.toLowerCase());

      // Fuzzy fallback: try keyword matching against enrichment index
      if (!enriched) {
        const queryKeywords = this.extractKeywords(className);
        let bestScore = 0;
        let bestItem: { name: string; category: 'module' | 'scriptnode' | 'ui'; domainTag: string; brief: string; whenToUse: string; commonMistakes: string[]; tags: string[] } | undefined = undefined;

        for (const [key, item] of this.exploreEnrichmentIndex) {
          const nameLower = item.name.toLowerCase();
          const queryLower = className.toLowerCase();
          let score = 0;

          // Name contains query or query contains name
          if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
            score += 5;
          } else if (key.includes(queryLower) || queryLower.includes(key)) {
            score += 4;
          }

          // Keyword overlap with name and tags
          const itemKeywords = this.extractKeywords(item.name, ...item.tags);
          const overlap = queryKeywords.filter(k => itemKeywords.includes(k)).length;
          if (overlap > 0) {
            score += (overlap / Math.max(queryKeywords.length, 1)) * 3;
          }

          if (score > bestScore) {
            bestScore = score;
            bestItem = item;
          }
        }

        if (bestScore >= 2 && bestItem) {
          enriched = bestItem;
        }
      }

      if (!enriched) return null;

      const lines: string[] = [];
      lines.push(`${enriched.name}  [${enriched.domainTag}]`);
      lines.push(`  ${enriched.brief}`);
      lines.push('');

      if (enriched.whenToUse) {
        lines.push('When to use:');
        lines.push(`  ${enriched.whenToUse}`);
        lines.push('');
      }

      if (enriched.commonMistakes.length > 0) {
        lines.push('Common mistakes:');
        for (const m of enriched.commonMistakes) {
          lines.push(`  - ${m}`);
        }
        lines.push('');
      }

      if (enriched.tags.length > 0) {
        lines.push(`Tags: ${enriched.tags.join(', ')}`);
      }

      const queryTool = enriched.category === 'module' ? 'query_module_parameter'
        : enriched.category === 'ui' ? 'query_ui_property'
        : 'search_hise';
      lines.push(`\nUse ${queryTool}("${enriched.name}") for full reference.`);

      return lines.join('\n');
    }

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
