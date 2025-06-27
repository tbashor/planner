import { Event, UserPreferences, AiSuggestion } from '../types';
import { defaultLettaConfig, LettaConfig, debugEnvironmentVariables } from '../config/lettaConfig';
import { LettaClient, Letta } from '@letta-ai/letta-client';

export interface LettaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface LettaResponse {
  message: string;
  suggestions?: AiSuggestion[];
  events?: Event[];
  action?: string;
}

class LettaService {
  private config: LettaConfig;
  private client: LettaClient;
  private conversationHistory: LettaMessage[] = [];
  private userAgentMap: Map<string, string> = new Map(); // Map user email to agent ID
  private requestCounter = 0;
  private agentCreationFailed = false;
  private lastError: string | null = null;

  constructor(config: LettaConfig) {
    this.config = config;
    
    // Debug environment variables in development
    if (import.meta.env.DEV) {
      debugEnvironmentVariables();
    }
    
    this.client = new LettaClient({
      baseUrl: config.baseUrl,
      token: config.apiKey,
    });
    
    console.log('🤖 Letta Service initialized:');
    console.log('- Base URL:', config.baseUrl);
    console.log('- Project Slug:', config.projectSlug);
    console.log('- Template:', config.templateName);
    console.log('- Agent ID:', config.agentId || 'Will be created per user');
    console.log('- API Key:', config.apiKey ? 'Configured ✅' : 'Not configured ❌');
    
    if (!config.apiKey) {
      console.warn('⚠️ WARNING: No API key configured. Letta functionality will be limited.');
    }
  }

  /**
   * Log request details for debugging
   */
  private logRequest(operation: string, details: any = {}) {
    this.requestCounter++;
    const requestId = `REQ-${this.requestCounter}`;
    
    console.group(`🔄 [${requestId}] Letta ${operation}`);
    console.log('📤 Request Details:');
    console.log('- Timestamp:', new Date().toISOString());
    console.log('- Operation:', operation);
    console.log('- User Email:', details.userEmail || 'Not provided');
    console.log('- Agent ID:', details.agentId || 'Not set');
    
    if (Object.keys(details).length > 0) {
      console.log('- Additional Details:', details);
    }
    
    return requestId;
  }

  /**
   * Log response details for debugging
   */
  private logResponse(requestId: string, operation: string, success: boolean, data: any = {}, error?: any) {
    const status = success ? '✅ SUCCESS' : '❌ FAILED';
    const duration = performance.now();
    
    console.log(`📥 [${requestId}] Response: ${status}`);
    console.log('- Duration: ~' + Math.round(duration) + 'ms');
    
    if (success) {
      console.log('- Response Data:', data);
    } else {
      console.error('- Error:', error);
      console.error('- Error Type:', error?.constructor?.name || 'Unknown');
      console.error('- Error Message:', error?.message || 'No message');
    }
    
    console.groupEnd();
  }

  /**
   * Log conversation flow
   */
  private logConversation(type: 'send' | 'receive', message: string, context?: any) {
    const emoji = type === 'send' ? '💬' : '🤖';
    const direction = type === 'send' ? 'TO' : 'FROM';
    
    console.group(`${emoji} Message ${direction} Letta`);
    console.log('- Content:', message.substring(0, 200) + (message.length > 200 ? '...' : ''));
    console.log('- Full Length:', message.length, 'characters');
    console.log('- Timestamp:', new Date().toISOString());
    console.log('- User Email:', context?.userEmail || 'Not provided');
    
    if (context) {
      console.log('- Context:', context);
    }
    
    console.groupEnd();
  }

  updateConfig(config: Partial<LettaConfig>) {
    console.log('🔧 Updating Letta configuration:', config);
    
    this.config = { ...this.config, ...config };
    // Reinitialize client with new config
    this.client = new LettaClient({
      baseUrl: this.config.baseUrl,
      token: this.config.apiKey,
    });
    
    // Reset error states when config is updated
    this.agentCreationFailed = false;
    this.lastError = null;
    this.userAgentMap.clear();
    
    console.log('✅ Letta configuration updated successfully');
  }

  /**
   * Check if error is related to agent creation limits
   */
  private isAgentLimitError(error: any): boolean {
    const errorMessage = error?.message || '';
    const statusCode = error?.status || error?.statusCode;
    
    return statusCode === 402 || 
           errorMessage.includes('limit') || 
           errorMessage.includes('upgrade your plan') ||
           errorMessage.includes('reached your limit');
  }

