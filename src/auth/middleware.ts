import { Request, Response, NextFunction } from 'express';
import { UserContext } from '../types.js';
import { getAuthConfig, isAuthConfigured } from './config.js';
import { getTokenCache } from './cache.js';
import { validateToken, toUserContext } from './token.js';

// Extend Express Request type to include user context
declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
    }
  }
}

/**
 * Express middleware for Bearer token authentication.
 * 
 * Validates tokens against Django's /api/mcp/validate-token/ endpoint.
 * Caches valid tokens for the configured TTL to reduce validation requests.
 * 
 * Usage:
 *   app.use('/mcp', authMiddleware);
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip auth if not configured (development mode)
  if (!isAuthConfigured()) {
    console.error('Auth not configured - allowing unauthenticated access');
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  // Check for Authorization header
  if (!authHeader) {
    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer realm="MCP Server"')
      .json({
        error: 'unauthorized',
        message: 'Authorization header required',
      });
    return;
  }

  // Check for Bearer scheme
  if (!authHeader.startsWith('Bearer ')) {
    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer realm="MCP Server"')
      .json({
        error: 'unauthorized',
        message: 'Bearer token required',
      });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  if (!token) {
    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer realm="MCP Server"')
      .json({
        error: 'unauthorized',
        message: 'Token cannot be empty',
      });
    return;
  }

  // Check cache first
  const config = getAuthConfig();
  const cache = getTokenCache(config.cacheTtlMs);
  const cachedUser = cache.get(token);

  if (cachedUser) {
    req.user = cachedUser;
    next();
    return;
  }

  // Validate token against Django
  const result = await validateToken(token);

  if (!result.valid) {
    // Log auth failure without exposing full token
    const tokenPrefix = token.slice(0, 8);
    console.error(`Auth failed: ${result.error} for token ${tokenPrefix}... from ${req.ip}`);

    res
      .status(401)
      .set('WWW-Authenticate', `Bearer error="${result.error}", error_description="${result.error_description}"`)
      .json({
        error: result.error || 'invalid_token',
        message: result.error_description || 'Token validation failed',
      });
    return;
  }

  // Convert to UserContext
  const userContext = toUserContext(result);

  if (!userContext) {
    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer error="invalid_token"')
      .json({
        error: 'invalid_token',
        message: 'Token validation returned incomplete user data',
      });
    return;
  }

  // Cache the valid token
  cache.set(token, userContext);

  // Attach user to request
  req.user = userContext;
  next();
}

/**
 * Middleware factory for scope-based authorization.
 * 
 * Usage:
 *   app.post('/mcp/write-operation', requireScope('mcp:write'), handler);
 */
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res
        .status(401)
        .set('WWW-Authenticate', 'Bearer realm="MCP Server"')
        .json({
          error: 'unauthorized',
          message: 'Authentication required',
        });
      return;
    }

    if (!req.user.scopes.includes(scope)) {
      res
        .status(403)
        .set('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${scope}"`)
        .json({
          error: 'insufficient_scope',
          message: `Required scope: ${scope}`,
          required_scope: scope,
          available_scopes: req.user.scopes,
        });
      return;
    }

    next();
  };
}

/**
 * Optional auth middleware - doesn't fail if no token provided.
 * Useful for endpoints that work both authenticated and anonymously.
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!isAuthConfigured()) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  // No auth header is OK for optional auth
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  // If token is provided, validate it
  const token = authHeader.slice(7);
  
  if (!token) {
    next();
    return;
  }

  const config = getAuthConfig();
  const cache = getTokenCache(config.cacheTtlMs);
  const cachedUser = cache.get(token);

  if (cachedUser) {
    req.user = cachedUser;
    next();
    return;
  }

  const result = await validateToken(token);

  if (result.valid) {
    const userContext = toUserContext(result);
    if (userContext) {
      cache.set(token, userContext);
      req.user = userContext;
    }
  }

  next();
}
