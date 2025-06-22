import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Event, User, AiSuggestion, ChatMessage, EventCategory, UserPreferences } from '../types';

interface AppState {
  user: User | null;
  events: Event[];
  currentWeek: Date;
  selectedDate: Date;
  aiSuggestions: AiSuggestion[];
  chatMessages: ChatMessage[];
  isAiChatOpen: boolean;
  isDarkMode: boolean;
  isOnboardingComplete: boolean;
}

type AppAction =
  | { type: 'SET_USER'; payload: User }
  | { type: 'ADD_EVENT'; payload: Event }
  | { type: 'UPDATE_EVENT'; payload: Event }
  | { type: 'DELETE_EVENT'; payload: string }
  | { type: 'SET_EVENTS'; payload: Event[] }
  | { type: 'SET_CURRENT_WEEK'; payload: Date }
  | { type: 'SET_SELECTED_DATE'; payload: Date }
  | { type: 'ADD_AI_SUGGESTION'; payload: AiSuggestion }
  | { type: 'REMOVE_AI_SUGGESTION'; payload: string }
  | { type: 'ADD_CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'TOGGLE_AI_CHAT' }
  | { type: 'TOGGLE_DARK_MODE' }
  | { type: 'COMPLETE_EVENT'; payload: string }
  | { type: 'COMPLETE_ONBOARDING'; payload: User }
  | { type: 'DELETE_RECURRING_EVENTS'; payload: string };

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

const initialState: AppState = {
  user: null,
  events: [],
  currentWeek: new Date(),
  selectedDate: new Date(),
  aiSuggestions: [],
  chatMessages: [],
  isAiChatOpen: false,
  isDarkMode: false,
  isOnboardingComplete: false,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'ADD_EVENT':
      return { ...state, events: [...state.events, action.payload] };
    case 'UPDATE_EVENT':
      return {
        ...state,
        events: state.events.map(event =>
          event.id === action.payload.id ? action.payload : event
        ),
      };
    case 'DELETE_EVENT':
      return {
        ...state,
        events: state.events.filter(event => event.id !== action.payload),
      };
    case 'DELETE_RECURRING_EVENTS':
      return {
        ...state,
        events: state.events.filter(event => event.recurringId !== action.payload),
      };
    case 'SET_EVENTS':
      return { ...state, events: action.payload };
    case 'SET_CURRENT_WEEK':
      return { ...state, currentWeek: action.payload };
    case 'SET_SELECTED_DATE':
      return { ...state, selectedDate: action.payload };
    case 'ADD_AI_SUGGESTION':
      return { ...state, aiSuggestions: [...state.aiSuggestions, action.payload] };
    case 'REMOVE_AI_SUGGESTION':
      return {
        ...state,
        aiSuggestions: state.aiSuggestions.filter(s => s.id !== action.payload),
      };
    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.payload] };
    case 'TOGGLE_AI_CHAT':
      return { ...state, isAiChatOpen: !state.isAiChatOpen };
    case 'TOGGLE_DARK_MODE':
      return { ...state, isDarkMode: !state.isDarkMode };
    case 'COMPLETE_EVENT':
      return {
        ...state,
        events: state.events.map(event =>
          event.id === action.payload ? { ...event, isCompleted: true } : event
        ),
      };
    case 'COMPLETE_ONBOARDING':
      return { 
        ...state, 
        user: action.payload, 
        isOnboardingComplete: true 
      };
    default:
      return state;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}