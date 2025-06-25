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
  private currentAgentId: string | null = null;
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
    console.log('- Agent ID:', config.agentId || 'Will be created');
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
    console.log('- Agent ID:', this.currentAgentId || 'Not set');
    
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
    this.currentAgentId = null;
    
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
   * Get or create an agent for the current session
   */
  private async getOrCreateAgent(): Promise<string> {
    // If we previously failed to create an agent due to limits, don't try again
    if (this.agentCreationFailed) {
      throw new Error(this.lastError || 'Agent creation previously failed due to account limits');
    }

    if (this.currentAgentId) {
      console.log('🔄 Using cached agent ID:', this.currentAgentId);
      return this.currentAgentId;
    }

    // If we have a specific agent ID, use it
    if (this.config.agentId) {
      const requestId = this.logRequest('Agent Retrieval', { agentId: this.config.agentId });
      
      try {
        const startTime = performance.now();
        const agent = await this.client.agents.retrieve(this.config.agentId);
        const endTime = performance.now();
        
        this.currentAgentId = this.config.agentId;
        
        this.logResponse(requestId, 'Agent Retrieval', true, {
          agentId: agent.id,
          agentName: agent.name,
          duration: Math.round(endTime - startTime) + 'ms'
        });
        
        console.log('✅ Using existing agent:', this.config.agentId);
        return this.currentAgentId;
      } catch (error) {
        this.logResponse(requestId, 'Agent Retrieval', false, {}, error);
        console.warn('⚠️ Specified agent not found, will try to create new one:', error);
      }
    }

    // Create a new agent from template
    const requestId = this.logRequest('Agent Creation', { 
      templateName: this.config.templateName,
      projectSlug: this.config.projectSlug 
    });
    
    try {
      console.log('🔄 Creating new agent from template:', this.config.templateName);
      
      const startTime = performance.now();
      const response = await this.client.agents.create({
        name: `Calendar Assistant - ${Date.now()}`,
        description: 'AI assistant for calendar management and scheduling',
      });
      const endTime = performance.now();

      if (response && response.id) {
        this.currentAgentId = response.id;
        
        this.logResponse(requestId, 'Agent Creation', true, {
          agentId: response.id,
          agentName: response.name,
          duration: Math.round(endTime - startTime) + 'ms'
        });
        
        console.log('✅ Created new agent:', this.currentAgentId);
        console.log('💡 To avoid creating new agents in the future, add this to your .env file:');
        console.log(`   VITE_LETTA_AGENT_ID=${this.currentAgentId}`);
        
        return this.currentAgentId;
      } else {
        throw new Error('No agent ID returned from agent creation');
      }
    } catch (error) {
      this.logResponse(requestId, 'Agent Creation', false, {}, error);
      
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
      
      console.error('❌ Failed to create agent:', error);
      throw new Error(`Failed to create agent: ${error}`);
    }
  }

  async sendMessage(
    message: string,
    context?: {
      events?: Event[];
      preferences?: UserPreferences;
      currentDate?: Date;
    }
  ): Promise<LettaResponse> {
    const requestId = this.logRequest('Send Message', {
      messageLength: message.length,
      hasContext: !!context,
      contextEvents: context?.events?.length || 0,
      hasPreferences: !!context?.preferences
    });

    try {
      // Ensure we have an agent
      const agentId = await this.getOrCreateAgent();

      // Log the outgoing message
      this.logConversation('send', message, {
        agentId,
        contextProvided: !!context
      });

      // Add user message to conversation history
      const userMessage: LettaMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      this.conversationHistory.push(userMessage);

      // Create the context message to include calendar context
      const contextInfo = this.buildContextMessage(context);
      
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
        
        console.log('📋 Context added to message:', {
          contextLength: contextInfo.length,
          contextPreview: contextInfo.substring(0, 100) + '...'
        });
      }

      console.log('📤 Sending message to Letta agent:', {
        agentId,
        messageCount: messages.length,
        totalCharacters: messages.reduce((sum, msg) => sum + msg.content.length, 0)
      });

      // Send message to Letta agent using the SDK
      const startTime = performance.now();
      const response = await this.client.agents.messages.create(agentId, {
        messages: messages,
        maxSteps: 5,
      });
      const endTime = performance.now();

      console.log('📥 Received response from Letta:', {
        responseTime: Math.round(endTime - startTime) + 'ms',
        messageCount: response.messages?.length || 0,
        responseId: response.id || 'No ID'
      });

      // Log the full response structure for debugging
      console.log('🔍 Full Letta response structure:', {
        hasMessages: !!response.messages,
        messageCount: response.messages?.length || 0,
        messages: response.messages?.map((msg, index) => ({
          index,
          role: 'role' in msg ? msg.role : 'unknown',
          hasContent: 'content' in msg && !!msg.content,
          contentType: 'content' in msg ? typeof msg.content : 'none',
          contentPreview: 'content' in msg && msg.content ? 
            (typeof msg.content === 'string' ? 
              msg.content.substring(0, 100) + '...' : 
              'Complex content') : 'No content'
        }))
      });

      // Extract the assistant's message from the response with improved logic
      const responseMessage = this.extractAssistantMessage(response);

      // Log the incoming message
      this.logConversation('receive', responseMessage, {
        extractedFromMessages: response.messages?.length || 0,
        finalMessageLength: responseMessage.length
      });

      // Process the response and try to extract structured data
      const lettaResponse = this.processLettaResponse(responseMessage);

      // Add assistant message to conversation history
      const assistantMessage: LettaMessage = {
        role: 'assistant',
        content: lettaResponse.message,
        timestamp: new Date().toISOString(),
      };
      this.conversationHistory.push(assistantMessage);

      this.logResponse(requestId, 'Send Message', true, {
        responseLength: lettaResponse.message.length,
        suggestionsCount: lettaResponse.suggestions?.length || 0,
        eventsCount: lettaResponse.events?.length || 0,
        conversationLength: this.conversationHistory.length
      });

      return lettaResponse;
    } catch (error) {
      this.logResponse(requestId, 'Send Message', false, {}, error);
      console.error('❌ Error communicating with Letta agent:', error);
      
      // Return a more helpful fallback response based on the error type
      let fallbackMessage = "I'm having trouble connecting to my AI assistant right now.";
      
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
    console.log('🔍 Extracting assistant message from response...',response);
    
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

  private buildContextMessage(context?: {
    events?: Event[];
    preferences?: UserPreferences;
    currentDate?: Date;
  }): string | null {
    if (!context) return null;

    const parts: string[] = [];
    
    if (context.currentDate) {
      parts.push(`Current date: ${context.currentDate.toISOString().split('T')[0]}`);
    }

    if (context.events && context.events.length > 0) {
      const todayEvents = context.events.filter(e => 
        e.date === context.currentDate?.toISOString().split('T')[0]
      );
      if (todayEvents.length > 0) {
        parts.push(`Today's events: ${todayEvents.map(e => `${e.startTime} - ${e.title}`).join(', ')}`);
      }
    }

    if (context.preferences) {
      if (context.preferences.focusAreas && context.preferences.focusAreas.length > 0) {
        parts.push(`User's focus areas: ${context.preferences.focusAreas.join(', ')}`);
      }
      if (context.preferences.workingHours) {
        parts.push(`Working hours: ${context.preferences.workingHours.start} to ${context.preferences.workingHours.end}`);
      }
    }

    const contextMessage = parts.length > 0 ? parts.join('\n') : null;
    
    if (contextMessage) {
      console.log('📋 Built context message:', {
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
    currentDate: Date
  ): Promise<AiSuggestion[]> {
    const requestId = this.logRequest('Generate Suggestions', {
      eventsCount: events.length,
      focusAreas: preferences.focusAreas?.length || 0,
      currentDate: currentDate.toISOString().split('T')[0]
    });

    try {
      const agentId = await this.getOrCreateAgent();

      const contextMessage = `Please generate 3-5 personalized calendar suggestions based on:
- Current events: ${events.map(e => `${e.date} ${e.startTime}: ${e.title}`).join(', ')}
- Focus areas: ${preferences.focusAreas?.join(', ') || 'general productivity'}
- Working hours: ${preferences.workingHours?.start || '9:00'} to ${preferences.workingHours?.end || '17:00'}
- Current date: ${currentDate.toISOString().split('T')[0]}

Return suggestions for productive activities, breaks, or schedule optimizations.`;

      console.log('📤 Generating suggestions with context:', {
        contextLength: contextMessage.length,
        agentId
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
        duration: Math.round(endTime - startTime) + 'ms',
        suggestionsGenerated: 0 // Will be updated when parsing is implemented
      });

      // For now, return empty array - you could parse the response for structured suggestions
      return [];
    } catch (error) {
      this.logResponse(requestId, 'Generate Suggestions', false, {}, error);
      console.error('❌ Error generating suggestions from Letta agent:', error);
      return [];
    }
  }

  async parseEventFromMessage(
    message: string,
    preferences: UserPreferences
  ): Promise<Event | null> {
    const requestId = this.logRequest('Parse Event', {
      messageLength: message.length,
      hasPreferences: !!preferences
    });

    try {
      const agentId = await this.getOrCreateAgent();

      const parsePrompt = `Parse this message for calendar event information: "${message}"
User preferences:
- Working hours: ${preferences.workingHours?.start || '9:00'} to ${preferences.workingHours?.end || '17:00'}
- Focus areas: ${preferences.focusAreas?.join(', ') || 'general'}

If this is a request to create an event, extract the title, date, start time, end time, and category.
Respond with event details if found, or "NO_EVENT" if this is not an event creation request.`;

      console.log('📤 Parsing event from message:', {
        originalMessage: message,
        promptLength: parsePrompt.length
      });

      const startTime = performance.now();
      await this.client.agents.messages.create(agentId, {
        messages: [
          {
            role: 'user',
            content: parsePrompt,
          }
        ],
        maxSteps: 2,
      });
      const endTime = performance.now();

      this.logResponse(requestId, 'Parse Event', true, {
        duration: Math.round(endTime - startTime) + 'ms',
        eventParsed: false // Will be updated when parsing is implemented
      });

      // For now, return null - you could parse the response for event data
      return null;
    } catch (error) {
      this.logResponse(requestId, 'Parse Event', false, {}, error);
      console.error('❌ Error parsing event from Letta agent:', error);
      return null;
    }
  }

  // Get conversation history
  getConversationHistory(): LettaMessage[] {
    console.log('📚 Retrieving conversation history:', {
      messageCount: this.conversationHistory.length,
      totalCharacters: this.conversationHistory.reduce((sum, msg) => sum + msg.content.length, 0)
    });
    return [...this.conversationHistory];
  }

  // Clear conversation history
  clearHistory(): void {
    const previousCount = this.conversationHistory.length;
    this.conversationHistory = [];
    console.log('🧹 Cleared conversation history:', {
      previousMessageCount: previousCount,
      currentMessageCount: 0
    });
  }

  // Health check using SDK
  async healthCheck(): Promise<boolean> {
    const requestId = this.logRequest('Health Check', {
      hasApiKey: !!this.config.apiKey,
      baseUrl: this.config.baseUrl,
      agentCreationFailed: this.agentCreationFailed
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
      
      // Try to get or create an agent as a health check
      const startTime = performance.now();
      const agentId = await this.getOrCreateAgent();
      const endTime = performance.now();
      
      const isHealthy = !!agentId;
      
      this.logResponse(requestId, 'Health Check', isHealthy, {
        agentId,
        duration: Math.round(endTime - startTime) + 'ms',
        connectionStatus: isHealthy ? 'Connected' : 'Failed'
      });

      return isHealthy;
    } catch (error) {
      this.logResponse(requestId, 'Health Check', false, {}, error);
      console.error('❌ Letta agent health check failed:', error);
      return false;
    }
  }

  // Get agent info
  async getAgentInfo() {
    const requestId = this.logRequest('Get Agent Info');

    try {
      const agentId = await this.getOrCreateAgent();
      
      const startTime = performance.now();
      const agentInfo = await this.client.agents.retrieve(agentId);
      const endTime = performance.now();
      
      this.logResponse(requestId, 'Get Agent Info', true, {
        agentId: agentInfo.id,
        agentName: agentInfo.name,
        duration: Math.round(endTime - startTime) + 'ms'
      });

      return agentInfo;
    } catch (error) {
      this.logResponse(requestId, 'Get Agent Info', false, {}, error);
      console.error('❌ Error getting agent info:', error);
      return null;
    }
  }

  // List available agents
  async listAgents() {
    const requestId = this.logRequest('List Agents');

    try {
      const startTime = performance.now();
      const agents = await this.client.agents.list();
      const endTime = performance.now();
      
      this.logResponse(requestId, 'List Agents', true, {
        agentCount: agents.length,
        duration: Math.round(endTime - startTime) + 'ms'
      });

      return agents;
    } catch (error) {
      this.logResponse(requestId, 'List Agents', false, {}, error);
      console.error('❌ Error listing agents:', error);
      return [];
    }
  }

  // Get current agent ID
  getCurrentAgentId(): string | null {
    console.log('🆔 Current agent ID:', this.currentAgentId || 'Not set');
    return this.currentAgentId;
  }

  // Get service statistics
  getServiceStats() {
    const stats = {
      requestCount: this.requestCounter,
      conversationLength: this.conversationHistory.length,
      currentAgentId: this.currentAgentId,
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
    console.log('🔄 Reset Letta service error state');
  }
}

// Create and export the service instance with default configuration
export const lettaService = new LettaService(defaultLettaConfig);

export default lettaService;