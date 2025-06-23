import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, Settings, User, Moon, Sun, RotateCcw, Calendar, BellRing, LogOut, Shield } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { oauthService } from '../services/oauthService';
import { googleCalendarService } from '../services/googleCalendarService';

export default function Header() {
  const { state, dispatch } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
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
    const confirmReset = window.confirm(
      'Are you sure you want to reset your preferences? This will clear all your data and restart the onboarding process.'
    );
    
    if (confirmReset) {
      // Clear all stored data and reset to onboarding
      localStorage.clear();
      window.location.reload();
    }
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

  return (
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
                <div className={`absolute right-0 mt-2 w-64 rounded-lg shadow-lg py-1 z-50 border ${
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
                        Restart onboarding and clear all data
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
                        ? 'text-purple-400 hover:bg-gray-700' 
                        : 'text-purple-600 hover:bg-gray-100'
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
                        <span className="font-medium">Current Preferences:</span>
                      </div>
                      {state.user?.preferences && (
                        <div className="space-y-1">
                          <div>• Focus Areas: {state.user.preferences.focusAreas?.join(', ') || 'None set'}</div>
                          <div>• Productive Hours: {state.user.preferences.productivityHours?.join(', ') || 'None set'}</div>
                          <div>• AI Suggestions: {state.user.preferences.aiSuggestions ? 'Enabled' : 'Disabled'}</div>
                          <div>• Motivational Feedback: {state.user.preferences.motivationalFeedback ? 'Enabled' : 'Disabled'}</div>
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
  );
}