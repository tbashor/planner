import { LettaClient, Letta } from '@letta-ai/letta-client';
import { Event, UserPreferences, AiSuggestion } from '../../src/types/index.js';
import { ComposioService } from './composioService.js';

export interface LettaConfig {
  baseUrl: string;
  apiKey: string;
  projectSlug: string;
  agentId?: string;
  templateName: string;
}

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

export class LettaServerService {
  private config: LettaConfig;
  private client: LettaClient;
  private composioService: ComposioService;
  private conversationHistory: LettaMessage[] = [];
  private userAgents: Map<string, string> = new Map(); // userEmail -> agentId
  private requestCounter = 0;
  private agentCreationFailed = false;
  private lastError: string | null = null;

  constructor() {
    // Load configuration from environment variables
    this.config = {
      baseUrl: process.env.VITE_LETTA_BASE_URL || 'https://api.letta.ai',
      apiKey: process.env.VITE_LETTA_API_KEY || '',
      projectSlug: process.env.VITE_LETTA_PROJECT_SLUG || 'default-project',
      agentId: process.env.VITE_LETTA_AGENT_ID,
      templateName: process.env.VITE_LETTA_TEMPLATE_NAME || 'memgpt_chat',
    };
    
    this.client = new LettaClient({
      baseUrl: this.config.baseUrl,
      token: this.config.apiKey,
    });

    // Initialize Composio service
    this.composioService = new ComposioService();
    
    console.log('🤖 Letta Server Service initialized:');
    console.log('- Base URL:', this.config.baseUrl);
    console.log('- Project Slug:', this.config.projectSlug);
    console.log('- Template:', this.config.templateName);
    console.log('- Agent ID:', this.config.agentId || 'Will be created per user');
    console.log('- API Key:', this.config.apiKey ? 'Configured ✅' : 'Not configured ❌');
    console.log('- Composio Service:', 'Initialized ✅');
    
    if (!this.config.apiKey) {
      console.warn('⚠️ WARNING: No API key configured. Letta functionality will be limited.');
    }
  }

