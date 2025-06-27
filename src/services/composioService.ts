/**
 * Composio + OpenAI Service for User-Specific Calendar Management
 * Each authenticated user gets their own Composio entity and Google Calendar connection
 */

export interface ComposioConnectionResponse {
  success: boolean;
  userEmail?: string;
  entityId?: string;
  connectionId?: string;
  redirectUrl?: string;
  status?: string;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface AIMessageResponse {
  success: boolean;
  response?: {
    message: string;
    toolCalls?: any[];
    toolResults?: any[];
    userEmail?: string;
    needsConnection?: boolean;
    redirectUrl?: string;
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
    features: any;
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
   * Send message to AI with user-specific Composio tools
   */
  async sendMessage(
    message: string,
    userEmail: string,
    context?: {
      events?: any[];
      preferences?: any;
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
  async getUserConnections(): Promise<{ success: boolean; connections: any[]; userCount: number; timestamp: string }> {
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
  async getServiceStats(): Promise<{ success: boolean; stats: any; timestamp: string }> {
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
   * Extract real user email from Composio authentication
   * This would be called after successful Composio authentication
   */
  async getAuthenticatedUserEmail(entityId: string): Promise<string | null> {
    try {
      console.log('🔍 Getting authenticated user email for entity:', entityId);
      
      // In a real implementation, this would call Composio API to get user info
      // For now, we'll extract from the entity ID or use a placeholder
      
      // If entity ID follows pattern like "user_timestamp@temp.local", extract it
      if (entityId.includes('@')) {
        return entityId;
      }
      
      // Otherwise, we'd need to call Composio API to get the actual authenticated email
      // This is a placeholder - in production you'd call:
      // const userInfo = await composio.getEntityUserInfo(entityId);
      // return userInfo.email;
      
      return null;
    } catch (error) {
      console.error('❌ Error getting authenticated user email:', error);
      return null;
    }
  }
}

export const composioService = new ComposioService();
export default composioService;