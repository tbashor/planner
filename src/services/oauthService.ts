/**
 * Secure OAuth 2.0 Service for Google Calendar Integration
 * Handles the complete authentication flow with proper error handling
 */

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  authEndpoint: string;
  tokenEndpoint: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface AuthState {
  state: string;
  codeVerifier: string;
  timestamp: number;
}

class OAuthService {
  private config: OAuthConfig;
  private readonly STATE_STORAGE_KEY = 'oauth_state';
  private readonly TOKEN_STORAGE_KEY = 'oauth_tokens';

  constructor() {
    // OAuth 2.0 Configuration
    this.config = {
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
      clientSecret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '',
      redirectUri: this.getRedirectUri(),
      scope: 'https://www.googleapis.com/auth/calendar',
      authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    };

    this.validateConfiguration();
  }

  /**
   * Get the correct redirect URI based on environment
   */
  private getRedirectUri(): string {
    const envRedirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI;
    
    if (envRedirectUri) {
      return envRedirectUri;
    }

    // Fallback to current origin + callback path
    const origin = window.location.origin;
    return `${origin}/auth/callback`;
  }

  /**
   * Validate OAuth configuration
   */
  private validateConfiguration(): void {
    const missing = [];
    
    if (!this.config.clientId) missing.push('VITE_GOOGLE_CLIENT_ID');
    if (!this.config.clientSecret) missing.push('VITE_GOOGLE_CLIENT_SECRET');
    if (!this.config.redirectUri) missing.push('VITE_GOOGLE_REDIRECT_URI');

    if (missing.length > 0) {
      throw new Error(`Missing OAuth configuration: ${missing.join(', ')}`);
    }

    console.log('✅ OAuth Configuration Validated:');
    console.log(`- Client ID: ${this.config.clientId.substring(0, 20)}...`);
    console.log(`- Redirect URI: ${this.config.redirectUri}`);
    console.log(`- Scope: ${this.config.scope}`);
  }

  /**
   * Generate cryptographically secure random string
   */
  private generateSecureRandom(length: number = 32): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private async generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
    const codeVerifier = this.generateSecureRandom(32);
    