  /**
   * Connect user's Google Account to Composio and create/update their agent
   */
  async connectUserGoogleAccount(userEmail: string, accessToken: string, refreshToken?: string, expiresIn?: number): Promise<string> {
    try {
      console.log('🔗 Connecting user Google Account:', userEmail);

      // Connect the user's Google Account to Composio
      const connectionId = await this.composioService.connectUserGoogleAccount(
        userEmail, 
        accessToken, 
        refreshToken, 
        expiresIn
      );

      // Get or create agent for this user with Google Calendar tools
      const agentId = await this.getOrCreateAgentForUser(userEmail, true);

      console.log('✅ User Google Account connected and agent updated:', {
        userEmail,
        connectionId,
        agentId
      });

      return agentId;
    } catch (error) {
      console.error('❌ Failed to connect user Google Account:', error);
      throw error;
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
   * Check if error is related to OpenAI function schema issues
   */
  private isSchemaError(error: any): boolean {
    const errorMessage = error?.message || '';
    return errorMessage.includes('Invalid schema') || 
           errorMessage.includes('invalid_function_parameters') ||
           errorMessage.includes('Bad request to OpenAI');
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
   * Get helpful error message for schema issues
   */
  private getSchemaErrorMessage(): string {
    return `🔧 OpenAI Function Schema Error

There's an issue with the agent's tool definitions. This is likely due to:

1. 📋 Using a template with invalid Google Calendar tool schemas
2. 🔧 OpenAI API validation rejecting malformed function parameters
3. 🛠️ Tool definitions missing required schema properties

To resolve this:
1. 🎯 Use a simpler template like 'memgpt_chat' instead of 'cal-planner-agent:latest'
2. 🔄 Create an agent without Google Calendar tools initially
3. 📞 Contact Letta support if the template should work

The AI assistant will work for basic chat without calendar tools.`;
  }

  /**
   * Generate agent name based on user email
   */
  private generateAgentName(userEmail: string): string {
    return `calendar-planner-${userEmail}`;
  }

  /**
   * Get or create an agent for a specific user
   */
  private async getOrCreateAgentForUser(userEmail: string, withGoogleCalendarTools: boolean = false): Promise<string> {
    // If we previously failed to create an agent due to limits, don't try again
    if (this.agentCreationFailed) {
      throw new Error(this.lastError || 'Agent creation previously failed due to account limits');
    }

    // Check if we already have an agent for this user
    const existingAgentId = this.userAgents.get(userEmail);
    if (existingAgentId) {
      console.log('🔄 Using cached agent for user:', userEmail, existingAgentId);
      return existingAgentId;
    }

    // If we have a specific agent ID in config, use it (fallback)
    if (this.config.agentId) {
      const requestId = this.logRequest('Agent Retrieval', { 
        agentId: this.config.agentId,
        userEmail 
      });
      
      try {
        const startTime = performance.now();
        const agent = await this.client.agents.retrieve(this.config.agentId);
        const endTime = performance.now();
        
        this.userAgents.set(userEmail, this.config.agentId);
        
        this.logResponse(requestId, 'Agent Retrieval', true, {
          agentId: agent.id,
          agentName: agent.name,
          userEmail,
          duration: Math.round(endTime - startTime) + 'ms'
        });
        
        console.log('✅ Using existing agent for user:', userEmail, this.config.agentId);
        return this.config.agentId;
      } catch (error) {
        this.logResponse(requestId, 'Agent Retrieval', false, {}, error);
        console.warn('⚠️ Specified agent not found, will try to create new one:', error);
      }
    }

    // Get Google Calendar tools for this user if requested
    let toolIds: string[] = [];
    if (withGoogleCalendarTools && this.composioService.hasUserConnection(userEmail)) {
      try {
        toolIds = await this.composioService.addGoogleCalendarToolsForUser(userEmail);
        console.log(`🛠️ Added ${toolIds.length} Google Calendar tools for user: ${userEmail}`);
      } catch (error) {
        console.warn('⚠️ Failed to add Google Calendar tools, creating agent without them:', error);
      }
    }

    // Create a new agent for this user
    const agentName = this.generateAgentName(userEmail);
    const requestId = this.logRequest('Agent Creation', { 
      templateName: this.config.templateName,
      projectSlug: this.config.projectSlug,
      agentName: agentName,
      userEmail: userEmail,
      toolCount: toolIds.length,
      toolIds: toolIds
    });
    
    try {
      console.log('🔄 Creating new agent for user:', userEmail);
      console.log('📧 Agent name will be:', agentName);
      console.log('🛠️ Tools to attach:', toolIds.length);
      
      const startTime = performance.now();
      
      // Create agent with user-specific Google Calendar tools
      const agentConfig: any = {
        name: agentName,
        description: `AI assistant for calendar management and scheduling with Google Calendar integration for ${userEmail}`,
        memoryBlocks: [
          {
            value: `I am a helpful AI assistant specialized in calendar management and scheduling for ${userEmail}. I can help create, update, and manage Google Calendar events using natural language. I understand user preferences and can suggest optimal times for activities.`,
            label: "persona",
          },
          {
            value: `I have access to ${userEmail}'s Google Calendar through Composio tools and can perform actions like creating events, listing calendars, finding free time slots, and managing calendar entries. I always confirm actions before making changes to the user's calendar.`,
            label: "capabilities",
          }
        ],
        model: "openai/gpt-4o",
        embedding: "openai/text-embedding-ada-002",
      };

      // Add tools if we have them
      if (toolIds.length > 0) {
        agentConfig.toolIds = toolIds;
        console.log('🔗 Attaching tools to agent:', toolIds);
      }

      const response = await this.client.agents.create(agentConfig);
      const endTime = performance.now();

      if (response && response.id) {
        this.userAgents.set(userEmail, response.id);
        
        this.logResponse(requestId, 'Agent Creation', true, {
          agentId: response.id,
          agentName: response.name,
          userEmail: userEmail,
          toolsAttached: toolIds.length,
          duration: Math.round(endTime - startTime) + 'ms'
        });
        
        console.log('✅ Created new agent for user:', userEmail, response.id);
        console.log('📧 Agent name:', agentName);
        console.log('🛠️ Tools attached:', toolIds.length);
        
        return response.id;
      } else {
        throw new Error('No agent ID returned from agent creation');
      }
    } catch (error) {
      this.logResponse(requestId, 'Agent Creation', false, {}, error);
      
      // Check if this is a schema error
      if (this.isSchemaError(error)) {
        this.agentCreationFailed = true;
        this.lastError = this.getSchemaErrorMessage();
        
        console.error('🔧 OpenAI function schema error detected!');
        console.error(this.lastError);
        
        throw new Error(this.lastError);
      }
      
      // Check if this is an agent limit error
      if (this.isAgentLimitError(error)) {
        this.agentCreationFailed = true;
        this.lastError = this.getAgentLimitErrorMessage();
        
        console.error('🚫 Agent creation limit reached!');
        console.error(this.lastError);
        
        throw new Error(this.lastError);
      }
      
      console.error('❌ Failed to create agent for user:', userEmail, error);
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
    const userEmail = context?.userEmail || 'anonymous';
    const requestId = this.logRequest('Send Message', {
      messageLength: message.length,
      hasContext: !!context,
      contextEvents: context?.events?.length || 0,
      hasPreferences: !!context?.preferences,
      userEmail: userEmail,
      hasGoogleCalendarAccess: this.composioService.hasUserConnection(userEmail)
    });

    try {
      // Ensure we have an agent for this user
      const hasGoogleCalendar = this.composioService.hasUserConnection(userEmail);
      const agentId = await this.getOrCreateAgentForUser(userEmail, hasGoogleCalendar);

      // Log the outgoing message
      console.log('💬 Sending message to Letta agent:', {
        agentId,
        messagePreview: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        contextProvided: !!context,
        userEmail: userEmail,
        hasGoogleCalendarAccess: hasGoogleCalendar
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

      console.log('📤 Sending message to user-specific Letta agent:', {
        agentId,
        userEmail,
        messageCount: messages.length,
        totalCharacters: messages.reduce((sum, msg) => sum + msg.content.length, 0),
        hasGoogleCalendarTools: hasGoogleCalendar
      });

      // Send message to Letta agent using the SDK
      const startTime = performance.now();
      const response = await this.client.agents.messages.create(agentId, {
        messages: messages,
        maxSteps: 10, // Increased to allow for tool usage
      });
      const endTime = performance.now();

      console.log('📥 Received response from user-specific Letta agent:', {
        responseTime: Math.round(endTime - startTime) + 'ms',
        messageCount: response.messages?.length || 0,
        responseId: response.id || 'No ID',
        userEmail
      });

      // Extract the assistant's message from the response with improved logic
      const responseMessage = this.extractAssistantMessage(response);

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
        conversationLength: this.conversationHistory.length,
        userEmail,
        toolsUsed: hasGoogleCalendar ? 'Google Calendar Available' : 'Basic Tools Only'
      });

      return lettaResponse;
    } catch (error) {
      this.logResponse(requestId, 'Send Message', false, {}, error);
      console.error('❌ Error communicating with Letta agent for user:', userEmail, error);
      
      // Return a more helpful fallback response based on the error type
      let fallbackMessage = "I'm having trouble connecting to my AI assistant right now.";
      
      if (this.isSchemaError(error)) {
        fallbackMessage = this.getSchemaErrorMessage();
      } else if (this.isAgentLimitError(error)) {
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
    userEmail?: string;
  }): string | null {
    if (!context) return null;

    const parts: string[] = [];
    
    if (context.currentDate) {
      parts.push(`Current date: ${context.currentDate.toISOString().split('T')[0]}`);
    }

    if (context.userEmail) {
      parts.push(`User email: ${context.userEmail}`);
      
      // Add Google Calendar connection status
      const hasGoogleCalendar = this.composioService.hasUserConnection(context.userEmail);
      parts.push(`Google Calendar access: ${hasGoogleCalendar ? 'Connected' : 'Not connected'}`);
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
        hasPreferences: !!context?.preferences,
        userEmail: context?.userEmail || 'Not provided',
        hasGoogleCalendarAccess: context?.userEmail ? this.composioService.hasUserConnection(context.userEmail) : false
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
    const user = userEmail || 'anonymous';
    const requestId = this.logRequest('Generate Suggestions', {
      eventsCount: events.length,
      focusAreas: preferences.focusAreas?.length || 0,
      currentDate: currentDate.toISOString().split('T')[0],
      userEmail: user,
      hasGoogleCalendarAccess: this.composioService.hasUserConnection(user)
    });

    try {
      const hasGoogleCalendar = this.composioService.hasUserConnection(user);
      const agentId = await this.getOrCreateAgentForUser(user, hasGoogleCalendar);

      const contextMessage = `Please generate 3-5 personalized calendar suggestions based on:
- Current events: ${events.map(e => `${e.date} ${e.startTime}: ${e.title}`).join(', ')}
- Focus areas: ${preferences.focusAreas?.join(', ') || 'general productivity'}
- Working hours: ${preferences.workingHours?.start || '9:00'} to ${preferences.workingHours?.end || '17:00'}
- Current date: ${currentDate.toISOString().split('T')[0]}
- User: ${user}
- Google Calendar access: ${hasGoogleCalendar ? 'Available' : 'Not available'}

${hasGoogleCalendar ? 'You can create actual Google Calendar events using the available tools.' : 'Suggest activities that can be added to the local calendar.'}
Return suggestions for productive activities, breaks, or schedule optimizations.`;

      console.log('📤 Generating suggestions with context:', {
        contextLength: contextMessage.length,
        agentId,
        userEmail: user,
        hasGoogleCalendarAccess: hasGoogleCalendar
      });

      const startTime = performance.now();
      await this.client.agents.messages.create(agentId, {
        messages: [
          {
            role: 'user',
            content: contextMessage,
          }
        ],
        maxSteps: 5,
      });
      const endTime = performance.now();

      this.logResponse(requestId, 'Generate Suggestions', true, {
        duration: Math.round(endTime - startTime) + 'ms',
        suggestionsGenerated: 0, // Will be updated when parsing is implemented
        userEmail: user,
        toolsUsed: hasGoogleCalendar ? 'Google Calendar Available' : 'Basic Tools Only'
      });

      // For now, return empty array - you could parse the response for structured suggestions
      return [];
    } catch (error) {
      this.logResponse(requestId, 'Generate Suggestions', false, {}, error);
      console.error('❌ Error generating suggestions from Letta agent for user:', user, error);
      return [];
    }
  }

  // Health check using SDK
  async healthCheck(userEmail?: string): Promise<boolean> {
    const user = userEmail || 'anonymous';
    const requestId = this.logRequest('Health Check', {
      hasApiKey: !!this.config.apiKey,
      baseUrl: this.config.baseUrl,
      agentCreationFailed: this.agentCreationFailed,
      userEmail: user,
      hasGoogleCalendarAccess: this.composioService.hasUserConnection(user),
      userAgentsCount: this.userAgents.size
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

      console.log('🏥 Performing Letta health check for user:', user);
      
      // Try to get or create an agent as a health check
      const startTime = performance.now();
      const hasGoogleCalendar = this.composioService.hasUserConnection(user);
      const agentId = await this.getOrCreateAgentForUser(user, hasGoogleCalendar);
      const endTime = performance.now();
      
      const isHealthy = !!agentId;
      
      this.logResponse(requestId, 'Health Check', isHealthy, {
        agentId,
        duration: Math.round(endTime - startTime) + 'ms',
        connectionStatus: isHealthy ? 'Connected' : 'Failed',
        userEmail: user,
        hasGoogleCalendarAccess: hasGoogleCalendar,
        userAgentsCount: this.userAgents.size
      });

      return isHealthy;
    } catch (error) {
      this.logResponse(requestId, 'Health Check', false, {}, error);
      console.error('❌ Letta agent health check failed for user:', user, error);
      return false;
    }
  }

  // Get current agent ID for a user
  getCurrentAgentId(userEmail?: string): string | null {
    const user = userEmail || 'anonymous';
    return this.userAgents.get(user) || null;
  }

  // Get last error message
  getLastError(): string | null {
    return this.lastError;
  }

  // Get service statistics
  getServiceStats() {
    const composioStats = this.composioService.getUserConnectionsSummary();
    
    return {
      requestCount: this.requestCounter,
      conversationLength: this.conversationHistory.length,
      userAgentsCount: this.userAgents.size,
      agentCreationFailed: this.agentCreationFailed,
      lastError: this.lastError,
      composioConnections: composioStats,
      configurationStatus: {
        hasApiKey: !!this.config.apiKey,
        baseUrl: this.config.baseUrl,
        projectSlug: this.config.projectSlug,
        templateName: this.config.templateName
      }
    };
  }

  // Get Composio service instance
  getComposioService(): ComposioService {
    return this.composioService;
  }
}