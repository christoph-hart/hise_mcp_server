export interface HISEData {
  uiComponentProperties: UIComponentProperty[];
  scriptingAPI: ScriptingAPIMethod[];
  moduleParameters: ModuleParameter[];
  codeSnippets: CodeSnippet[];
}

export interface UIComponentProperty {
  id: string;
  componentType: string;
  propertyName: string;
  propertyType: string;
  defaultValue: string | number | boolean;
  description: string;
  possibleValues?: string[];
  deprecated?: boolean;
  deprecatedSince?: string;
  replacement?: string;
}

export interface ScriptingAPIMethod {
  id: string;
  namespace: string;
  methodName: string;
  returnType: string;
  parameters: APIParameter[];
  description: string;
  example?: string;
  deprecated?: boolean;
  deprecatedSince?: string;
  replacement?: string;
}

export interface APIParameter {
  name: string;
  type: string;
  description: string;
  optional: boolean;
  defaultValue?: string;
}

export interface ModuleParameter {
  id: string;
  moduleType: string;
  parameterId: string;
  parameterName: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  description: string;
}

export interface CodeSnippet {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  code: string;
  relatedAPIs: string[];
  relatedComponents: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

export type SearchDomain = "all" | "api" | "ui" | "modules" | "snippets";

export interface SearchResult {
  id: string;
  domain: SearchDomain;
  name: string;
  description: string;
  score: number;
  matchType: "exact" | "prefix" | "keyword" | "fuzzy";
}

export interface EnrichedResult<T> {
  result: T;
  related: string[];
}
