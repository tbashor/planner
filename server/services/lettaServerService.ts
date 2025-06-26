import { LettaClient, Letta } from '@letta-ai/letta-client';
import { Event, UserPreferences, AiSuggestion } from '../../src/types/index.js';

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
  private conversationHistory: LettaMessage[] = [];
  private currentAgentId: string | null = null;
  private requestCounter = 0;
  private agentCreationFailed = false;
  private lastError: string | null = null;
  private googleCalendarToolIds: string[] = [];

  // Google Calendar tools that we want to add to the agent
  private readonly GOOGLE_CALENDAR_TOOLS = [
    'GOOGLECALENDAR_PATCH_EVENT',
    'GOOGLECALENDAR_CALENDARS_UPDATE', 
    'GOOGLECALENDAR_CREATE_EVENT',
    'GOOGLECALENDAR_DELETE_EVENT',
    'GOOGLECALENDAR_EVENTS_INSTANCES',
    'GOOGLECALENDAR_EVENTS_LIST',
    'GOOGLECALENDAR_EVENTS_MOVE',
    'GOOGLECALENDAR_FIND_EVENT',
    'GOOGLECALENDAR_FREE_BUSY_QUERY',
    'GOOGLECALENDAR_GET_CALENDAR',
    'GOOGLECALENDAR_GET_CURRENT_DATE_TIME',
    'GOOGLECALENDAR_LIST_CALENDARS',
    'GOOGLECALENDAR_PATCH_CALENDAR',
    'GOOGLECALENDAR_QUICK_ADD',
    'GOOGLECALENDAR_REMOVE_ATTENDEE',
    'GOOGLECALENDAR_UPDATE_EVENT'
  ];

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
    
    console.log('🤖 Letta Server Service initialized:');
    console.log('- Base URL:', this.config.baseUrl);
    console.log('- Project Slug:', this.config.projectSlug);
    console.log('- Template:', this.config.templateName);
    console.log('- Agent ID:', this.config.agentId || 'Will be created');
    console.log('- API Key:', this.config.apiKey ? 'Configured ✅' : 'Not configured ❌');
    console.log('- Google Calendar Tools:', this.GOOGLE_CALENDAR_TOOLS.length, 'tools to add');
    
    if (!this.config.apiKey) {
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
   * Add Composio Google Calendar tools to Letta
   */
  private async addComposioTools(): Promise<string[]> {
    const requestId = this.logRequest('Add Composio Tools', {
      toolCount: this.GOOGLE_CALENDAR_TOOLS.length,
      tools: this.GOOGLE_CALENDAR_TOOLS
    });

    try {
      console.log('🛠️ Adding Composio Google Calendar tools to Letta...');
      const toolIds: string[] = [];

      for (const toolName of this.GOOGLE_CALENDAR_TOOLS) {
        try {
          console.log(`📦 Adding tool: ${toolName}`);
          
          const tool = await this.client.tools.addComposioTool(toolName);
          
          if (tool && tool.id) {
            toolIds.push(tool.id);
            console.log(`✅ Added tool ${toolName} with ID: ${tool.id}`);
          } else {
            console.warn(`⚠️ Tool ${toolName} was added but no ID returned`);
          }
        } catch (toolError) {
          console.warn(`⚠️ Failed to add tool ${toolName}:`, toolError);
          // Continue with other tools even if one fails
        }
      }

      this.googleCalendarToolIds = toolIds;

      this.logResponse(requestId, 'Add Composio Tools', true, {
        toolsRequested: this.GOOGLE_CALENDAR_TOOLS.length,
        toolsAdded: toolIds.length,
        toolIds: toolIds
      });

      console.log(`🎉 Successfully added ${toolIds.length}/${this.GOOGLE_CALENDAR_TOOLS.length} Google Calendar tools`);
      return toolIds;

    } catch (error) {
      this.logResponse(requestId, 'Add Composio Tools', false, {}, error);
      console.error('❌ Failed to add Composio tools:', error);
      
      // Return empty array but don't fail - agent can still work without tools
      return [];
    }
  }

  /**
   * Generate agent name based on user email
   */
  private generateAgentName(userEmail?: string): string {
    if (userEmail) {
      return `calendar-planner-${userEmail}`;
    }
    
    // Fallback if no user email is available
    return `calendar-planner-${Date.now()}`;
  }

  /**
   * Get or create an agent for the current session with Composio tools
   */
  private async getOrCreateAgent(userEmail?: string): Promise<string> {
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

    // Add Composio tools first
    console.log('🛠️ Adding Composio Google Calendar tools...');
    const toolIds = await this.addComposioTools();
    
    if (toolIds.length > 0) {
      console.log(`🎯 Will create agent with ${toolIds.length} Google Calendar tools`);
    } else {
      console.log('⚠️ No tools added - creating agent without Google Calendar tools');
    }

    // Create a new agent from template with tools
    const agentName = this.generateAgentName(userEmail);
    const requestId = this.logRequest('Agent Creation', { 
      templateName: this.config.templateName,
      projectSlug: this.config.projectSlug,
      agentName: agentName,
      userEmail: userEmail || 'Not provided',
      toolCount: toolIds.length,
      toolIds: toolIds
    });
    
    try {
      console.log('🔄 Creating new agent with Composio tools...');
      console.log('📧 Agent name will be:', agentName);
      console.log('🛠️ Tools to attach:', toolIds.length);
      
      const startTime = performance.now();
      
      // Create agent with Composio tools
      const agentConfig: any = {
        name: agentName,
        description: `AI assistant for calendar management and scheduling with Google Calendar integration${userEmail ? ` for ${userEmail}` : ''}`,
        memoryBlocks: [
          {
            value: "I am a helpful AI assistant specialized in calendar management and scheduling. I can help you create, update, and manage Google Calendar events using natural language. I understand your preferences and can suggest optimal times for activities.",
            label: "persona",
          },
          {
            value: "I have access to Google Calendar tools and can perform actions like creating events, listing calendars, finding free time slots, and managing calendar entries. I always confirm actions before making changes.",
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

      // Don't use fromTemplate if we're adding custom tools
      const response = await this.client.agents.create(agentConfig);
      const endTime = performance.now();

      if (response && response.id) {
        this.currentAgentId = response.id;
        
        this.logResponse(requestId, 'Agent Creation', true, {
          agentId: response.id,
          agentName: response.name,
          userEmail: userEmail || 'Not provided',
          toolsAttached: toolIds.length,
          duration: Math.round(endTime - startTime) + 'ms'
        });
        
        console.log('✅ Created new agent with Google Calendar tools:', this.currentAgentId);
        console.log('📧 Agent name:', agentName);
        console.log('🛠️ Tools attached:', toolIds.length);
        console.log('💡 To avoid creating new agents in the future, add this to your .env file:');
        console.log(`   VITE_LETTA_AGENT_ID=${this.currentAgentId}`);
        
        return this.currentAgentId;
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
      userEmail?: string;
    }
  ): Promise<LettaResponse> {
    const requestId = this.logRequest('Send Message', {
      messageLength: message.length,
      hasContext: !!context,
      contextEvents: context?.events?.length || 0,
      hasPreferences: !!context?.preferences,
      userEmail: context?.userEmail || 'Not provided',
      toolsAvailable: this.googleCalendarToolIds.length
    });

    try {
      // Ensure we have an agent (pass user email for agent naming)
      const agentId = await this.getOrCreateAgent(context?.userEmail);

      // Log the outgoing message
      console.log('💬 Sending message to Letta agent:', {
        agentId,
        messagePreview: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        contextProvided: !!context,
        userEmail: context?.userEmail || 'Not provided',
        toolsAvailable: this.googleCalendarToolIds.length
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
        totalCharacters: messages.reduce((sum, msg) => sum + msg.content.length, 0),
        hasGoogleCalendarTools: this.googleCalendarToolIds.length > 0
      });

      // Send message to Letta agent using the SDK
      const startTime = performance.now();
      const response = await this.client.agents.messages.create(agentId, {
        messages: messages,
        maxSteps: 10, // Increased to allow for tool usage
      });
      const endTime = performance.now();

      console.log('📥 Received response from Letta:', {
        responseTime: Math.round(endTime - startTime) + 'ms',
        messageCount: response.messages?.length || 0,
        responseId: response.id || 'No ID'
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
        toolsUsed: this.googleCalendarToolIds.length > 0 ? 'Available' : 'None'
      });

      return lettaResponse;
    } catch (error) {
      this.logResponse(requestId, 'Send Message', false, {}, error);
      console.error('❌ Error communicating with Letta agent:', error);
      
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

    // Add tool availability info
    if (this.googleCalendarToolIds.length > 0) {
      parts.push(`Google Calendar tools available: ${this.googleCalendarToolIds.length} tools for calendar management`);
    }

    const contextMessage = parts.length > 0 ? parts.join('\n') : null;
    
    if (contextMessage) {
      console.log('📋 Built context message:', {
        parts: parts.length,
        totalLength: contextMessage.length,
        hasEvents: !!(context?.events?.length),
        hasPreferences: !!context?.preferences,
        userEmail: context?.userEmail || 'Not provided',
        toolsAvailable: this.googleCalendarToolIds.length
      });
    }

    return contextMessage;
  }

  private processLettaResponse(response: string): LettaResponse {
    console.log('🔄 Processing Letta response:', {
      responseLength: response.length,
      responsePreview: response.substring(0, 150) + (response.length > 150 ? '...' : ''),
      hasGoogleCalendarTools: this.googleCalendarToolIds.length > 0
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
    const requestId = this.logRequest('Generate Suggestions', {
      eventsCount: events.length,
      focusAreas: preferences.focusAreas?.length || 0,
      currentDate: currentDate.toISOString().split('T')[0],
      userEmail: userEmail || 'Not provided',
      toolsAvailable: this.googleCalendarToolIds.length
    });

    try {
      const agentId = await this.getOrCreateAgent(userEmail);

      const contextMessage = `Please generate 3-5 personalized calendar suggestions based on:
- Current events: ${events.map(e => `${e.date} ${e.startTime}: ${e.title}`).join(', ')}
- Focus areas: ${preferences.focusAreas?.join(', ') || 'general productivity'}
- Working hours: ${preferences.workingHours?.start || '9:00'} to ${preferences.workingHours?.end || '17:00'}
- Current date: ${currentDate.toISOString().split('T')[0]}
${userEmail ? `- User: ${userEmail}` : ''}

You have access to Google Calendar tools and can suggest creating actual calendar events. Return suggestions for productive activities, breaks, or schedule optimizations.`;

      console.log('📤 Generating suggestions with context:', {
        contextLength: contextMessage.length,
        agentId,
        userEmail: userEmail || 'Not provided',
        toolsAvailable: this.googleCalendarToolIds.length
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
        toolsUsed: this.googleCalendarToolIds.length > 0 ? 'Available' : 'None'
      });

      // For now, return empty array - you could parse the response for structured suggestions
      return [];
    } catch (error) {
      this.logResponse(requestId, 'Generate Suggestions', false, {}, error);
      console.error('❌ Error generating suggestions from Letta agent:', error);
      return [];
    }
  }

  // Health check using SDK
  async healthCheck(userEmail?: string): Promise<boolean> {
    const requestId = this.logRequest('Health Check', {
      hasApiKey: !!this.config.apiKey,
      baseUrl: this.config.baseUrl,
      agentCreationFailed: this.agentCreationFailed,
      userEmail: userEmail || 'Not provided',
      toolsConfigured: this.GOOGLE_CALENDAR_TOOLS.length
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
      const agentId = await this.getOrCreateAgent(userEmail);
      const endTime = performance.now();
      
      const isHealthy = !!agentId;
      
      this.logResponse(requestId, 'Health Check', isHealthy, {
        agentId,
        duration: Math.round(endTime - startTime) + 'ms',
        connectionStatus: isHealthy ? 'Connected' : 'Failed',
        userEmail: userEmail || 'Not provided',
        toolsAttached: this.googleCalendarToolIds.length
      });

      return isHealthy;
    } catch (error) {
      this.logResponse(requestId, 'Health Check', false, {}, error);
      console.error('❌ Letta agent health check failed:', error);
      return false;
    }
  }

  // Get current agent ID
  getCurrentAgentId(): string | null {
    return this.currentAgentId;
  }

  // Get last error message
  getLastError(): string | null {
    return this.lastError;
  }

  // Get Google Calendar tool information
  getGoogleCalendarToolInfo(): { toolNames: string[]; toolIds: string[]; count: number } {
    return {
      toolNames: this.GOOGLE_CALENDAR_TOOLS,
      toolIds: this.googleCalendarToolIds,
      count: this.googleCalendarToolIds.length
    };
  }
}