    // Create code challenge using SHA256
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    
    // Convert to base64url
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return { codeVerifier, codeChallenge };
  }

  /**
   * Generate and store secure state parameter
   */
  private generateState(): string {
    const state = this.generateSecureRandom(16);
    const timestamp = Date.now();
    
    const authState: AuthState = {
      state,
      codeVerifier: '', // Will be set when using PKCE
      timestamp,
    };

    localStorage.setItem(this.STATE_STORAGE_KEY, JSON.stringify(authState));
    return state;
  }

  /**
   * Validate state parameter
   */
  private validateState(receivedState: string): AuthState | null {
    try {
      const storedData = localStorage.getItem(this.STATE_STORAGE_KEY);
      if (!storedData) {
        console.error('❌ No stored state found');
        return null;
      }

      const authState: AuthState = JSON.parse(storedData);
      
      // Check if state matches
      if (authState.state !== receivedState) {
        console.error('❌ State parameter mismatch');
        return null;
      }

      // Check if state is not too old (5 minutes max)
      const maxAge = 5 * 60 * 1000; // 5 minutes
      if (Date.now() - authState.timestamp > maxAge) {
        console.error('❌ State parameter expired');
        return null;
      }

      return authState;
    } catch (error) {
      console.error('❌ Error validating state:', error);
      return null;
    }
  }

  /**
   * Build authorization URL with proper parameters
   */
  async buildAuthUrl(usePKCE: boolean = true): Promise<string> {
    const state = this.generateState();
    
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scope,
      state: state,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });

    // Add PKCE parameters if enabled
    if (usePKCE) {
      const { codeVerifier, codeChallenge } = await this.generatePKCE();
      
      // Update stored state with code verifier
      const storedData = localStorage.getItem(this.STATE_STORAGE_KEY);
      if (storedData) {
        const authState: AuthState = JSON.parse(storedData);
        authState.codeVerifier = codeVerifier;
        localStorage.setItem(this.STATE_STORAGE_KEY, JSON.stringify(authState));
      }

      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    const authUrl = `${this.config.authEndpoint}?${params.toString()}`;
    
    console.log('🔗 Generated Authorization URL:');
    console.log(`- State: ${state}`);
    console.log(`- Redirect URI: ${this.config.redirectUri}`);
    console.log(`- PKCE Enabled: ${usePKCE}`);
    
    return authUrl;
  }

  /**
   * Handle OAuth callback and extract authorization code
   */
  handleCallback(url: string): { code: string; state: string } | null {
    try {
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');
      const state = urlObj.searchParams.get('state');
      const error = urlObj.searchParams.get('error');
      const errorDescription = urlObj.searchParams.get('error_description');

      // Check for OAuth errors
      if (error) {
        throw new Error(`OAuth Error: ${error} - ${errorDescription || 'Unknown error'}`);
      }

      // Validate required parameters
      if (!code) {
        throw new Error('No authorization code received');
      }

      if (!state) {
        throw new Error('No state parameter received');
      }

      // Validate state parameter
      const authState = this.validateState(state);
      if (!authState) {
        throw new Error('Invalid or expired state parameter');
      }

      console.log('✅ OAuth callback validated successfully');
      return { code, state };
    } catch (error) {
      console.error('❌ OAuth callback error:', error);
      throw error;
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForTokens(code: string, state: string): Promise<TokenResponse> {
    try {
      // Validate state and get stored auth data
      const authState = this.validateState(state);
      if (!authState) {
        throw new Error('Invalid state parameter during token exchange');
      }

      // Prepare token request
      const tokenData = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
      });

      // Add PKCE code verifier if available
      if (authState.codeVerifier) {
        tokenData.append('code_verifier', authState.codeVerifier);
      }

      console.log('🔄 Exchanging authorization code for tokens...');

      const response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: tokenData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Token exchange failed: ${response.status} ${response.statusText} - ${
            errorData.error_description || errorData.error || 'Unknown error'
          }`
        );
      }

      const tokens: TokenResponse = await response.json();

      // Validate token response
      if (!tokens.access_token) {
        throw new Error('No access token received');
      }

      // Store tokens securely
      this.storeTokens(tokens);

      // Clean up state
      localStorage.removeItem(this.STATE_STORAGE_KEY);

      console.log('✅ Token exchange successful');
      console.log(`- Token type: ${tokens.token_type}`);
      console.log(`- Expires in: ${tokens.expires_in} seconds`);
      console.log(`- Scope: ${tokens.scope}`);

      return tokens;
    } catch (error) {
      console.error('❌ Token exchange error:', error);
      localStorage.removeItem(this.STATE_STORAGE_KEY);
      throw error;
    }
  }

  /**
   * Store tokens securely
   */
  private storeTokens(tokens: TokenResponse): void {
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in * 1000),
      token_type: tokens.token_type,
      scope: tokens.scope,
    };

    localStorage.setItem(this.TOKEN_STORAGE_KEY, JSON.stringify(tokenData));
  }

  /**
   * Get stored tokens
   */
  getStoredTokens(): TokenResponse | null {
    try {
      const storedData = localStorage.getItem(this.TOKEN_STORAGE_KEY);
      if (!storedData) return null;

      return JSON.parse(storedData);
    } catch (error) {
      console.error('❌ Error retrieving stored tokens:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const tokens = this.getStoredTokens();
    if (!tokens) return false;

    // Check if token is expired
    const expiresAt = (tokens as any).expires_at;
    if (expiresAt && Date.now() >= expiresAt) {
      console.log('🔄 Access token expired');
      return false;
    }

    return true;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(): Promise<TokenResponse | null> {
    try {
      const storedTokens = this.getStoredTokens();
      if (!storedTokens || !(storedTokens as any).refresh_token) {
        throw new Error('No refresh token available');
      }

      console.log('🔄 Refreshing access token...');

      const refreshData = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: (storedTokens as any).refresh_token,
        grant_type: 'refresh_token',
      });

      const response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: refreshData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Token refresh failed: ${response.status} ${response.statusText} - ${
            errorData.error_description || errorData.error || 'Unknown error'
          }`
        );
      }

      const newTokens: TokenResponse = await response.json();

      // Preserve refresh token if not provided in response
      if (!newTokens.refresh_token && (storedTokens as any).refresh_token) {
        newTokens.refresh_token = (storedTokens as any).refresh_token;
      }

      this.storeTokens(newTokens);

      console.log('✅ Token refresh successful');
      return newTokens;
    } catch (error) {
      console.error('❌ Token refresh error:', error);
      this.clearTokens();
      return null;
    }
  }

  /**
   * Clear stored tokens and state
   */
  clearTokens(): void {
    localStorage.removeItem(this.TOKEN_STORAGE_KEY);
    localStorage.removeItem(this.STATE_STORAGE_KEY);
    console.log('🧹 Tokens cleared');
  }

  /**
   * Get current access token (refresh if needed)
   */
  async getValidAccessToken(): Promise<string | null> {
    if (this.isAuthenticated()) {
      const tokens = this.getStoredTokens();
      return tokens?.access_token || null;
    }

    // Try to refresh token
    const refreshedTokens = await this.refreshAccessToken();
    return refreshedTokens?.access_token || null;
  }

  /**
   * Make authenticated API request
   */
  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const accessToken = await this.getValidAccessToken();
    
    if (!accessToken) {
      throw new Error('No valid access token available');
    }

    const authenticatedOptions = {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const response = await fetch(url, authenticatedOptions);

    // Handle token expiration
    if (response.status === 401) {
      console.log('🔄 Token expired, attempting refresh...');
      const refreshedTokens = await this.refreshAccessToken();
      
      if (refreshedTokens) {
        // Retry request with new token
        authenticatedOptions.headers = {
          ...authenticatedOptions.headers,
          'Authorization': `Bearer ${refreshedTokens.access_token}`,
        };
        return fetch(url, authenticatedOptions);
      } else {
        throw new Error('Authentication failed - please re-authorize');
      }
    }

    return response;
  }

  /**
   * Get OAuth configuration for debugging
   */
  getConfiguration(): Partial<OAuthConfig> {
    return {
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      scope: this.config.scope,
      authEndpoint: this.config.authEndpoint,
      tokenEndpoint: this.config.tokenEndpoint,
    };
  }
}

export const oauthService = new OAuthService();
export default OAuthService;