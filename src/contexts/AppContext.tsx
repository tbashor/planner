import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
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
  | { type: 'DELETE_RECURRING_EVENTS'; payload: string }
  | { type: 'LOAD_PERSISTED_STATE'; payload: Partial<AppState> };

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

const STORAGE_KEYS = {
  USER: 'smartplan_user',
  ONBOARDING_COMPLETE: 'smartplan_onboarding_complete',
  EVENTS: 'smartplan_events',
  DARK_MODE: 'smartplan_dark_mode',
  CHAT_MESSAGES: 'smartplan_chat_messages',
};

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

// Helper functions for localStorage
const saveToStorage = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Error saving to localStorage (${key}):`, error);
  }
};

const loadFromStorage = (key: string) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.error(`Error loading from localStorage (${key}):`, error);
    return null;
  }
};

const loadPersistedState = (): Partial<AppState> => {
  const user = loadFromStorage(STORAGE_KEYS.USER);
  const isOnboardingComplete = loadFromStorage(STORAGE_KEYS.ONBOARDING_COMPLETE) || false;
  const events = loadFromStorage(STORAGE_KEYS.EVENTS) || [];
  const isDarkMode = loadFromStorage(STORAGE_KEYS.DARK_MODE) || false;
  const chatMessages = loadFromStorage(STORAGE_KEYS.CHAT_MESSAGES) || [];

  return {
    user,
    isOnboardingComplete,
    events,
    isDarkMode,
    chatMessages,
  };
};

function appReducer(state: AppState, action: AppAction): AppState {
  let newState: AppState;

  switch (action.type) {
    case 'LOAD_PERSISTED_STATE':
      newState = { ...state, ...action.payload };
      break;
    case 'SET_USER':
      newState = { ...state, user: action.payload };
      saveToStorage(STORAGE_KEYS.USER, action.payload);
      break;
    case 'ADD_EVENT':
      newState = { ...state, events: [...state.events, action.payload] };
      saveToStorage(STORAGE_KEYS.EVENTS, newState.events);
      break;
    case 'UPDATE_EVENT':
      newState = {
        ...state,
        events: state.events.map(event =>
          event.id === action.payload.id ? action.payload : event
        ),
      };
      saveToStorage(STORAGE_KEYS.EVENTS, newState.events);
      break;
    case 'DELETE_EVENT':
      newState = {
        ...state,
        events: state.events.filter(event => event.id !== action.payload),
      };
      saveToStorage(STORAGE_KEYS.EVENTS, newState.events);
      break;
    case 'DELETE_RECURRING_EVENTS':
      newState = {
        ...state,
        events: state.events.filter(event => event.recurringId !== action.payload),
      };
      saveToStorage(STORAGE_KEYS.EVENTS, newState.events);
      break;
    case 'SET_EVENTS':
      newState = { ...state, events: action.payload };
      saveToStorage(STORAGE_KEYS.EVENTS, action.payload);
      break;
    case 'SET_CURRENT_WEEK':
      newState = { ...state, currentWeek: action.payload };
      break;
    case 'SET_SELECTED_DATE':
      newState = { ...state, selectedDate: action.payload };
      break;
    case 'ADD_AI_SUGGESTION':
      newState = { ...state, aiSuggestions: [...state.aiSuggestions, action.payload] };
      break;
    case 'REMOVE_AI_SUGGESTION':
      newState = {
        ...state,
        aiSuggestions: state.aiSuggestions.filter(s => s.id !== action.payload),
      };
      break;
    case 'ADD_CHAT_MESSAGE':
      newState = { ...state, chatMessages: [...state.chatMessages, action.payload] };
      saveToStorage(STORAGE_KEYS.CHAT_MESSAGES, newState.chatMessages);
      break;
    case 'TOGGLE_AI_CHAT':
      newState = { ...state, isAiChatOpen: !state.isAiChatOpen };
      break;
    case 'TOGGLE_DARK_MODE':
      newState = { ...state, isDarkMode: !state.isDarkMode };
      saveToStorage(STORAGE_KEYS.DARK_MODE, newState.isDarkMode);
      break;
    case 'COMPLETE_EVENT':
      newState = {
        ...state,
        events: state.events.map(event =>
          event.id === action.payload ? { ...event, isCompleted: true } : event
        ),
      };
      saveToStorage(STORAGE_KEYS.EVENTS, newState.events);
      break;
    case 'COMPLETE_ONBOARDING':
      newState = { 
        ...state, 
        user: action.payload, 
        isOnboardingComplete: true 
      };
      saveToStorage(STORAGE_KEYS.USER, action.payload);
      saveToStorage(STORAGE_KEYS.ONBOARDING_COMPLETE, true);
      break;
    default:
      newState = state;
  }

  return newState;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load persisted state on mount
  useEffect(() => {
    const persistedState = loadPersistedState();
    if (Object.keys(persistedState).length > 0) {
      dispatch({ type: 'LOAD_PERSISTED_STATE', payload: persistedState });
    }
  }, []);

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