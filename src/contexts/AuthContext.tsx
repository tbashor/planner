import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import composioService from '../services/composioService';

interface AuthState {
  isAuthenticated: boolean;
  userEmail: string | null;
  connectionStatus: 'idle' | 'checking' | 'connected' | 'disconnected' | 'error';
  lastChecked: number;
  error: string | null;
  isLoading: boolean;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_AUTHENTICATED'; payload: { userEmail: string } }
  | { type: 'SET_DISCONNECTED'; payload?: string }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_CHECKING' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'LOAD_PERSISTED_STATE'; payload: Partial<AuthState> };

const AuthContext = createContext<{
  authState: AuthState;
  authDispatch: React.Dispatch<AuthAction>;
  checkConnectionStatus: (userEmail?: string) => Promise<boolean>;
  signOut: () => void;
} | null>(null);

const STORAGE_KEYS = {
  AUTH_STATE: 'smartplan_composio_auth',
  USER_EMAIL: 'smartplan_user_email',
  LAST_CHECKED: 'smartplan_auth_last_checked',
};

const initialState: AuthState = {
  isAuthenticated: false,
  userEmail: null,
  connectionStatus: 'idle',
  lastChecked: 0,
  error: null,
  isLoading: false,
};

// Helper functions for localStorage
const saveToStorage = (key: string, data: string | number) => {
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

const loadPersistedAuthState = (): Partial<AuthState> => {
  const userEmail = loadFromStorage(STORAGE_KEYS.USER_EMAIL);
  const lastChecked = loadFromStorage(STORAGE_KEYS.LAST_CHECKED) || 0;
  
  // If we have a stored email, restore it and mark as authenticated
  // The OAuth connection can be checked separately
  if (userEmail) {
    return {
      userEmail,
      lastChecked,
      isAuthenticated: true, // User has completed onboarding
      connectionStatus: 'connected', // Assume connected until proven otherwise
    };
  }
  
  return {};
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  let newState: AuthState;

  switch (action.type) {
    case 'LOAD_PERSISTED_STATE':
      newState = { ...state, ...action.payload };
      break;
    case 'SET_LOADING':
      newState = { ...state, isLoading: action.payload };
      break;
    case 'SET_CHECKING':
      newState = { ...state, connectionStatus: 'checking', isLoading: true, error: null };
      break;
    case 'SET_AUTHENTICATED':
      newState = {
        ...state,
        isAuthenticated: true,
        userEmail: action.payload.userEmail,
        connectionStatus: 'connected',
        lastChecked: Date.now(),
        error: null,
        isLoading: false,
      };
      // Persist to localStorage
      saveToStorage(STORAGE_KEYS.USER_EMAIL, action.payload.userEmail);
      saveToStorage(STORAGE_KEYS.LAST_CHECKED, Date.now());
      break;
    case 'SET_DISCONNECTED':
      newState = {
        ...state,
        isAuthenticated: false,
        userEmail: null,
        connectionStatus: 'disconnected',
        lastChecked: Date.now(),
        error: action.payload || null,
        isLoading: false,
      };
      // Clear from localStorage
      localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
      localStorage.removeItem(STORAGE_KEYS.LAST_CHECKED);
      break;
    case 'SET_ERROR':
      newState = {
        ...state,
        connectionStatus: 'error',
        error: action.payload,
        isLoading: false,
        lastChecked: Date.now(),
      };
      break;
    case 'CLEAR_ERROR':
      newState = { ...state, error: null };
      break;
    default:
      newState = state;
  }

  return newState;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, authDispatch] = useReducer(authReducer, initialState);

  // Load persisted state on mount
  useEffect(() => {
    const persistedState = loadPersistedAuthState();
    if (Object.keys(persistedState).length > 0) {
      authDispatch({ type: 'LOAD_PERSISTED_STATE', payload: persistedState });
    }
  }, []);

  // Check Composio connection status
  const checkConnectionStatus = async (userEmail?: string): Promise<boolean> => {
    const emailToCheck = userEmail || authState.userEmail;
    
    if (!emailToCheck) {
      authDispatch({ type: 'SET_DISCONNECTED', payload: 'No user email available' });
      return false;
    }

    // Skip if checked recently (within 30 seconds) and status is already known
    const now = Date.now();
    const timeSinceLastCheck = now - authState.lastChecked;
    if (timeSinceLastCheck < 30000 && authState.lastChecked > 0 && 
        (authState.connectionStatus === 'connected' || authState.connectionStatus === 'disconnected')) {
      console.log(`⏭️ Connection status already checked recently (${Math.floor(timeSinceLastCheck / 1000)}s ago), skipping`);
      return authState.isAuthenticated;
    }

    // Prevent concurrent checks
    if (authState.connectionStatus === 'checking') {
      console.log('⏭️ Connection check already in progress, skipping');
      return authState.isAuthenticated;
    }

    authDispatch({ type: 'SET_CHECKING' });

    try {
      console.log(`🔍 Checking Composio connection for: ${emailToCheck}`);
      
      const response = await composioService.testUserConnection(emailToCheck);
      
      if (response.success && response.testResult) {
        console.log('✅ Composio connection verified');
        authDispatch({ 
          type: 'SET_AUTHENTICATED', 
          payload: { userEmail: emailToCheck } 
        });
        return true;
      } else {
        console.warn('⚠️ Composio connection test failed:', response.error);
        // Don't mark as disconnected - user is still authenticated to the app
        // Just note that Composio/Google Calendar integration needs setup
        console.log('ℹ️ User remains authenticated, but Google Calendar needs connection');
        
        // Keep user authenticated but mark connection status appropriately
        authDispatch({ 
          type: 'SET_AUTHENTICATED', 
          payload: { userEmail: emailToCheck } 
        });
        
        return false; // Return false to indicate integration needs setup
      }
    } catch (error) {
      console.error('❌ Error checking Composio connection:', error);
      
      // Don't disconnect the user from the app for Composio errors
      // They might just need to reconnect their Google Calendar
      console.log('ℹ️ Composio check failed, but preserving user authentication');
      
      // Update last checked time to prevent immediate retries
      authDispatch({ 
        type: 'SET_AUTHENTICATED', 
        payload: { userEmail: emailToCheck } 
      });
      
      return false;
    }
  };

  // Sign out - clear all authentication state
  const signOut = () => {
    console.log('🚪 Signing out of Composio authentication');
    authDispatch({ type: 'SET_DISCONNECTED', payload: 'Signed out' });
    
    // Clear any additional auth-related localStorage items
    localStorage.removeItem('smartplan_user');
    localStorage.removeItem('smartplan_onboarding_complete');
  };

  // Auto-check connection status when user email changes
  useEffect(() => {
    if (authState.userEmail && authState.connectionStatus === 'connected') {
      // Set up periodic checking (every 5 minutes)
      const interval = setInterval(() => {
        checkConnectionStatus();
      }, 5 * 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [authState.userEmail, authState.connectionStatus]);

  return (
    <AuthContext.Provider value={{ 
      authState, 
      authDispatch, 
      checkConnectionStatus, 
      signOut 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 