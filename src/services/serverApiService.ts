/**
 * Client-side service for communicating with the server-side Letta and Composio services
 */

export interface ServerApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface LettaHealthResponse {
  healthy: boolean;
  agentId?: string;
  error?: string;
  timestamp: string;
}

export interface LettaMessageResponse {
  success: boolean;
  response?: {
    message: string;
    suggestions?: any[];
    events?: any[];
    action?: string;
  };
  error?: string;
  timestamp: string;
}

export interface ComposioConnectionResponse {
  success: boolean;
  redirectUrl?: string;
  connectionId?: string;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface UserGoogleCalendarConnectionResponse {
  success: boolean;
  agentId?: string;
  message?: string;
  error?: string;
  timestamp: string;
}

class ServerApiService {
  private baseUrl: string;

  constructor() {
    // Use the correct server port (3001) instead of Vite dev server port (5173)
    this.baseUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
    console.log('🌐 Server API Service initialized:', this.baseUrl);
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
      
      console.log('📤 Making request to:', url);
      
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
      console.log('📥 Response received:', result);
      return result;
    } catch (error) {
      console.error(`❌ Server API request failed (${endpoint}):`, error);
      throw error;
    }
  }

  /**
   * Check server health
   */
  async checkServerHealth(): Promise<{ status: string; services: any; timestamp: string }> {
    return this.makeRequest('/api/health');
  }

  /**
   * Connect user's Google Calendar to server integration
   */
  async connectUserGoogleCalendar(
    userEmail: string,
    accessToken: string,
    refreshToken?: string,
    expiresIn?: number
  ): Promise<UserGoogleCalendarConnectionResponse> {
    return this.makeRequest('/api/user/connect-google-calendar', {
      method: 'POST',
      body: JSON.stringify({ 
        userEmail, 
        accessToken, 
        refreshToken, 
        expiresIn 
      }),
    });
  }

  /**
   * Letta service methods
   */
  async lettaHealthCheck(userEmail?: string): Promise<LettaHealthResponse> {
    return this.makeRequest('/api/letta/health-check', {
      method: 'POST',
      body: JSON.stringify({ userEmail }),
    });
  }

  async lettaSendMessage(
    message: string, 
    context?: {
      events?: any[];
      preferences?: any;
      currentDate?: Date;
      userEmail?: string;
    }
  ): Promise<LettaMessageResponse> {
    return this.makeRequest('/api/letta/send-message', {
      method: 'POST',
      body: JSON.stringify({ 
        message, 
        context: {
          ...context,
          currentDate: context?.currentDate?.toISOString(),
        }
      }),
    });
  }

  async lettaGenerateSuggestions(
    events: any[],
    preferences: any,
    currentDate: Date,
    userEmail?: string
  ): Promise<{ success: boolean; suggestions: any[]; error?: string; timestamp: string }> {
    return this.makeRequest('/api/letta/generate-suggestions', {
      method: 'POST',
      body: JSON.stringify({ 
        events, 
        preferences, 
        currentDate: currentDate.toISOString(),
        userEmail 
      }),
    });
  }

  /**
   * Composio service methods
   */
  async composioConnectGoogleCalendar(): Promise<ComposioConnectionResponse> {
    return this.makeRequest('/api/composio/connect-google-calendar', {
      method: 'POST',
    });
  }

  async composioGetConnections(): Promise<{ success: boolean; connections: any[]; error?: string; timestamp: string }> {
    return this.makeRequest('/api/composio/connections');
  }

  async composioTestConnection(): Promise<{ success: boolean; testResult: any; error?: string; timestamp: string }> {
    return this.makeRequest('/api/composio/test-connection', {
      method: 'POST',
    });
  }

  /**
   * Get service statistics
   */
  async getServiceStats(): Promise<{ success: boolean; stats: any; error?: string; timestamp: string }> {
    return this.makeRequest('/api/stats');
  }

  /**
   * Check if server is available
   */
  async isServerAvailable(): Promise<boolean> {
    try {
      await this.checkServerHealth();
      return true;
    } catch (error) {
      console.warn('⚠️ Server is not available:', error);
      return false;
    }
  }

  /**
   * Get base URL for debugging
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

export const serverApiService = new ServerApiService();
export default serverApiService;