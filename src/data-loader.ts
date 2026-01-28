import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  HISEData,
  UIComponentProperty,
  ScriptingAPIMethod,
  APIParameter,
  ModuleParameter,
  CodeSnippet
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

    for (const prop of this.data.uiComponentProperties) {
      const key = `${prop.componentType}.${prop.propertyName}`.toLowerCase();
      this.propertyIndex.set(key, prop);
    }

    for (const method of this.data.scriptingAPI) {
      const key = `${method.namespace}.${method.methodName}`.toLowerCase();
      this.apiMethodIndex.set(key, method);
    }

    for (const param of this.data.moduleParameters) {
      const key = `${param.moduleType}.${param.parameterId}`.toLowerCase();
      this.parameterIndex.set(key, param);
    }
  }

  queryUIProperty(componentProperty: string): UIComponentProperty | null {
    const key = componentProperty.toLowerCase();
    return this.propertyIndex.get(key) || null;
  }

  queryScriptingAPI(apiCall: string): ScriptingAPIMethod | null {
    const key = apiCall.toLowerCase();
    return this.apiMethodIndex.get(key) || null;
  }

  queryModuleParameter(moduleParameter: string): ModuleParameter | null {
    const key = moduleParameter.toLowerCase();
    return this.parameterIndex.get(key) || null;
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

    return this.data.codeSnippets.find((snippet: CodeSnippet) => snippet.id === id) || null;
  }

  getAllData(): HISEData | null {
    return this.data;
  }
}
