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

export interface ServerStatusBase {
  server: {
    name: string;
    version: string;
  };
  runtime: {
    nodeVersion: string;
    platform: string;
  };
  data: {
    loaded: boolean;
    cachedAt: string | null;
    cacheAgeMinutes: number | null;
    snippetsLoaded: boolean;
  };
  statistics: {
    uiComponents: number;
    uiProperties: number;
    scriptingNamespaces: number;
    scriptingMethods: number;
    moduleTypes: number;
    moduleParameters: number;
    codeSnippets: number;
  };
}

export interface ServerStatus extends ServerStatusBase {
  hiseRuntime: {
    available: boolean;
    url: string;
    project: string | null;
    error: string | null;
  };
}

// ============================================================================
// HISE Runtime Bridge Types
// These types correspond to HISE REST API responses
// ============================================================================

/**
 * HISE REST API error structure
 */
export interface HiseError {
  errorMessage: string;
  callstack: string[];
}

/**
 * Script processor callback info
 */
export interface HiseCallback {
  id: string;
  empty: boolean;
}

/**
 * Script processor info from HISE
 */
export interface HiseScriptProcessor {
  moduleId: string;
  isMainInterface: boolean;
  externalFiles: string[];
  callbacks: HiseCallback[];
}

/**
 * Response from GET /api/status
 */
export interface HiseStatusResponse {
  success: boolean;
  server: {
    version: string;
    compileTimeout?: string;  // Timeout in seconds (from HISE settings)
  };
  project: {
    name: string;
    projectFolder: string;
    scriptsFolder: string;
  };
  scriptProcessors: HiseScriptProcessor[];
  logs: string[];
  errors: HiseError[];
}

/**
 * Response from GET /api/get_script
 */
export interface HiseScriptResponse {
  success: boolean;
  moduleId: string;
  callback?: string;
  script: string;
  logs: string[];
  errors: HiseError[];
}

/**
 * Response from POST /api/set_script and POST /api/recompile
 */
export interface HiseCompileResponse {
  success: boolean;
  result?: string;
  logs: string[];
  errors: HiseError[];
}

/**
 * Response from GET /api/screenshot
 */
export interface HiseScreenshotResponse {
  success: boolean;
  moduleId: string;
  id?: string;
  width: number;
  height: number;
  scale: number;
  imageData?: string;   // Base64 PNG if outputPath not specified
  filePath?: string;    // File path if outputPath was specified
  logs: string[];
  errors: HiseError[];
}

/**
 * Parameters for set_script
 */
export interface SetScriptParams {
  moduleId: string;
  script: string;
  callback?: string;
  compile?: boolean;
}

/**
 * Parameters for screenshot
 */
export interface ScreenshotParams {
  moduleId?: string;
  id?: string;
  scale?: number;
  outputPath?: string;
}

// Auth Types (Phase 1-2)

export interface TokenValidationResult {
  valid: boolean;
  user_id?: number;
  username?: string;
  email?: string;
  scopes?: string[];
  token_type?: 'access_token' | 'api_key';
  error?: string;
  error_description?: string;
}

export interface UserContext {
  id: number;
  username: string;
  email: string;
  scopes: string[];
  tokenType: 'access_token' | 'api_key';
}

export interface CachedToken {
  user: UserContext;
  expires: number;
}

export interface AuthConfig {
  validateTokenUrl: string;
  sharedSecret: string;
  cacheTtlMs: number;
}

// OAuth Types (Phase 3)

export interface OAuthConfig {
  issuer: string;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  mcpServerUrl: string;
  supportedScopes: string[];
}

export interface OAuthMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  scopes_supported: string[];
  token_endpoint_auth_methods_supported: string[];
}

export interface TokenRequest {
  grant_type: 'authorization_code' | 'refresh_token';
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface TokenErrorResponse {
  error: string;
  error_description?: string;
}

export interface ClientRegistrationRequest {
  client_name: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
  token_endpoint_auth_method?: string;
}

export interface ClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  scope: string;
  token_endpoint_auth_method: string;
  client_id_issued_at: number;
  client_secret_expires_at: number;
}
