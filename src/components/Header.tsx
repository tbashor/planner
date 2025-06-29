import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, Settings, Moon, Sun, RotateCcw, Calendar, BellRing, Sparkles, Trash2, Save, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { generatePersonalizedSuggestions } from '../utils/aiUtils';

export default function Header() {
  const { state, dispatch } = useApp();
  const { authState, checkConnectionStatus, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  // Check Composio authentication status
  const refreshAuthenticationStatus = async () => {
    if (authState.userEmail) {
      await checkConnectionStatus(authState.userEmail);
    }
  };

  const handleManualReauth = () => {
    // For Composio authentication, redirect to re-onboarding
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `reauth_start_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'ai',
        content: '🔄 To re-authenticate, please clear your current session and go through onboarding again with your Google account.',
        timestamp: new Date().toISOString(),
      },
    });
    
    // Clear the authentication and trigger onboarding
    signOut();
    setShowSettingsMenu(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Implement search functionality
    console.log('Searching for:', searchQuery);
  };

  const toggleTheme = () => {
    dispatch({ type: 'TOGGLE_DARK_MODE' });
  };

  const resetOnboarding = () => {
    setShowResetDialog(true);
    setShowSettingsMenu(false);
  };

  const handleResetWithEventChoice = (keepAiEvents: boolean) => {
    // Get AI-suggested events (events created by AI assistant)
    const aiEvents = state.events.filter(event => 
      event.id.startsWith('ai_event_') || 
      event.description?.includes('Created by AI assistant') ||
      event.description?.includes('Suggested by AI')
    );

    // Clear app-specific data but preserve authentication tokens
    const keysToRemove = [
      'smartplan_user',
      'smartplan_onboarding_complete', 
      'smartplan_events',
      'smartplan_dark_mode',
      'smartplan_chat_messages'
    ];
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log('🧹 Cleared app data while preserving Composio authentication');

    if (keepAiEvents && aiEvents.length > 0) {
      // Save AI events to be restored after reset
      localStorage.setItem('smartplan_preserved_ai_events', JSON.stringify(aiEvents));
      
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `reset_preserve_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: `🔄 Preferences reset! I've preserved ${aiEvents.length} AI-suggested events from your previous setup. After you complete onboarding, I'll adapt my suggestions to your new preferences while keeping your existing AI events.`,
          timestamp: new Date().toISOString(),
        },
      });
    } else {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `reset_complete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: '🔄 Complete reset performed! All data has been cleared. I\'ll provide fresh suggestions based on your new preferences after onboarding.',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Reload the page to restart onboarding
    setTimeout(() => {
      window.location.reload();
    }, 1000);
    
    setShowResetDialog(false);
  };

  const handleReconnectGoogleCalendar = () => {
    const confirmReconnect = window.confirm(
      'This will disconnect your current Google Calendar connection and clear your authentication. You\'ll need to go through onboarding again. Continue?'
    );
    
    if (confirmReconnect) {
      // Clear Composio authentication
      signOut();
      
      // Remove Google Calendar events from state
      const nonGoogleEvents = state.events.filter(event => !event.id.startsWith('google_'));
      dispatch({ type: 'SET_EVENTS', payload: nonGoogleEvents });
      
      // Add AI message about disconnection
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `reconnect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: '🔄 Google Calendar has been disconnected. Please complete onboarding again to reconnect your Google account.',
          timestamp: new Date().toISOString(),
        },
      });
      
      setShowSettingsMenu(false);
    }
  };

  const handleNotificationSettings = () => {
    // For now, show a placeholder message
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `notifications_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'ai',
        content: '🔔 Notification settings are coming soon! For now, you can enable/disable motivational feedback in your user preferences.',
        timestamp: new Date().toISOString(),
      },
    });
    setShowSettingsMenu(false);
  };

  const refreshAiSuggestions = () => {
    if (!state.user?.preferences) {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `refresh_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: '⚠️ Please complete onboarding first to get personalized AI suggestions.',
          timestamp: new Date().toISOString(),
        },
      });
      setShowSettingsMenu(false);
      return;
    }

    // Clear existing suggestions
    state.aiSuggestions.forEach(suggestion => {
      dispatch({ type: 'REMOVE_AI_SUGGESTION', payload: suggestion.id });
    });

    // Generate new suggestions based on current preferences and events
    const newSuggestions = generatePersonalizedSuggestions(
      state.events,
      state.user.preferences,
      new Date()
    );

    // Add new suggestions
    newSuggestions.forEach(suggestion => {
      dispatch({ type: 'ADD_AI_SUGGESTION', payload: suggestion });
    });

    // Add AI message about refresh
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `refresh_success_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'ai',
        content: `✨ I've refreshed my suggestions based on your current preferences! Generated ${newSuggestions.length} new personalized recommendations that align with your focus areas: ${state.user.preferences.focusAreas?.join(', ') || 'your goals'}.`,
        timestamp: new Date().toISOString(),
      },
    });

    setShowSettingsMenu(false);
  };

  // Authentication status monitoring
  useEffect(() => {
    // Check on mount if we have a user email
    if (authState.userEmail) {
      refreshAuthenticationStatus();
    }
    
    // Set up interval to check authentication status periodically
    const authCheckInterval = setInterval(() => {
      if (authState.userEmail) {
        refreshAuthenticationStatus();
      }
    }, 60000); // Check every minute
    
    return () => clearInterval(authCheckInterval);
  }, [authState.userEmail]); 

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const isGoogleCalendarConnected = authState.isAuthenticated && authState.connectionStatus === 'connected';
  const aiEventCount = state.events.filter(event => 
    event.id.startsWith('ai_event_') || 
    event.description?.includes('Created by AI assistant') ||
    event.description?.includes('Suggested by AI')
  ).length;

  return (
    <>
      <header className={`${
        state.isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
      } border-b transition-colors duration-200`}>
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo - aligned to left edge */}
            <div className="flex items-center flex-shrink-0">
              <div className="mr-3">
                <img 
                  src="/confi-cal .png" 
                  alt="Confical Logo" 
                  className="w-10 h-10 rounded-lg"
                />
              </div>
              <h1 className={`text-xl font-bold ${
                state.isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Confical
              </h1>
            </div>

            {/* Search Bar - centered */}
            <div className="flex-1 max-w-lg mx-8 hidden md:block">
              <form onSubmit={handleSearch} className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className={`h-5 w-5 ${
                    state.isDarkMode ? 'text-gray-400' : 'text-gray-400'
                  }`} />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`block w-full pl-10 pr-3 py-2 border rounded-lg leading-5 ${
                    state.isDarkMode 
                      ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500'
                  } focus:outline-none focus:ring-1 transition-colors duration-200`}
                  placeholder="Search events, tasks, or ask AI..."
                />
              </form>
            </div>

            {/* Right Side Actions - aligned to right edge */}
            <div className="flex items-center space-x-4 flex-shrink-0">
              {/* Authentication Status Indicators */}
              {authState.connectionStatus === 'error' && (
                <div className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs ${
                  state.isDarkMode 
                    ? 'bg-red-900 bg-opacity-30 text-red-400' 
                    : 'bg-red-100 text-red-700'
                }`}>
                  <AlertTriangle className="h-3 w-3" />
                  <span className="hidden sm:inline">Connection Error</span>
                </div>
              )}
              {authState.connectionStatus === 'checking' && (
                <div className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs ${
                  state.isDarkMode 
                    ? 'bg-blue-900 bg-opacity-30 text-blue-400' 
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">Checking...</span>
                </div>
              )}
              {authState.connectionStatus === 'disconnected' && !authState.isLoading && (
                <div className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs ${
                  state.isDarkMode 
                    ? 'bg-yellow-900 bg-opacity-30 text-yellow-400' 
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  <AlertTriangle className="h-3 w-3" />
                  <span className="hidden sm:inline">Disconnected</span>
                </div>
              )}

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200 ${
                  state.isDarkMode 
                    ? 'text-gray-300 hover:bg-gray-800' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {state.isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {/* Notifications */}
              <button className={`p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200 ${
                state.isDarkMode 
                  ? 'text-gray-300 hover:bg-gray-800' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}>
                <Bell className="h-5 w-5" />
              </button>

              {/* Settings */}
              <div className="relative" ref={settingsMenuRef}>
                <button
                  onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                  className={`p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200 ${
                    state.isDarkMode 
                      ? 'text-gray-300 hover:bg-gray-800' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Settings className="h-5 w-5" />
                </button>

                {showSettingsMenu && (
                  <div className={`absolute right-0 mt-2 w-80 rounded-lg shadow-lg border z-50 ${
                    state.isDarkMode 
                      ? 'bg-gray-800 border-gray-700' 
                      : 'bg-white border-gray-200'
                  }`}>
                    <div className="py-2">
                      {/* Connection Status */}
                      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                        <h3 className={`text-sm font-medium ${
                          state.isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          Connection Status
                        </h3>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className={`flex items-center ${
                              state.isDarkMode ? 'text-gray-300' : 'text-gray-600'
                            }`}>
                              <Calendar className="h-3 w-3 mr-1" />
                              Google Calendar
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              isGoogleCalendarConnected
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}>
                              {isGoogleCalendarConnected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>
                          {authState.userEmail && (
                            <div className={`text-xs ${
                              state.isDarkMode ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                              {authState.userEmail}
                            </div>
                          )}
                          {authState.error && (
                            <div className="text-xs text-red-600 dark:text-red-400">
                              {authState.error}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Settings Options */}
                      <div className="py-1">
                        {!isGoogleCalendarConnected && (
                          <button
                            onClick={handleManualReauth}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center hover:bg-opacity-80 transition-colors duration-200 ${
                              state.isDarkMode 
                                ? 'text-blue-400 hover:bg-gray-700' 
                                : 'text-blue-600 hover:bg-gray-50'
                            }`}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Re-authenticate
                          </button>
                        )}
                        
                        <button
                          onClick={refreshAiSuggestions}
                          className={`w-full px-4 py-2 text-left text-sm flex items-center hover:bg-opacity-80 transition-colors duration-200 ${
                            state.isDarkMode 
                              ? 'text-gray-300 hover:bg-gray-700' 
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          Refresh AI Suggestions
                        </button>

                        <button
                          onClick={handleNotificationSettings}
                          className={`w-full px-4 py-2 text-left text-sm flex items-center hover:bg-opacity-80 transition-colors duration-200 ${
                            state.isDarkMode 
                              ? 'text-gray-300 hover:bg-gray-700' 
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <BellRing className="h-4 w-4 mr-2" />
                          Notification Settings
                        </button>

                        <button
                          onClick={handleReconnectGoogleCalendar}
                          className={`w-full px-4 py-2 text-left text-sm flex items-center hover:bg-opacity-80 transition-colors duration-200 ${
                            state.isDarkMode 
                              ? 'text-yellow-400 hover:bg-gray-700' 
                              : 'text-yellow-600 hover:bg-gray-50'
                          }`}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Reconnect Calendar
                        </button>

                        <button
                          onClick={resetOnboarding}
                          className={`w-full px-4 py-2 text-left text-sm flex items-center hover:bg-opacity-80 transition-colors duration-200 ${
                            state.isDarkMode 
                              ? 'text-gray-300 hover:bg-gray-700' 
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Reset Preferences
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Reset Dialog */}
      {showResetDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg max-w-md w-full mx-4 p-6 ${
            state.isDarkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="flex items-center mb-4">
              <AlertTriangle className={`h-6 w-6 mr-3 ${
                state.isDarkMode ? 'text-yellow-400' : 'text-yellow-600'
              }`} />
              <h3 className={`text-lg font-medium ${
                state.isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Reset Preferences
              </h3>
            </div>
            
            <p className={`text-sm mb-6 ${
              state.isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              This will reset your preferences and restart onboarding. Your Google Calendar connection will be preserved.
            </p>

            {aiEventCount > 0 && (
              <div className={`mb-6 p-3 rounded-lg ${
                state.isDarkMode ? 'bg-blue-900 bg-opacity-30' : 'bg-blue-50'
              }`}>
                <p className={`text-sm mb-3 ${
                  state.isDarkMode ? 'text-blue-200' : 'text-blue-800'
                }`}>
                  You have {aiEventCount} AI-suggested events. What would you like to do with them?
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => handleResetWithEventChoice(true)}
                    className={`w-full px-4 py-2 text-sm rounded-md transition-colors duration-200 ${
                      state.isDarkMode 
                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    <Save className="h-4 w-4 inline mr-2" />
                    Keep AI Events & Reset Preferences
                  </button>
                  <button
                    onClick={() => handleResetWithEventChoice(false)}
                    className={`w-full px-4 py-2 text-sm rounded-md transition-colors duration-200 ${
                      state.isDarkMode 
                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    <Trash2 className="h-4 w-4 inline mr-2" />
                    Delete Everything & Reset
                  </button>
                </div>
              </div>
            )}

            {aiEventCount === 0 && (
              <div className="flex space-x-3">
                <button
                  onClick={() => handleResetWithEventChoice(false)}
                  className={`flex-1 px-4 py-2 text-sm rounded-md transition-colors duration-200 ${
                    state.isDarkMode 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  Yes, Reset
                </button>
                <button
                  onClick={() => setShowResetDialog(false)}
                  className={`flex-1 px-4 py-2 text-sm rounded-md border transition-colors duration-200 ${
                    state.isDarkMode 
                      ? 'border-gray-600 text-gray-300 hover:bg-gray-700' 
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}