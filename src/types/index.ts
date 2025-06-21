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