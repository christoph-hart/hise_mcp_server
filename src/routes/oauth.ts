import { Router, Request, Response } from 'express';
import {
  OAuthMetadata,
  TokenRequest,
  TokenResponse,
  TokenErrorResponse,
  ClientRegistrationRequest,
  ClientRegistrationResponse,
} from '../types.js';
import { getOAuthConfig, isOAuthConfigured } from '../auth/config.js';
import { randomUUID } from 'node:crypto';

const router = Router();

// In-memory store for dynamically registered clients
// In production, this should be persisted to a database
const dynamicClients: Map<string, ClientRegistrationResponse> = new Map();

/**
 * OAuth 2.0 Authorization Server Metadata
 * RFC 8414: https://tools.ietf.org/html/rfc8414
 * 
 * Claude Desktop and other MCP clients discover OAuth endpoints via this.
 * GET /.well-known/oauth-authorization-server
 */
router.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
  if (!isOAuthConfigured()) {
    res.status(503).json({
      error: 'oauth_not_configured',
      message: 'OAuth is not configured on this server',
    });
    return;
  }

  const config = getOAuthConfig();

  const metadata: OAuthMetadata = {
    issuer: config.mcpServerUrl,
    authorization_endpoint: config.authorizeUrl,
    token_endpoint: `${config.mcpServerUrl}/oauth/token`,
    registration_endpoint: `${config.mcpServerUrl}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: config.supportedScopes,
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
  };

  res.json(metadata);
});

/**
 * Dynamic Client Registration
 * RFC 7591: https://tools.ietf.org/html/rfc7591
 * 
 * Claude Desktop registers itself as an OAuth client dynamically.
 * POST /oauth/register
 */
router.post('/oauth/register', (req: Request, res: Response) => {
  if (!isOAuthConfigured()) {
    res.status(503).json({
      error: 'oauth_not_configured',
      message: 'OAuth is not configured on this server',
    });
    return;
  }

  const registration = req.body as ClientRegistrationRequest;

  // Validate required fields
  if (!registration.client_name) {
    res.status(400).json({
      error: 'invalid_client_metadata',
      error_description: 'client_name is required',
    });
    return;
  }

  if (!registration.redirect_uris || registration.redirect_uris.length === 0) {
    res.status(400).json({
      error: 'invalid_client_metadata',
      error_description: 'redirect_uris is required',
    });
    return;
  }

  // Generate client credentials
  const clientId = `dyn_${randomUUID().replace(/-/g, '')}`;
  const clientSecret = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');

  const response: ClientRegistrationResponse = {
    client_id: clientId,
    client_secret: clientSecret,
    client_name: registration.client_name,
    redirect_uris: registration.redirect_uris,
    grant_types: registration.grant_types || ['authorization_code', 'refresh_token'],
    response_types: registration.response_types || ['code'],
    scope: registration.scope || 'openid profile email mcp:read mcp:write',
    token_endpoint_auth_method: registration.token_endpoint_auth_method || 'client_secret_post',
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0, // Never expires
  };

  // Store the client for later validation
  dynamicClients.set(clientId, response);

  console.error(`OAuth: Registered dynamic client "${registration.client_name}" with ID ${clientId}`);

  res.status(201).json(response);
});

/**
 * Token Endpoint (Proxy to Django)
 * RFC 6749: https://tools.ietf.org/html/rfc6749#section-4.1.3
 * 
 * Proxies token requests to Django's /o/token/ endpoint.
 * Handles both authorization_code and refresh_token grant types.
 * POST /oauth/token
 */
router.post('/oauth/token', async (req: Request, res: Response) => {
  if (!isOAuthConfigured()) {
    res.status(503).json({
      error: 'oauth_not_configured',
      error_description: 'OAuth is not configured on this server',
    });
    return;
  }

  const config = getOAuthConfig();
  const tokenRequest = req.body as TokenRequest;

  // Validate grant_type
  if (!tokenRequest.grant_type) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'grant_type is required',
    } as TokenErrorResponse);
    return;
  }

  if (!['authorization_code', 'refresh_token'].includes(tokenRequest.grant_type)) {
    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: `Unsupported grant_type: ${tokenRequest.grant_type}`,
    } as TokenErrorResponse);
    return;
  }

  // Build the request to Django
  const params = new URLSearchParams();
  params.append('grant_type', tokenRequest.grant_type);

  if (tokenRequest.grant_type === 'authorization_code') {
    if (!tokenRequest.code) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'code is required for authorization_code grant',
      } as TokenErrorResponse);
      return;
    }
    params.append('code', tokenRequest.code);

    if (tokenRequest.redirect_uri) {
      params.append('redirect_uri', tokenRequest.redirect_uri);
    }

    // PKCE: Pass through code_verifier to Django
    if (tokenRequest.code_verifier) {
      params.append('code_verifier', tokenRequest.code_verifier);
    }
  } else if (tokenRequest.grant_type === 'refresh_token') {
    if (!tokenRequest.refresh_token) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'refresh_token is required for refresh_token grant',
      } as TokenErrorResponse);
      return;
    }
    params.append('refresh_token', tokenRequest.refresh_token);
  }

  // Determine client credentials
  // Priority: request body > dynamic client > server config
  let clientId = tokenRequest.client_id;
  let clientSecret = tokenRequest.client_secret;

  // Check if this is a dynamically registered client
  if (clientId && dynamicClients.has(clientId)) {
    const dynamicClient = dynamicClients.get(clientId)!;
    // For dynamic clients, we use our server's credentials to proxy
    // since Django doesn't know about dynamically registered clients
    clientId = config.clientId;
    clientSecret = config.clientSecret;
    console.error(`OAuth: Proxying token request for dynamic client to server credentials`);
  } else {
    // Use server's OAuth client credentials
    clientId = clientId || config.clientId;
    clientSecret = clientSecret || config.clientSecret;
  }

  params.append('client_id', clientId);
  if (clientSecret) {
    params.append('client_secret', clientSecret);
  }

  try {
    console.error(`OAuth: Proxying ${tokenRequest.grant_type} request to ${config.tokenUrl}`);

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`OAuth: Token request failed: ${JSON.stringify(data)}`);
      res.status(response.status).json(data as TokenErrorResponse);
      return;
    }

    console.error(`OAuth: Token request successful`);
    res.json(data as TokenResponse);
  } catch (error) {
    console.error('OAuth: Token proxy error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to communicate with authorization server',
    } as TokenErrorResponse);
  }
});

/**
 * Get info about a dynamically registered client (for debugging)
 * GET /oauth/clients/:clientId
 */
router.get('/oauth/clients/:clientId', (req: Request, res: Response) => {
  const { clientId } = req.params;
  const client = dynamicClients.get(clientId);

  if (!client) {
    res.status(404).json({
      error: 'client_not_found',
      message: 'No client found with that ID',
    });
    return;
  }

  // Return client info without the secret
  res.json({
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    grant_types: client.grant_types,
    scope: client.scope,
    client_id_issued_at: client.client_id_issued_at,
  });
});

export { router as oauthRouter };
