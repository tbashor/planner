export interface Event {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  date: string;
  category: EventCategory;
  priority: Priority;
  description?: string;
  links?: string[];
  isCompleted: boolean;
  isStatic: boolean; // For meals, fixed routines
  color: string;
  isRecurring?: boolean;
  recurringId?: string; // Groups recurring events together
  recurringType?: 'daily' | 'weekly' | 'monthly';
}

export interface EventCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export type Priority = 'low' | 'medium' | 'high';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  timeBlockSize: number; // in minutes
  workingHours: {
    start: string;
    end: string;
  };
  productivityHours: string[];
  motivationalFeedback: boolean;
  voiceInput: boolean;
  aiSuggestions: boolean;
  focusAreas?: string[];
  dailyRoutines?: string[];
  goals?: string;
}

export interface AiSuggestion {
  id: string;
  type: 'schedule' | 'break' | 'reorder' | 'optimize';
  title: string;
  description: string;
  action: string;
  priority: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: string;
}

export interface TimeSlot {
  time: string;
  hour: number;
  minute: number;
}

// Composio Service Types
export interface ComposioToolCall {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}

export interface ComposioToolResult {
  toolCallId: string;
  result: unknown;
  isError?: boolean;
  errorMessage?: string;
}

export interface ComposioConnection {
  id: string;
  appName: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  entityId: string;
  userId?: string;
}

export interface ComposioConnectionFeatures {
  googleCalendarIntegration: string;
  composioTools: string;
  openaiAgent: string;
  userSpecificEntity: string;
}

export interface ComposioServiceStats {
  userConnections: number;
  userEntities: number;
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  nodeVersion: string;
  platform: string;
  services: {
    openai: string;
    composio: string;
  };
  userDetails: {
    connectedUsers: string[];
    entityUsers: string[];
    userEntityMapping: Array<{
      userEmail: string;
      entityId: string;
      connectionStatus: string;
    }>;
  };
  timestamp: string;
}

export interface UserCalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  date: string;
  description?: string;
  location?: string;
  attendees?: Array<{ email: string; name?: string }>;
  calendar?: { id: string; name: string };
}

export interface UserPreferencesContext {
  focusAreas?: string[];
  productivityHours?: string[];
  workingHours?: {
    start: string;
    end: string;
  };
  dailyRoutines?: string[];
  goals?: string;
}