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
    lafComponents: number;
    lafFunctions: number;
  };
}

export interface ServerStatus extends ServerStatusBase {
  mode: 'local' | 'production';
  hiseRuntime: {
    available: boolean;
    url: string;
    project: string | null;
    error: string | null;
  };
  hints: {
    resources: string;
  };
}

// ============================================================================
// Workflow Types
// ============================================================================

/**
 * Workflow definition for guiding AI agents through common tasks
 */
export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: string[];
  tools: string[];
  tips?: string[];
}

// ============================================================================
// HISE Runtime Bridge Types
// These types correspond to HISE REST API responses
// ============================================================================

/**
 * Code context for an error location
 */
export interface ErrorCodeContext {
  /** Callback name where error occurred (e.g., "onInit") */
  callback: string;
  /** Error line number (1-based) */
  line: number;
  /** Error column number (1-based) */
  column: number;
  /** Code snippet with line numbers (e.g., "14: code\n15: error line\n16: code") */
  code: string;
}

/**
 * HISE REST API error structure
 */
export interface HiseError {
  errorMessage: string;
  callstack: string[];
  /** Auto-populated code context around the error location */
  codeContext?: ErrorCodeContext;
  /** Suggestions for fixing the error (from pattern matching + API search) */
  suggestions?: string[];
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
 * External file reference from include() statements
 */
export interface HiseExternalFile {
  name: string;        // e.g., "ExternalStuff.js"
  path: string;        // Full path to the file
}

/**
 * Response from GET /api/get_script
 * Now returns structured callbacks object instead of merged script
 */
export interface HiseScriptResponse {
  success: boolean;
  moduleId: string;
  callbacks: Record<string, string>;  // e.g., { "onInit": "...", "onNoteOn": "function onNoteOn() {...}" }
  externalFiles: HiseExternalFile[];  // Files referenced via include()
  logs: string[];
  errors: HiseError[];
}

/**
 * Response from POST /api/set_script and POST /api/recompile
 */
export interface HiseCompileResponse {
  success: boolean;
  moduleId?: string;
  updatedCallbacks?: string[];  // Which callbacks were updated
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
 * Now uses structured callbacks object instead of single script string
 */
export interface SetScriptParams {
  moduleId: string;
  callbacks: Record<string, string>;  // e.g., { "onInit": "...", "onNoteOn": "..." }
  compile?: boolean;
}

/**
 * Cached script data for efficient line editing
 */
export interface CachedScript {
  script: string;
  lines: string[];
  timestamp: number;
  hash: string;  // SHA256 hash (first 16 chars) for cache validation
}

/**
 * Single line edit operation
 */
export interface LineEdit {
  line: number;      // 1-based line number
  content: string;   // New content for this line
}

/**
 * Replace a range of lines
 */
export interface ReplaceRange {
  startLine: number;  // 1-based, inclusive
  endLine: number;    // 1-based, inclusive
  content: string;    // Replacement content (can be multi-line with \n)
}

/**
 * Insert content after a specific line
 */
export interface InsertAfter {
  line: number;       // 1-based, insert after this line (0 = insert at beginning)
  content: string;    // Content to insert (can be multi-line with \n)
}

/**
 * Parameters for edit_script
 */
export interface EditScriptParams {
  moduleId: string;
  callback?: string;
  // Only ONE of these should be provided:
  edits?: LineEdit[];           // Replace specific lines
  replaceRange?: ReplaceRange;  // Replace a range of lines
  insertAfter?: InsertAfter;    // Insert new lines after a line
  deleteLines?: number[];       // Delete specific lines (1-based)
  compile?: boolean;            // Default: true
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

// ============================================================================
// Component-related types for UI bridge tools
// ============================================================================

/**
 * Basic component info (flat list)
 */
export interface HiseComponentInfo {
  id: string;
  type: string;
}

/**
 * Component info with hierarchy and layout properties
 */
export interface HiseComponentHierarchy extends HiseComponentInfo {
  visible: boolean;
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  childComponents: HiseComponentHierarchy[];
}

/**
 * Response from GET /api/list_components
 */
export interface HiseListComponentsResponse {
  success: boolean;
  moduleId: string;
  components: HiseComponentInfo[] | HiseComponentHierarchy[];
  logs: string[];
  errors: HiseError[];
}

/**
 * Component property with value and metadata
 */
export interface HiseComponentProperty {
  id: string;
  value: string | number | boolean;
  isDefault: boolean;
  options?: string[];
}

/**
 * Response from GET /api/get_component_properties
 */
export interface HiseGetComponentPropertiesResponse {
  success: boolean;
  moduleId: string;
  id: string;
  type: string;
  properties?: HiseComponentProperty[];  // Optional - omitted when compact=true and all properties are default
  logs: string[];
  errors: HiseError[];
}

/**
 * Options for getComponentProperties - allows filtering the response
 */
export interface GetComponentPropertiesOptions {
  compact?: boolean;      // Default: true - only return non-default properties
  properties?: string[];  // Filter to only these specific property names
}

/**
 * Response from POST /api/set_component_properties
 */
export interface HiseSetComponentPropertiesResponse {
  success: boolean;
  moduleId: string;
  applied?: { id: string; properties: string[] }[];
  recompileRequired?: boolean;
  locked?: { id: string; property: string }[];
  errorMessage?: string;
  logs: string[];
  errors: HiseError[];
}

/**
 * Response from GET /api/get_component_value
 */
export interface HiseGetComponentValueResponse {
  success: boolean;
  moduleId: string;
  id: string;
  type: string;
  value: number;
  min: number;
  max: number;
  logs: string[];
  errors: HiseError[];
}

/**
 * Response from POST /api/set_component_value
 */
export interface HiseSetComponentValueResponse {
  success: boolean;
  moduleId: string;
  id: string;
  type: string;
  logs: string[];
  errors: HiseError[];
}

/**
 * Selected component with full properties
 */
export interface HiseSelectedComponent {
  id: string;
  type: string;
  properties: HiseComponentProperty[];
}

/**
 * Response from GET /api/get_selected_components
 */
export interface HiseGetSelectedComponentsResponse {
  success: boolean;
  moduleId: string;
  selectionCount: number;
  components: HiseSelectedComponent[];
  logs: string[];
  errors: HiseError[];
}

/**
 * Parameters for set_component_properties
 */
export interface SetComponentPropertiesParams {
  moduleId: string;
  changes: { id: string; properties: Record<string, unknown> }[];
  force?: boolean;
}

/**
 * Parameters for set_component_value
 */
export interface SetComponentValueParams {
  moduleId: string;
  id: string;
  value: number;
  validateRange?: boolean;
}

// ============================================================================
// LAF (LookAndFeel) Types
// ============================================================================

/**
 * A single property available in the LAF callback's obj parameter
 */
export interface LAFCallbackProperty {
  type: string;
  description: string;
}

/**
 * A LAF function definition with its callback properties
 */
export interface LAFFunction {
  description: string;
  callbackProperties: Record<string, LAFCallbackProperty>;
}

/**
 * A component that has LAF functions
 */
export interface LAFComponent {
  lafFunctions: Record<string, LAFFunction>;
}

/**
 * Root structure of the LAF style guide data
 */
export interface LAFStyleGuideData {
  version: string;
  generated: string;
  categories: {
    ScriptComponents: {
      description: string;
      components: Record<string, LAFComponent>;
    };
    FloatingTileContentTypes: {
      description: string;
      contentTypes: Record<string, LAFComponent>;
    };
    Global: {
      description: string;
      categories: Record<string, LAFComponent>;
    };
  };
}

/**
 * Result from list_laf_functions
 */
export interface LAFListResult {
  componentType: string;
  category: 'ScriptComponents' | 'FloatingTileContentTypes' | 'Global';
  functions: string[];
  note?: string;
}

/**
 * Result from query_laf_function
 */
export interface LAFQueryResult {
  functionName: string;
  componentType: string;
  category: 'ScriptComponents' | 'FloatingTileContentTypes' | 'Global';
  description: string;
  properties: Record<string, LAFCallbackProperty>;
}

/**
 * Result from hise_runtime_get_laf_functions
 */
export interface LAFRuntimeResult {
  componentIds: string[];
  functions: string[];
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