  /**
   * Get helpful error message for agent limit issues
   */
  private getAgentLimitErrorMessage(): string {
    return `🚫 Agent Creation Limit Reached

Your Letta Cloud account has reached its agent creation limit. To resolve this:

1. 🌐 Go to your Letta Cloud dashboard: https://app.letta.ai
2. 📋 Find an existing agent ID from your agent list
3. ⚙️ Add it to your .env file: VITE_LETTA_AGENT_ID=your_agent_id_here
4. 🔄 Restart your development server

Alternatively, you can:
- 🗑️ Delete unused agents to free up space
- 💳 Upgrade your Letta Cloud plan for more agents

The AI assistant will work normally once you configure an existing agent ID.`;
  }

  /**
   * Try to list existing agents to help user find one to reuse
   */
  private async tryListExistingAgents(): Promise<string[]> {
    try {
      console.log('🔍 Attempting to list existing agents...');
      const agents = await this.client.agents.list();
      const agentIds = agents.map(agent => agent.id);
      
      if (agentIds.length > 0) {
        console.log('✅ Found existing agents:', agentIds);
        console.log('💡 You can use any of these agent IDs in your .env file:');
        agentIds.forEach(id => console.log(`   VITE_LETTA_AGENT_ID=${id}`));
      }
      
      return agentIds;
    } catch (error) {
      console.warn('⚠️ Could not list existing agents:', error);
      return [];
    }
  }

  /**
   * Generate agent name based on user email
   */
  private generateAgentName(userEmail: string): string {
    // Create a unique agent name for this user
    const sanitizedEmail = userEmail.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    return `calendar-agent-${sanitizedEmail}`;
  }

  /**
   * Get user-specific agent ID from cache or create new one
   */
  private async getUserSpecificAgent(userEmail: string): Promise<string> {
    if (!userEmail) {
      throw new Error('User email is required for agent connection');
    }

    // Check if we already have an agent for this user
    const cachedAgentId = this.userAgentMap.get(userEmail);
    if (cachedAgentId) {
      console.log(`🔄 Using cached agent for ${userEmail}:`, cachedAgentId);
      return cachedAgentId;
    }

    // If we previously failed to create an agent due to limits, don't try again
    if (this.agentCreationFailed) {
      throw new Error(this.lastError || 'Agent creation previously failed due to account limits');
    }

    // If we have a specific agent ID in config, use it for all users (fallback)
    if (this.config.agentId) {
      const requestId = this.logRequest('Agent Retrieval', { 
        agentId: this.config.agentId,
        userEmail 
      });
      
      try {
        const startTime = performance.now();
        const agent = await this.client.agents.retrieve(this.config.agentId);
        const endTime = performance.now();
        
        // Cache this agent for the user
        this.userAgentMap.set(userEmail, this.config.agentId);
        
        this.logResponse(requestId, 'Agent Retrieval', true, {
          agentId: agent.id,
          agentName: agent.name,
          userEmail,
          duration: Math.round(endTime - startTime) + 'ms'
        });
        
        console.log(`✅ Using configured agent for ${userEmail}:`, this.config.agentId);
        return this.config.agentId;
      } catch (error) {
        this.logResponse(requestId, 'Agent Retrieval', false, {}, error);
        console.warn(`⚠️ Configured agent not found for ${userEmail}, will try to create new one:`, error);
      }
    }

    // Create a new user-specific agent
    const agentName = this.generateAgentName(userEmail);
    const requestId = this.logRequest('User-Specific Agent Creation', { 
      templateName: this.config.templateName,
      projectSlug: this.config.projectSlug,
      agentName: agentName,
      userEmail: userEmail
    });
    
    try {
      console.log(`🔄 Creating new agent for user ${userEmail}:`, agentName);
      
      const startTime = performance.now();
      const response = await this.client.agents.create({
        name: agentName,
        description: `AI calendar assistant for ${userEmail} - manages personal calendar, scheduling, and productivity optimization`,
        fromTemplate: this.config.templateName,
      });
      const endTime = performance.now();

      if (response && response.id) {
        // Cache the agent for this user
        this.userAgentMap.set(userEmail, response.id);
        
        this.logResponse(requestId, 'User-Specific Agent Creation', true, {
          agentId: response.id,
          agentName: response.name,
          userEmail: userEmail,
          duration: Math.round(endTime - startTime) + 'ms'
        });
        
        console.log(`✅ Created new agent for ${userEmail}:`, response.id);
        console.log('📧 Agent name:', agentName);
        console.log('🔗 This agent is now linked to the user\'s Google Calendar account');
        
        return response.id;
      } else {
        throw new Error('No agent ID returned from agent creation');
      }
    } catch (error) {
      this.logResponse(requestId, 'User-Specific Agent Creation', false, {}, error);
      
      // Check if this is an agent limit error
      if (this.isAgentLimitError(error)) {
        this.agentCreationFailed = true;
        this.lastError = this.getAgentLimitErrorMessage();
        
        console.error('🚫 Agent creation limit reached!');
        console.error(this.lastError);
        
        // Try to list existing agents to help the user
        await this.tryListExistingAgents();
        
        throw new Error(this.lastError);
      }
      
      console.error(`❌ Failed to create agent for ${userEmail}:`, error);
      throw new Error(`Failed to create agent for ${userEmail}: ${error}`);
    }
  }

