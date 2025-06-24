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
    console.log('- API Key:', config.apiKey ? 'Configured' : 'Not configured');
  }

  updateConfig(config: Partial<LettaConfig>) {
    this.config = { ...this.config, ...config };
    // Reinitialize client with new config
    this.client = new LettaClient({
      baseUrl: this.config.baseUrl,
      token: this.config.apiKey,
    });
  }

  /**
   * Get or create an agent for the current session
   */
  private async getOrCreateAgent(): Promise<string> {
    if (this.currentAgentId) {
      return this.currentAgentId;
    }

    // If we have a specific agent ID, use it
    if (this.config.agentId) {
      try {
        await this.client.agents.retrieve(this.config.agentId);
        this.currentAgentId = this.config.agentId;
        console.log('✅ Using existing agent:', this.config.agentId);
        return this.currentAgentId;
      } catch (error) {
        console.warn('⚠️ Specified agent not found, creating new one:', error);
      }
    }

    // Create a new agent from template
    try {
      console.log('🔄 Creating new agent from template:', this.config.templateName);
      const response = await this.client.templates.createAgents(
        this.config.projectSlug,
        this.config.templateName
      );

      if (response.agents && response.agents.length > 0) {
        this.currentAgentId = response.agents[0].id;
        console.log('✅ Created new agent:', this.currentAgentId);
        return this.currentAgentId;
      } else {
        throw new Error('No agents returned from template creation');
      }
    } catch (error) {
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
    try {
      // Ensure we have an agent
      const agentId = await this.getOrCreateAgent();

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

      // Send message to Letta agent using the SDK
      const response = await this.client.agents.messages.create(agentId, {
        messages: messages,
        maxSteps: 5,
      });

      // Extract the assistant's message from the response
      const assistantMessages = response.messages.filter((msg) => {
        if ('role' in msg && msg.role === 'assistant') {
          return true;
        }
        return false;
      });
      
      let responseMessage = 'I received your message, but I need more information to help you.';
      if (assistantMessages.length > 0) {
        const lastMessage = assistantMessages[assistantMessages.length - 1];
        if ('content' in lastMessage && lastMessage.content) {
          responseMessage = typeof lastMessage.content === 'string' 
            ? lastMessage.content 
            : Array.isArray(lastMessage.content) 
              ? lastMessage.content.map((c) => {
                  if (typeof c === 'string') return c;
                  if (typeof c === 'object' && c && 'text' in c) return (c as { text: string }).text;
                  if (typeof c === 'object' && c && 'content' in c) return (c as { content: string }).content;
                  return '';
                }).join(' ')
              : responseMessage;
        }
      }

      // Process the response and try to extract structured data
      const lettaResponse = this.processLettaResponse(responseMessage);

      // Add assistant message to conversation history
      const assistantMessage: LettaMessage = {
        role: 'assistant',
        content: lettaResponse.message,
        timestamp: new Date().toISOString(),
      };
      this.conversationHistory.push(assistantMessage);

      return lettaResponse;
    } catch (error) {
      console.error('Error communicating with Letta agent:', error);
      
      // Return a fallback response
      return {
        message: "I'm having trouble connecting to my AI assistant right now. Please check your Letta configuration and try again.",
        suggestions: [],
        events: [],
        action: undefined,
      };
    }
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

    return parts.length > 0 ? parts.join('\n') : null;
  }

  private processLettaResponse(response: string): LettaResponse {
    // For now, return the response as-is
    // In the future, you could parse the response for structured data like events or suggestions
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
    try {
      const agentId = await this.getOrCreateAgent();

      const contextMessage = `Please generate 3-5 personalized calendar suggestions based on:
- Current events: ${events.map(e => `${e.date} ${e.startTime}: ${e.title}`).join(', ')}
- Focus areas: ${preferences.focusAreas?.join(', ') || 'general productivity'}
- Working hours: ${preferences.workingHours?.start || '9:00'} to ${preferences.workingHours?.end || '17:00'}
- Current date: ${currentDate.toISOString().split('T')[0]}

Return suggestions for productive activities, breaks, or schedule optimizations.`;

      await this.client.agents.messages.create(agentId, {
        messages: [
          {
            role: 'user',
            content: contextMessage,
          }
        ],
        maxSteps: 3,
      });

      // For now, return empty array - you could parse the response for structured suggestions
      return [];
    } catch (error) {
      console.error('Error generating suggestions from Letta agent:', error);
      return [];
    }
  }

  async parseEventFromMessage(
    message: string,
    preferences: UserPreferences
  ): Promise<Event | null> {
    try {
      const agentId = await this.getOrCreateAgent();

      const parsePrompt = `Parse this message for calendar event information: "${message}"
User preferences:
- Working hours: ${preferences.workingHours?.start || '9:00'} to ${preferences.workingHours?.end || '17:00'}
- Focus areas: ${preferences.focusAreas?.join(', ') || 'general'}

If this is a request to create an event, extract the title, date, start time, end time, and category.
Respond with event details if found, or "NO_EVENT" if this is not an event creation request.`;

      await this.client.agents.messages.create(agentId, {
        messages: [
          {
            role: 'user',
            content: parsePrompt,
          }
        ],
        maxSteps: 2,
      });

      // For now, return null - you could parse the response for event data
      return null;
    } catch (error) {
      console.error('Error parsing event from Letta agent:', error);
      return null;
    }
  }

  // Get conversation history
  getConversationHistory(): LettaMessage[] {
    return [...this.conversationHistory];
  }

  // Clear conversation history
  clearHistory(): void {
    this.conversationHistory = [];
  }

  // Health check using SDK
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.config.apiKey) {
        console.warn('⚠️ No API key configured for Letta');
        return false;
      }

      // Try to get or create an agent as a health check
      const agentId = await this.getOrCreateAgent();
      return !!agentId;
    } catch (error) {
      console.error('Letta agent health check failed:', error);
      return false;
    }
  }

  // Get agent info
  async getAgentInfo() {
    try {
      const agentId = await this.getOrCreateAgent();
      return await this.client.agents.retrieve(agentId);
    } catch (error) {
      console.error('Error getting agent info:', error);
      return null;
    }
  }

  // List available agents
  async listAgents() {
    try {
      return await this.client.agents.list();
    } catch (error) {
      console.error('Error listing agents:', error);
      return [];
    }
  }

  // Get current agent ID
  getCurrentAgentId(): string | null {
    return this.currentAgentId;
  }
}

// Create and export the service instance with default configuration
export const lettaService = new LettaService(defaultLettaConfig);

export default lettaService;