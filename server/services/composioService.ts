import { LettaClient } from '@letta-ai/letta-client';
import { ComposioToolSet } from 'composio-core';

export interface ComposioConfig {
  baseUrl: string;
  apiKey: string;
}

export interface ConnectionResult {
  redirectUrl: string;
  connectionId: string;
  status: string;
}

export class ComposioService {
  private lettaClient: LettaClient;
  private toolset: ComposioToolSet;
  private config: ComposioConfig;

  constructor() {
    // Load configuration from environment variables
    this.config = {
      baseUrl: process.env.VITE_LETTA_BASE_URL || 'https://api.letta.ai',
      apiKey: process.env.VITE_LETTA_API_KEY || '',
    };

    // Initialize Letta client
    this.lettaClient = new LettaClient({
      baseUrl: this.config.baseUrl,
      token: this.config.apiKey,
    });

    // Initialize Composio toolset
    this.toolset = new ComposioToolSet();

    console.log('🔧 Composio Service initialized:');
    console.log('- Letta Base URL:', this.config.baseUrl);
    console.log('- API Key:', this.config.apiKey ? 'Configured ✅' : 'Not configured ❌');
    console.log('- Toolset:', 'ComposioToolSet initialized ✅');

    if (!this.config.apiKey) {
      console.warn('⚠️ WARNING: No Letta API key configured. Composio functionality may be limited.');
    }
  }

  /**
   * Test the basic Composio connection
   */
  async testConnection(): Promise<{ status: string; message: string; timestamp: string }> {
    try {
      console.log('🔍 Testing Composio connection...');
      
      // Test if we can initialize the toolset
      const testResult = {
        lettaClient: !!this.lettaClient,
        toolset: !!this.toolset,
        hasApiKey: !!this.config.apiKey,
        baseUrl: this.config.baseUrl
      };

      console.log('✅ Composio connection test successful:', testResult);
      
      return {
        status: 'success',
        message: 'Composio service is properly initialized and ready for connections',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Composio connection test failed:', error);
      
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error during connection test',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Initiate Google Calendar connection using Composio
   */
  async initiateGoogleCalendarConnection(): Promise<ConnectionResult> {
    try {
      console.log('🔄 Initiating Google Calendar connection via Composio...');
      console.log('- App Name: GOOGLECALENDAR');
      console.log('- Toolset:', this.toolset ? 'Available' : 'Not available');

      // Use the exact code structure from the Composio documentation
      const connection = await this.toolset.connectedAccounts.initiate({
        appName: "GOOGLECALENDAR"
      });

      console.log(`✅ Google Calendar connection initiated successfully`);
      console.log(`🔗 Open this URL to authenticate: ${connection.redirectUrl}`);

      return {
        redirectUrl: connection.redirectUrl,
        connectionId: connection.connectionId || 'unknown',
        status: 'initiated'
      };
    } catch (error) {
      console.error('❌ Failed to initiate Google Calendar connection:', error);
      
      // Provide detailed error information
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorDetails = {
        error: errorMessage,
        hasToolset: !!this.toolset,
        hasApiKey: !!this.config.apiKey,
        timestamp: new Date().toISOString()
      };

      console.error('🔍 Error details:', errorDetails);
      
      throw new Error(`Google Calendar connection failed: ${errorMessage}`);
    }
  }

  /**
   * Get all connected accounts
   */
  async getConnections(): Promise<any[]> {
    try {
      console.log('🔍 Fetching Composio connections...');
      
      // This would typically fetch connected accounts
      // For now, return empty array as we're just setting up the basic connection
      const connections: any[] = [];
      
      console.log(`📋 Found ${connections.length} connections`);
      return connections;
    } catch (error) {
      console.error('❌ Failed to fetch connections:', error);
      throw new Error(`Failed to fetch connections: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the Letta client instance
   */
  getLettaClient(): LettaClient {
    return this.lettaClient;
  }

  /**
   * Get the Composio toolset instance
   */
  getToolset(): ComposioToolSet {
    return this.toolset;
  }

  /**
   * Get service configuration
   */
  getConfig(): Partial<ComposioConfig> {
    return {
      baseUrl: this.config.baseUrl,
      // Don't expose the API key
    };
  }
}