  async sendMessage(
    message: string,
    context?: {
      events?: Event[];
      preferences?: UserPreferences;
      currentDate?: Date;
      userEmail?: string;
    }
  ): Promise<LettaResponse> {
    const userEmail = context?.userEmail;
    if (!userEmail) {
      throw new Error('User email is required for personalized agent interaction');
    }

    const requestId = this.logRequest('Send Message', {
      messageLength: message.length,
      hasContext: !!context,
      contextEvents: context?.events?.length || 0,
      hasPreferences: !!context?.preferences,
      userEmail: userEmail
    });

    try {
      // Get user-specific agent
      const agentId = await this.getUserSpecificAgent(userEmail);

      // Log the outgoing message
      this.logConversation('send', message, {
        agentId,
        contextProvided: !!context,
        userEmail: userEmail
      });

      // Add user message to conversation history (user-specific)
      const userMessage: LettaMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };

      // Create enhanced context message that includes user identity
      const contextInfo = this.buildUserSpecificContextMessage(context, userEmail);
      
      // Prepare messages for Letta API
      const messages: Letta.MessageCreate[] = [
        {
          role: 'user',
          content: message,
        }
      ];

      // Add context as system message if available
      if (contextInfo) {
        messages.unshift({
          role: 'system',
          content: contextInfo,
        });
        
        console.log('📋 User-specific context added to message:', {
          userEmail,
          contextLength: contextInfo.length,
          contextPreview: contextInfo.substring(0, 100) + '...'
        });
      }

      console.log('📤 Sending message to user-specific Letta agent:', {
        agentId,
        userEmail,
        messageCount: messages.length,
        totalCharacters: messages.reduce((sum, msg) => sum + msg.content.length, 0)
      });

      // Send message to user-specific Letta agent
      const startTime = performance.now();
      const response = await this.client.agents.messages.create(agentId, {
        messages: messages,
        maxSteps: 5,
      });
      const endTime = performance.now();

      console.log('📥 Received response from user-specific Letta agent:', {
        userEmail,
        responseTime: Math.round(endTime - startTime) + 'ms',
        messageCount: response.messages?.length || 0,
        responseId: response.id || 'No ID'
      });

      // Extract the assistant's message from the response
      const responseMessage = this.extractAssistantMessage(response);

      // Log the incoming message
      this.logConversation('receive', responseMessage, {
        extractedFromMessages: response.messages?.length || 0,
        finalMessageLength: responseMessage.length,
        userEmail
      });

      // Process the response and try to extract structured data
      const lettaResponse = this.processLettaResponse(responseMessage);

      this.logResponse(requestId, 'Send Message', true, {
        userEmail,
        responseLength: lettaResponse.message.length,
        suggestionsCount: lettaResponse.suggestions?.length || 0,
        eventsCount: lettaResponse.events?.length || 0,
        agentId
      });

      return lettaResponse;
    } catch (error) {
      this.logResponse(requestId, 'Send Message', false, { userEmail }, error);
      console.error(`❌ Error communicating with Letta agent for ${userEmail}:`, error);
      
      // Return a more helpful fallback response based on the error type
      let fallbackMessage = `I'm having trouble connecting to your personal AI assistant right now.`;
      
      if (this.isAgentLimitError(error)) {
        fallbackMessage = this.getAgentLimitErrorMessage();
      } else if (!this.config.apiKey) {
        fallbackMessage = "Please configure your Letta API key in the .env file to enable AI assistance.";
      } else {
        fallbackMessage += " Please check your Letta configuration and try again.";
      }
      
      return {
        message: fallbackMessage,
        suggestions: [],
        events: [],
        action: undefined,
      };
    }
  }

  /**
   * Extract assistant message from Letta response with improved logic
   */
  private extractAssistantMessage(response: any): string {
    console.log('🔍 Extracting assistant message from response...');
    
    if (!response.messages || !Array.isArray(response.messages)) {
      console.warn('⚠️ No messages array in response');
      return 'I received your message, but I need more information to help you.';
    }

    // Filter for assistant messages
    const assistantMessages = response.messages.filter((msg: any) => {
      const isAssistant = msg.messageType === 'assistant_message';
      console.log('📝 Message analysis:', {
        hasRole: 'role' in msg,
        role: 'role' in msg ? msg.role : 'none',
        isAssistant,
        hasContent: 'content' in msg && !!msg.content,
        contentType: 'content' in msg ? typeof msg.content : 'none'
      });
      return isAssistant;
    });

    console.log('🎯 Found assistant messages:', assistantMessages.length);

    if (assistantMessages.length === 0) {
      console.warn('⚠️ No assistant messages found in response');
      return 'I received your message, but I need more information to help you.';
    }

    // Get the last assistant message
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    
    if (!('content' in lastMessage) || !lastMessage.content) {
      console.warn('⚠️ Last assistant message has no content');
      return 'I received your message, but I need more information to help you.';
    }

    // Handle different content types
    let extractedContent = '';
    
    if (typeof lastMessage.content === 'string') {
      extractedContent = lastMessage.content;
      console.log('✅ Extracted string content:', extractedContent.substring(0, 100) + '...');
    } else if (Array.isArray(lastMessage.content)) {
      console.log('🔄 Processing array content with', lastMessage.content.length, 'items');
      
      extractedContent = lastMessage.content.map((c: any, index: number) => {
        console.log(`📄 Content item ${index}:`, {
          type: typeof c,
          isString: typeof c === 'string',
          hasText: typeof c === 'object' && c && 'text' in c,
          hasContent: typeof c === 'object' && c && 'content' in c,
          preview: typeof c === 'string' ? c.substring(0, 50) + '...' : 'Object'
        });
        
        if (typeof c === 'string') {
          return c;
        }
        if (typeof c === 'object' && c && 'text' in c) {
          return (c as { text: string }).text;
        }
        if (typeof c === 'object' && c && 'content' in c) {
          return (c as { content: string }).content;
        }
        return '';
      }).filter(Boolean).join(' ');
      
      console.log('✅ Extracted array content:', extractedContent.substring(0, 100) + '...');
    } else {
      console.warn('⚠️ Unknown content type:', typeof lastMessage.content);
      extractedContent = 'I received your message, but I need more information to help you.';
    }

    // Final validation
    if (!extractedContent || extractedContent.trim().length === 0) {
      console.warn('⚠️ Extracted content is empty');
      return 'I received your message, but I need more information to help you.';
    }

    console.log('🎉 Successfully extracted message:', {
      length: extractedContent.length,
      preview: extractedContent.substring(0, 150) + (extractedContent.length > 150 ? '...' : '')
    });

    return extractedContent.trim();
  }

  private buildUserSpecificContextMessage(context?: {
    events?: Event[];
    preferences?: UserPreferences;
    currentDate?: Date;
    userEmail?: string;
  }, userEmail?: string): string | null {
    if (!context && !userEmail) return null;

    const parts: string[] = [];
    
    // Add user identity context
    if (userEmail) {
      parts.push(`User: ${userEmail}`);
      parts.push(`This is ${userEmail}'s personal calendar assistant`);
      parts.push(`All calendar operations should be performed for ${userEmail}'s Google Calendar account`);
    }
    
    if (context?.currentDate) {
      parts.push(`Current date: ${context.currentDate.toISOString().split('T')[0]}`);
    }

    if (context?.events && context.events.length > 0) {
      const todayEvents = context.events.filter(e => 
        e.date === context.currentDate?.toISOString().split('T')[0]
      );
      if (todayEvents.length > 0) {
        parts.push(`${userEmail}'s today's events: ${todayEvents.map(e => `${e.startTime} - ${e.title}`).join(', ')}`);
      }
      
      // Include Google Calendar events specifically
      const googleEvents = context.events.filter(e => e.id.startsWith('google_'));
      if (googleEvents.length > 0) {
        parts.push(`${userEmail} has ${googleEvents.length} Google Calendar events synced`);
      }
    }

    if (context?.preferences) {
      if (context.preferences.focusAreas && context.preferences.focusAreas.length > 0) {
        parts.push(`${userEmail}'s focus areas: ${context.preferences.focusAreas.join(', ')}`);
      }
      if (context.preferences.workingHours) {
        parts.push(`${userEmail}'s working hours: ${context.preferences.workingHours.start} to ${context.preferences.workingHours.end}`);
      }
    }

    const contextMessage = parts.length > 0 ? parts.join('\n') : null;
    
    if (contextMessage) {
      console.log('📋 Built user-specific context message:', {
        userEmail,
        parts: parts.length,
        totalLength: contextMessage.length,
        hasEvents: !!(context?.events?.length),
        hasPreferences: !!context?.preferences
      });
    }

    return contextMessage;
  }

  private processLettaResponse(response: string): LettaResponse {
    console.log('🔄 Processing Letta response:', {
      responseLength: response.length,
      responsePreview: response.substring(0, 150) + (response.length > 150 ? '...' : '')
    });

    // Return the actual response from the agent
    return {
      message: response,
      suggestions: [],
      events: [],
      action: undefined,
    };
  }

  async generateSuggestions(
    events: Event[],
    preferences: UserPreferences,
    currentDate: Date,
    userEmail?: string
  ): Promise<AiSuggestion[]> {
    if (!userEmail) {
      console.warn('⚠️ No user email provided for suggestions generation');
      return [];
    }

    const requestId = this.logRequest('Generate Suggestions', {
      eventsCount: events.length,
      focusAreas: preferences.focusAreas?.length || 0,
      currentDate: currentDate.toISOString().split('T')[0],
      userEmail: userEmail
    });

    try {
      const agentId = await this.getUserSpecificAgent(userEmail);

      const contextMessage = `Please generate 3-5 personalized calendar suggestions for ${userEmail} based on:
- Current events: ${events.map(e => `${e.date} ${e.startTime}: ${e.title}`).join(', ')}
- Focus areas: ${preferences.focusAreas?.join(', ') || 'general productivity'}
- Working hours: ${preferences.workingHours?.start || '9:00'} to ${preferences.workingHours?.end || '17:00'}
- Current date: ${currentDate.toISOString().split('T')[0]}
- User: ${userEmail}

Return suggestions for productive activities, breaks, or schedule optimizations specifically for ${userEmail}'s calendar.`;

      console.log('📤 Generating user-specific suggestions:', {
        contextLength: contextMessage.length,
        agentId,
        userEmail: userEmail
      });

      const startTime = performance.now();
      await this.client.agents.messages.create(agentId, {
        messages: [
          {
            role: 'user',
            content: contextMessage,
          }
        ],
        maxSteps: 3,
      });
      const endTime = performance.now();

      this.logResponse(requestId, 'Generate Suggestions', true, {
        userEmail,
        duration: Math.round(endTime - startTime) + 'ms',
        suggestionsGenerated: 0 // Will be updated when parsing is implemented
      });

      // For now, return empty array - you could parse the response for structured suggestions
      return [];
    } catch (error) {
      this.logResponse(requestId, 'Generate Suggestions', false, { userEmail }, error);
      console.error(`❌ Error generating suggestions from Letta agent for ${userEmail}:`, error);
      return [];
    }
  }

  // Health check using SDK with user context
  async healthCheck(userEmail?: string): Promise<boolean> {
    const requestId = this.logRequest('Health Check', {
      hasApiKey: !!this.config.apiKey,
      baseUrl: this.config.baseUrl,
      agentCreationFailed: this.agentCreationFailed,
      userEmail: userEmail || 'Not provided'
    });

    try {
      if (!this.config.apiKey) {
        console.warn('⚠️ No API key configured for Letta');
        this.logResponse(requestId, 'Health Check', false, {}, new Error('No API key configured'));
        return false;
      }

      // If agent creation previously failed due to limits, don't try again
      if (this.agentCreationFailed) {
        console.warn('⚠️ Agent creation previously failed due to account limits');
        this.logResponse(requestId, 'Health Check', false, {}, new Error(this.lastError || 'Agent creation failed'));
        return false;
      }

      console.log('🏥 Performing Letta health check...');
      
      // If we have a user email, try to get their specific agent
      let agentId: string;
      const startTime = performance.now();
      
      if (userEmail) {
        agentId = await this.getUserSpecificAgent(userEmail);
      } else {
        // Fallback to generic agent creation
        agentId = await this.getUserSpecificAgent('health-check@example.com');
      }
      
      const endTime = performance.now();
      const isHealthy = !!agentId;
      
      this.logResponse(requestId, 'Health Check', isHealthy, {
        agentId,
        duration: Math.round(endTime - startTime) + 'ms',
        connectionStatus: isHealthy ? 'Connected' : 'Failed',
        userEmail: userEmail || 'Not provided'
      });

      return isHealthy;
    } catch (error) {
      this.logResponse(requestId, 'Health Check', false, { userEmail }, error);
      console.error('❌ Letta agent health check failed:', error);
      return false;
    }
  }

  // Get agent info for specific user
  async getAgentInfo(userEmail?: string) {
    if (!userEmail) {
      console.warn('⚠️ No user email provided for agent info');
      return null;
    }

    const requestId = this.logRequest('Get Agent Info', {
      userEmail: userEmail
    });

    try {
      const agentId = await this.getUserSpecificAgent(userEmail);
      
      const startTime = performance.now();
      const agentInfo = await this.client.agents.retrieve(agentId);
      const endTime = performance.now();
      
      this.logResponse(requestId, 'Get Agent Info', true, {
        agentId: agentInfo.id,
        agentName: agentInfo.name,
        userEmail,
        duration: Math.round(endTime - startTime) + 'ms'
      });

      return agentInfo;
    } catch (error) {
      this.logResponse(requestId, 'Get Agent Info', false, { userEmail }, error);
      console.error(`❌ Error getting agent info for ${userEmail}:`, error);
      return null;
    }
  }

  // Get current agent ID for specific user
  getCurrentAgentId(userEmail?: string): string | null {
    if (!userEmail) {
      console.log('🆔 No user email provided for agent ID lookup');
      return null;
    }
    
    const agentId = this.userAgentMap.get(userEmail) || null;
    console.log(`🆔 Current agent ID for ${userEmail}:`, agentId || 'Not set');
    return agentId;
  }

  // Get service statistics
  getServiceStats() {
    const stats = {
      requestCount: this.requestCounter,
      userAgentCount: this.userAgentMap.size,
      userAgents: Array.from(this.userAgentMap.entries()).map(([email, agentId]) => ({
        userEmail: email,
        agentId: agentId
      })),
      agentCreationFailed: this.agentCreationFailed,
      lastError: this.lastError,
      configurationStatus: {
        hasApiKey: !!this.config.apiKey,
        baseUrl: this.config.baseUrl,
        projectSlug: this.config.projectSlug,
        templateName: this.config.templateName
      }
    };

    console.log('📊 Letta Service Statistics:', stats);
    return stats;
  }

  // Get last error message (useful for UI display)
  getLastError(): string | null {
    return this.lastError;
  }

  // Check if service is in error state
  isInErrorState(): boolean {
    return this.agentCreationFailed;
  }

  // Reset error state (useful when user updates configuration)
  resetErrorState(): void {
    this.agentCreationFailed = false;
    this.lastError = null;
    this.userAgentMap.clear();
    console.log('🔄 Reset Letta service error state');
  }

  // Clear user-specific agent (useful for logout)
  clearUserAgent(userEmail: string): void {
    this.userAgentMap.delete(userEmail);
    console.log(`🧹 Cleared agent for user: ${userEmail}`);
  }

  // Get all user agents (for debugging)
  getAllUserAgents(): Map<string, string> {
    return new Map(this.userAgentMap);
  }
}

// Create and export the service instance with default configuration
export const lettaService = new LettaService(defaultLettaConfig);

export default lettaService;