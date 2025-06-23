import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, Settings, User, Moon, Sun, RotateCcw, Calendar, BellRing, LogOut, Shield, Sparkles, Trash2, Save } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { oauthService } from '../services/oauthService';
import { googleCalendarService } from '../services/googleCalendarService';
import { generatePersonalizedSuggestions } from '../utils/aiUtils';

export default function Header() {
  const { state, dispatch } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

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
      event.description?.includes('Created by AI assistant')
    );

    // Clear all stored data except potentially AI events
    localStorage.clear();

    if (keepAiEvents && aiEvents.length > 0) {
      // Save AI events to be restored after reset
      localStorage.setItem('smartplan_preserved_ai_events', JSON.stringify(aiEvents));
      
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `🔄 Preferences reset! I've preserved ${aiEvents.length} AI-suggested events from your previous setup. After you complete onboarding, I'll adapt my suggestions to your new preferences while keeping your existing AI events.`,
          timestamp: new Date().toISOString(),
        },
      });
    } else {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
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
      'This will disconnect your current Google Calendar and start a new connection. Continue?'
    );
    
    if (confirmReconnect) {
      // Clear existing Google Calendar connection
      oauthService.clearTokens();
      googleCalendarService.signOut();
      
      // Remove Google Calendar events from state
      const nonGoogleEvents = state.events.filter(event => !event.id.startsWith('google_'));
      dispatch({ type: 'SET_EVENTS', payload: nonGoogleEvents });
      
      // Add AI message about disconnection
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: '🔄 Google Calendar has been disconnected. You can now connect a different Google account through the AI sidebar.',
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
        id: Date.now().toString(),
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
          id: Date.now().toString(),
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
        id: Date.now().toString(),
        type: 'ai',
        content: `✨ I've refreshed my suggestions based on your current preferences! Generated ${newSuggestions.length} new personalized recommendations that align with your focus areas: ${state.user.preferences.focusAreas?.join(', ') || 'your goals'}.`,
        timestamp: new Date().toISOString(),
      },
    });

    setShowSettingsMenu(false);
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const isGoogleCalendarConnected = oauthService.isAuthenticated();
  const aiEventCount = state.events.filter(event => 
    event.id.startsWith('ai_event_') || 
    event.description?.includes('Created by AI assistant')
  ).length;

  return (
    <>
      <header className={`${
        state.isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
      } border-b transition-colors duration-200`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <div className={`${
                state.isDarkMode ? 'bg-blue-600' : 'bg-blue-500'
              } rounded-lg p-2 mr-3`}>
                <div className="w-6 h-6 bg-white rounded-sm flex items-center justify-center">
                  <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
                </div>
              </div>
              <h1 className={`text-xl font-bold ${
                state.isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                SmartPlan
              </h1>
            </div>

            {/* Search Bar */}
            <div className="flex-1 max-w-lg mx-8">
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

            {/* Right Side Actions */}
            <div className="flex items-center space-x-4">
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
                  <div className={`absolute right-0 mt-2 w-72 rounded-lg shadow-lg py-1 z-50 border ${
                    state.isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                  }`}>
                    {/* Settings Header */}
                    <div className={`px-4 py-3 border-b ${
                      state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
                    }`}>
                      <h3 className={`text-sm font-semibold ${
                        state.isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        Settings
                      </h3>
                      <p className={`text-xs ${
                        state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        Manage your preferences and connections
                      </p>
                    </div>

                    {/* Refresh AI Suggestions */}
                    <button
                      onClick={refreshAiSuggestions}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-opacity-80 transition-colors duration-200 flex items-center space-x-3 ${
                        state.isDarkMode 
                          ? 'text-purple-400 hover:bg-gray-700' 
                          : 'text-purple-600 hover:bg-gray-100'
                      }`}
                    >
                      <Sparkles className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Refresh AI Suggestions</div>
                        <div className={`text-xs ${
                          state.isDarkMode ? 'text-gray-500' : 'text-gray-500'
                        }`}>
                          Generate new suggestions based on current preferences
                        </div>
                      </div>
                    </button>

                    {/* Reset Preferences */}
                    <button
                      onClick={resetOnboarding}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-opacity-80 transition-colors duration-200 flex items-center space-x-3 ${
                        state.isDarkMode 
                          ? 'text-yellow-400 hover:bg-gray-700' 
                          : 'text-yellow-600 hover:bg-gray-100'
                      }`}
                    >
                      <RotateCcw className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Reset Preferences</div>
                        <div className={`text-xs ${
                          state.isDarkMode ? 'text-gray-500' : 'text-gray-500'
                        }`}>
                          Restart onboarding with event management options
                        </div>
                      </div>
                    </button>

                    {/* Google Calendar Connection */}
                    <button
                      onClick={handleReconnectGoogleCalendar}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-opacity-80 transition-colors duration-200 flex items-center space-x-3 ${
                        state.isDarkMode 
                          ? 'text-blue-400 hover:bg-gray-700' 
                          : 'text-blue-600 hover:bg-gray-100'
                      }`}
                    >
                      <Calendar className="h-4 w-4" />
                      <div>
                        <div className="font-medium flex items-center space-x-2">
                          <span>Google Calendar</span>
                          {isGoogleCalendarConnected && (
                            <Shield className="h-3 w-3 text-green-500" />
                          )}
                        </div>
                        <div className={`text-xs ${
                          state.isDarkMode ? 'text-gray-500' : 'text-gray-500'
                        }`}>
                          {isGoogleCalendarConnected 
                            ? 'Reconnect to different account' 
                            : 'Connect your Google Calendar'
                          }
                        </div>
                      </div>
                    </button>

                    {/* Notification Settings */}
                    <button
                      onClick={handleNotificationSettings}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-opacity-80 transition-colors duration-200 flex items-center space-x-3 ${
                        state.isDarkMode 
                          ? 'text-green-400 hover:bg-gray-700' 
                          : 'text-green-600 hover:bg-gray-100'
                      }`}
                    >
                      <BellRing className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Notifications</div>
                        <div className={`text-xs ${
                          state.isDarkMode ? 'text-gray-500' : 'text-gray-500'
                        }`}>
                          Configure alerts and reminders
                        </div>
                      </div>
                    </button>

                    {/* User Preferences Info */}
                    <div className={`px-4 py-3 border-t ${
                      state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
                    }`}>
                      <div className={`text-xs ${
                        state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        <div className="mb-2">
                          <span className="font-medium">Current Status:</span>
                        </div>
                        {state.user?.preferences && (
                          <div className="space-y-1">
                            <div>• Focus Areas: {state.user.preferences.focusAreas?.join(', ') || 'None set'}</div>
                            <div>• Productive Hours: {state.user.preferences.productivityHours?.join(', ') || 'None set'}</div>
                            <div>• AI Suggestions: {state.user.preferences.aiSuggestions ? 'Enabled' : 'Disabled'}</div>
                            <div>• AI Events: {aiEventCount} created</div>
                            <div>• Google Calendar: {isGoogleCalendarConnected ? 'Connected' : 'Not connected'}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Profile */}
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center space-x-2 p-1 rounded-lg hover:bg-opacity-80 transition-colors duration-200"
                >
                  <img
                    src={state.user?.avatar}
                    alt={state.user?.name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <span className={`text-sm font-medium ${
                    state.isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    {state.user?.name}
                  </span>
                </button>

                {showProfileMenu && (
                  <div className={`absolute right-0 mt-2 w-48 rounded-lg shadow-lg py-1 z-50 ${
                    state.isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                  }`}>
                    <a href="#" className={`block px-4 py-2 text-sm hover:bg-opacity-80 transition-colors duration-200 ${
                      state.isDarkMode 
                        ? 'text-gray-300 hover:bg-gray-700' 
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}>
                      Profile Settings
                    </a>
                    <a href="#" className={`block px-4 py-2 text-sm hover:bg-opacity-80 transition-colors duration-200 ${
                      state.isDarkMode 
                        ? 'text-gray-300 hover:bg-gray-700' 
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}>
                      Preferences
                    </a>
                    <hr className={`my-1 ${state.isDarkMode ? 'border-gray-700' : 'border-gray-200'}`} />
                    <a href="#" className={`block px-4 py-2 text-sm hover:bg-opacity-80 transition-colors duration-200 ${
                      state.isDarkMode 
                        ? 'text-gray-300 hover:bg-gray-700' 
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}>
                      Sign Out
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Reset Preferences Dialog */}
      {showResetDialog && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" />
            
            <div className={`relative w-full max-w-md rounded-xl shadow-2xl transition-all ${
              state.isDarkMode ? 'bg-gray-800' : 'bg-white'
            }`}>
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-yellow-500 rounded-lg">
                    <RotateCcw className="h-5 w-5 text-white" />
                  </div>
                  <h3 className={`text-lg font-semibold ${
                    state.isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Reset Preferences
                  </h3>
                </div>
                
                <p className={`text-sm mb-4 ${
                  state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  You're about to reset all your preferences and restart onboarding. 
                  {aiEventCount > 0 && ` You have ${aiEventCount} AI-suggested events in your calendar.`}
                </p>

                {aiEventCount > 0 && (
                  <div className={`p-3 rounded-lg mb-4 ${
                    state.isDarkMode ? 'bg-blue-900 bg-opacity-20 text-blue-400' : 'bg-blue-50 text-blue-600'
                  }`}>
                    <div className="flex items-center space-x-2 mb-2">
                      <Sparkles className="h-4 w-4" />
                      <span className="font-medium">AI Events Found</span>
                    </div>
                    <p className="text-xs">
                      What would you like to do with your {aiEventCount} AI-suggested calendar events?
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  {aiEventCount > 0 && (
                    <button
                      onClick={() => handleResetWithEventChoice(true)}
                      className={`w-full p-4 text-left border-2 rounded-lg transition-colors ${
                        state.isDarkMode
                          ? 'border-green-600 hover:border-green-500 hover:bg-green-900 hover:bg-opacity-20'
                          : 'border-green-200 hover:border-green-500 hover:bg-green-50'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Save className="h-5 w-5 text-green-500" />
                        <div>
                          <div className={`font-medium ${
                            state.isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            Keep AI Events & Reset Preferences
                          </div>
                          <div className={`text-sm ${
                            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            Preserve your {aiEventCount} AI-suggested events and adapt suggestions to new preferences
                          </div>
                        </div>
                      </div>
                    </button>
                  )}

                  <button
                    onClick={() => handleResetWithEventChoice(false)}
                    className={`w-full p-4 text-left border-2 rounded-lg transition-colors ${
                      state.isDarkMode
                        ? 'border-red-600 hover:border-red-500 hover:bg-red-900 hover:bg-opacity-20'
                        : 'border-red-200 hover:border-red-500 hover:bg-red-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Trash2 className="h-5 w-5 text-red-500" />
                      <div>
                        <div className={`font-medium ${
                          state.isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          Complete Reset
                        </div>
                        <div className={`text-sm ${
                          state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          Clear all data including AI events and start completely fresh
                        </div>
                      </div>
                    </div>
                  </button>
                </div>

                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => setShowResetDialog(false)}
                    className={`px-4 py-2 text-sm border rounded-lg ${
                      state.isDarkMode
                        ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}