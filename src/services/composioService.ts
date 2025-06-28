/**
 * Composio + OpenAI Service for User-Specific Calendar Management
 * Each authenticated user gets their own Composio entity and Google Calendar connection
 */

import type { 
  ComposioToolCall, 
  ComposioToolResult, 
  ComposioConnection, 
  ComposioConnectionFeatures, 
  ComposioServiceStats, 
  UserCalendarEvent, 
  UserPreferencesContext 
} from '../types';

export interface ComposioConnectionResponse {
  success: boolean;
  userEmail?: string;
  entityId?: string;
  connectionId?: string;
  redirectUrl?: string;
  status?: string;
  needsOAuthCompletion?: boolean;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface AIMessageResponse {
  success: boolean;
  response?: {
    message: string;
    toolCalls?: ComposioToolCall[];
    toolResults?: ComposioToolResult[];
    userEmail?: string;
    needsConnection?: boolean;
    needsSetup?: boolean;
    redirectUrl?: string;
    toolsUsed?: number;
  };
  error?: string;
  timestamp: string;
}

export interface ComposioTestResponse {
  success: boolean;
  testResult?: {
    status: string;
    message: string;
    userEmail: string;
    entityId: string;
    connectionId: string;
    connectionStatus: string;
    toolsAvailable: number;
    features: ComposioConnectionFeatures;
  };
  error?: string;
  userEmail?: string;
  timestamp: string;
}

class ComposioService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
    console.log('🤖 Composio Service initialized:', this.baseUrl);
  }

  /**
   * Make a request to the server API
   */
  private async makeRequest<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      
      console.log('📤 Making Composio request to:', url);
      
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('📥 Composio response received:', result);
      return result;
    } catch (error) {
      console.error(`❌ Composio API request failed (${endpoint}):`, error);
      throw error;
    }
  }

  /**
   * Setup Composio connection for authenticated user
   */
  async setupUserConnection(userEmail: string): Promise<ComposioConnectionResponse> {
    if (!userEmail) {
      throw new Error('User email is required for Composio connection setup');
    }

    console.log(`🔗 Setting up Composio connection for user: ${userEmail}`);

    return this.makeRequest('/api/composio/setup-connection', {
      method: 'POST',
      body: JSON.stringify({ userEmail }),
    });
  }

  /**
   * Setup Composio connection using proper OAuth flow (following Composio documentation)
   */
  async setupUserConnectionWithOAuth(userEmail: string, redirectUrl?: string): Promise<ComposioConnectionResponse> {
    if (!userEmail) {
      throw new Error('User email is required for Composio OAuth connection setup');
    }

    console.log(`🔗 Setting up Composio OAuth connection for user: ${userEmail}`);

    return this.makeRequest('/api/composio/setup-connection-with-oauth', {
      method: 'POST',
      body: JSON.stringify({ 
        userEmail, 
        redirectUrl 
      }),
    });
  }

  /**
   * Send message to AI with user-specific Composio tools
   */
  async sendMessage(
    message: string,
    userEmail: string,
    context?: {
      events?: UserCalendarEvent[];
      preferences?: UserPreferencesContext;
      currentDate?: Date;
    }
  ): Promise<AIMessageResponse> {
    if (!message.trim()) {
      throw new Error('Message cannot be empty');
    }

    if (!userEmail) {
      throw new Error('User email is required for AI message processing');
    }

    console.log(`💬 Sending AI message for user ${userEmail}: "${message}"`);

    return this.makeRequest('/api/ai/send-message', {
      method: 'POST',
      body: JSON.stringify({ 
        message, 
        userEmail,
        context: {
          ...context,
          currentDate: context?.currentDate?.toISOString(),
        }
      }),
    });
  }

  /**
   * Test user's Composio connection
   */
  async testUserConnection(userEmail: string): Promise<ComposioTestResponse> {
    if (!userEmail) {
      throw new Error('User email is required for connection test');
    }

    console.log(`🧪 Testing Composio connection for user: ${userEmail}`);

    return this.makeRequest('/api/composio/test-connection', {
      method: 'POST',
      body: JSON.stringify({ userEmail }),
    });
  }

  /**
   * Get all user connections
   */
  async getUserConnections(): Promise<{ success: boolean; connections: ComposioConnection[]; userCount: number; timestamp: string }> {
    console.log('📋 Getting all user connections');

    return this.makeRequest('/api/composio/connections');
  }

  /**
   * Check if server is available
   */
  async isServerAvailable(): Promise<boolean> {
    try {
      await this.makeRequest('/api/health');
      return true;
    } catch (error) {
      console.warn('⚠️ Composio server is not available:', error);
      return false;
    }
  }

  /**
   * Get service statistics
   */
  async getServiceStats(): Promise<{ success: boolean; stats: ComposioServiceStats; timestamp: string }> {
    console.log('📊 Getting Composio service statistics');

    return this.makeRequest('/api/stats');
  }

  /**
   * Get base URL for debugging
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Check connection status for a specific user
   */
  async checkConnectionStatus(userEmail: string): Promise<{ success: boolean; status: string; message: string; needsSetup?: boolean; toolsAvailable?: number; connectionData?: ComposioConnection; timestamp: string }> {
    if (!userEmail) {
      throw new Error('User email is required for connection status check');
    }

    console.log(`🔍 Checking connection status for user: ${userEmail}`);

    return this.makeRequest(`/api/composio/status/${encodeURIComponent(userEmail)}`);
  }

  /**
   * Handle OAuth completion by checking URL parameters
   */
  handleOAuthCompletion(): { success: boolean; userEmail?: string; error?: string } {
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('composio_success') === 'true') {
      const userEmail = urlParams.get('user');
      console.log('✅ Composio OAuth completed successfully for:', userEmail);
      
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      
      return { success: true, userEmail: userEmail || undefined };
    }
    
    if (urlParams.get('composio_error')) {
      const error = urlParams.get('composio_error');
      console.error('❌ Composio OAuth error:', error);
      
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      
      return { success: false, error: error || 'OAuth failed' };
    }
    
    if (urlParams.get('composio_status') === 'completed') {
      console.log('🔗 Composio OAuth process completed');
      
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      
      return { success: true };
    }
    
    return { success: false };
  }

  /**
   * Poll connection status until it becomes active or times out (server-side polling)
   */
  async pollConnectionStatus(userEmail: string, maxAttempts: number = 10, intervalMs: number = 3000): Promise<{ success: boolean; status?: string; error?: string; attempts?: number }> {
    if (!userEmail) {
      throw new Error('User email is required for polling connection status');
    }

    console.log(`🔄 Starting server-side polling for ${userEmail} (max ${maxAttempts} attempts)`);

    return this.makeRequest('/api/composio/poll-connection-status', {
      method: 'POST',
      body: JSON.stringify({ 
        userEmail, 
        maxAttempts, 
        intervalMs 
      }),
    });
  }
}

export const composioService = new ComposioService();
export default composioService;