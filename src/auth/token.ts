import { TokenValidationResult, UserContext } from '../types.js';
import { getAuthConfig } from './config.js';

/**
 * Validate a bearer token against the Django OAuth server.
 * 
 * POST https://store.hise.dev/api/mcp/validate-token/
 * Headers:
 *   Authorization: Bearer <MCP_SHARED_SECRET>
 *   Content-Type: application/json
 * Body:
 *   { "token": "<user's bearer token>" }
 * 
 * Returns:
 *   Success: { valid: true, user_id, username, email, scopes, token_type }
 *   Failure: { valid: false, error, error_description }
 */
export async function validateToken(token: string): Promise<TokenValidationResult> {
  const config = getAuthConfig();

  try {
    const response = await fetch(config.validateTokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.sharedSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      // Handle non-2xx responses
      const statusText = response.statusText;
      console.error(`Token validation request failed: ${response.status} ${statusText}`);
      
      // Try to parse error response
      try {
        const errorData = await response.json() as { error?: string; error_description?: string };
        return {
          valid: false,
          error: errorData.error || 'validation_error',
          error_description: errorData.error_description || `HTTP ${response.status}: ${statusText}`,
        };
      } catch {
        return {
          valid: false,
          error: 'validation_error',
          error_description: `HTTP ${response.status}: ${statusText}`,
        };
      }
    }

    const result = await response.json() as TokenValidationResult;
    return result;
  } catch (error) {
    console.error('Token validation error:', error);
    return {
      valid: false,
      error: 'server_error',
      error_description: 'Token validation service unavailable',
    };
  }
}

/**
 * Convert a valid TokenValidationResult to UserContext.
 */
export function toUserContext(result: TokenValidationResult): UserContext | null {
  if (!result.valid || !result.user_id || !result.username || !result.token_type) {
    return null;
  }

  return {
    id: result.user_id,
    username: result.username,
    email: result.email || '',
    scopes: result.scopes || [],
    tokenType: result.token_type,
  };
}
