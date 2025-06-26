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
   * Generate agent name based on user email
   */
  private generateAgentName(userEmail?: string): string {
    if (userEmail) {
      return `planner-${userEmail}`;
    }
    
    // Fallback if no user email is available
    return `planner-${Date.now()}`;
  }

  /**
   * Get or create an agent for the current session
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

    // Create a new agent from template
    const agentName = this.generateAgentName(userEmail);
    const requestId = this.logRequest('Agent Creation', { 
      templateName: this.config.templateName,
      projectSlug: this.config.projectSlug,
      agentName: agentName,
      userEmail: userEmail || 'Not provided'
    });
    
    try {
      console.log('🔄 Creating new agent from template:', this.config.templateName);
      console.log('📧 Agent name will be:', agentName);
      
      const startTime = performance.now();
      const response = await this.client.agents.create({
        name: agentName,
        description: `AI assistant for calendar management and scheduling${userEmail ? ` for ${userEmail}` : ''}`,
        fromTemplate: this.config.templateName,
      });
      const endTime = performance.now();

      if (response && response.id) {
        this.currentAgentId = response.id;
        
        this.logResponse(requestId, 'Agent Creation', true, {
          agentId: response.id,
          agentName: response.name,
          userEmail: userEmail || 'Not provided',
          duration: Math.round(endTime - startTime) + 'ms'
        });
        
        console.log('✅ Created new agent:', this.currentAgentId);
        console.log('📧 Agent name:', agentName);
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
      userEmail: context?.userEmail || 'Not provided'
    });

    try {
      // Ensure we have an agent (pass user email for agent naming)
      const agentId = await this.getOrCreateAgent(context?.userEmail);

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

      // Extract the assistant's message from the response
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
        conversationLength: this.conversationHistory.length
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
   * Extract assistant message from Letta response
   */
  private extractAssistantMessage(response: any): string {
    if (!response.messages || !Array.isArray(response.messages)) {
      return 'I received your message, but I need more information to help you.';
    }

    // Filter for assistant messages
    const assistantMessages = response.messages.filter((msg: any) => {
      return msg.messageType === 'assistant_message';
    });

    if (assistantMessages.length === 0) {
      return 'I received your message, but I need more information to help you.';
    }

    // Get the last assistant message
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    
    if (!('content' in lastMessage) || !lastMessage.content) {
      return 'I received your message, but I need more information to help you.';
    }

    // Handle different content types
    let extractedContent = '';
    
    if (typeof lastMessage.content === 'string') {
      extractedContent = lastMessage.content;
    } else if (Array.isArray(lastMessage.content)) {
      extractedContent = lastMessage.content.map((c: any) => {
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
    } else {
      extractedContent = 'I received your message, but I need more information to help you.';
    }

    return extractedContent.trim() || 'I received your message, but I need more information to help you.';
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

    return parts.length > 0 ? parts.join('\n') : null;
  }

  private processLettaResponse(response: string): LettaResponse {
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
      userEmail: userEmail || 'Not provided'
    });

    try {
      const agentId = await this.getOrCreateAgent(userEmail);

      const contextMessage = `Please generate 3-5 personalized calendar suggestions based on:
- Current events: ${events.map(e => `${e.date} ${e.startTime}: ${e.title}`).join(', ')}
- Focus areas: ${preferences.focusAreas?.join(', ') || 'general productivity'}
- Working hours: ${preferences.workingHours?.start || '9:00'} to ${preferences.workingHours?.end || '17:00'}
- Current date: ${currentDate.toISOString().split('T')[0]}
${userEmail ? `- User: ${userEmail}` : ''}

Return suggestions for productive activities, breaks, or schedule optimizations.`;

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
        suggestionsGenerated: 0
      });

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
      
      // Try to get or create an agent as a health check
      const startTime = performance.now();
      const agentId = await this.getOrCreateAgent(userEmail);
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
}