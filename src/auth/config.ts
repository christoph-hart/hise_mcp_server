import { AuthConfig, OAuthConfig } from '../types.js';

const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const DEFAULT_SCOPES = [
  'openid',
  'profile', 
  'email',
  'read',
  'write',
  'mcp:read',
  'mcp:write',
];

export function getAuthConfig(): AuthConfig {
  const validateTokenUrl = process.env.MCP_VALIDATE_TOKEN_URL;
  const sharedSecret = process.env.MCP_SHARED_SECRET;
  const cacheTtlMs = parseInt(process.env.TOKEN_CACHE_TTL || '300', 10) * 1000;

  if (!validateTokenUrl) {
    throw new Error('MCP_VALIDATE_TOKEN_URL environment variable is required');
  }

  if (!sharedSecret) {
    throw new Error('MCP_SHARED_SECRET environment variable is required');
  }

  return {
    validateTokenUrl,
    sharedSecret,
    cacheTtlMs: cacheTtlMs || DEFAULT_CACHE_TTL,
  };
}

export function isAuthConfigured(): boolean {
  return !!(process.env.MCP_VALIDATE_TOKEN_URL && process.env.MCP_SHARED_SECRET);
}

export function getOAuthConfig(): OAuthConfig {
  const issuer = process.env.OAUTH_ISSUER;
  const authorizeUrl = process.env.OAUTH_AUTHORIZE_URL;
  const tokenUrl = process.env.OAUTH_TOKEN_URL;
  const clientId = process.env.MCP_CLIENT_ID;
  const clientSecret = process.env.MCP_CLIENT_SECRET;
  const mcpServerUrl = process.env.MCP_SERVER_URL;

  if (!issuer || !authorizeUrl || !tokenUrl || !clientId || !clientSecret || !mcpServerUrl) {
    throw new Error('OAuth configuration incomplete. Required: OAUTH_ISSUER, OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL, MCP_CLIENT_ID, MCP_CLIENT_SECRET, MCP_SERVER_URL');
  }

  return {
    issuer,
    authorizeUrl,
    tokenUrl,
    clientId,
    clientSecret,
    mcpServerUrl,
    supportedScopes: DEFAULT_SCOPES,
  };
}

export function isOAuthConfigured(): boolean {
  return !!(
    process.env.OAUTH_ISSUER &&
    process.env.OAUTH_AUTHORIZE_URL &&
    process.env.OAUTH_TOKEN_URL &&
    process.env.MCP_CLIENT_ID &&
    process.env.MCP_CLIENT_SECRET &&
    process.env.MCP_SERVER_URL
  );
}
