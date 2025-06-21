import React, { useState, useEffect } from 'react';
import { Calendar, ExternalLink, RefreshCw, LogOut, CheckCircle, AlertCircle, Shield, Key } from 'lucide-react';
import { oauthService } from '../../services/oauthService';
import { googleCalendarService } from '../../services/googleCalendarService';
import { useApp } from '../../contexts/AppContext';

export default function GoogleCalendarAuth() {
  const { state, dispatch } = useApp();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<Array<{ id: string; summary: string; primary?: boolean }>>([]);
  const [showConfiguration, setShowConfiguration] = useState(false);

  useEffect(() => {
    checkAuthenticationStatus();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadCalendars();
    }
  }, [isAuthenticated]);

  const checkAuthenticationStatus = () => {
    const authenticated = oauthService.isAuthenticated();
    setIsAuthenticated(authenticated);
    
    if (authenticated) {
      console.log('✅ User is authenticated');
    } else {
      console.log('❌ User is not authenticated');
    }
  };

  const handleConnect = async () => {
    setError(null);
    setIsLoading(true);
    
    try {
      console.log('🚀 Starting OAuth flow...');
      
      // Generate authorization URL
      const authUrl = await oauthService.buildAuthUrl(true); // Enable PKCE
      
      console.log('🔗 Generated authorization URL');
      console.log('- Redirecting to Google OAuth...');
      
      // Redirect to authorization URL
      window.location.href = authUrl;
      
    } catch (err: any) {
      console.error('❌ Error starting OAuth flow:', err);
      setError(err.message || 'Failed to start authentication process');
      setIsLoading(false);
    }
  };

  const handleSignOut = () => {
    oauthService.clearTokens();
    googleCalendarService.signOut();
    setIsAuthenticated(false);
    setCalendars([]);
    setError(null);
    
    // Remove Google Calendar events from state
    const nonGoogleEvents = state.events.filter(event => !event.id.startsWith('google_'));
    dispatch({ type: 'SET_EVENTS', payload: nonGoogleEvents });
    
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: Date.now().toString(),
        type: 'ai',
        content: 'Google Calendar has been disconnected. Your Google Calendar events have been removed, but your local events are still available.',
        timestamp: new Date().toISOString(),
      },
    });
  };

  const loadCalendars = async () => {
    try {
      const calendarList = await googleCalendarService.getCalendarList();
      setCalendars(calendarList);
    } catch (err) {
      console.error('❌ Error loading calendars:', err);
      setError('Failed to load calendars');
    }
  };

  const syncEvents = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const weekStart = new Date(state.currentWeek);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week
      
      const googleEvents = await googleCalendarService.getWeekEvents(weekStart);
      
      // Remove existing Google events and add new ones
      const nonGoogleEvents = state.events.filter(event => !event.id.startsWith('google_'));
      const allEvents = [...nonGoogleEvents, ...googleEvents];
      
      dispatch({ type: 'SET_EVENTS', payload: allEvents });
      
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `📅 Synced ${googleEvents.length} events from Google Calendar! Your schedule is now up to date. I can see all your Google Calendar events and will help you plan around them. You can now drag and edit these events directly!`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('❌ Sync error:', err);
      setError('Failed to sync events. Please try again.');
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: '⚠️ I had trouble syncing your Google Calendar events. Please check your connection and try again.',
          timestamp: new Date().toISOString(),
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRedirectUriInstructions = () => {
    const config = oauthService.getConfiguration();
    return config.redirectUri;
  };

  return (
    <div className={`p-4 border-t ${
      state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
    }`}>
      <div className="flex items-center space-x-2 mb-3">
        <Calendar className={`h-4 w-4 ${
          state.isDarkMode ? 'text-blue-400' : 'text-blue-500'
        }`} />
        <h3 className={`text-sm font-medium ${
          state.isDarkMode ? 'text-white' : 'text-gray-900'
        }`}>
          Google Calendar
        </h3>
        {isAuthenticated && (
          <Shield className={`h-3 w-3 ${
            state.isDarkMode ? 'text-green-400' : 'text-green-600'
          }`} />
        )}
      </div>

      {error && (
        <div className={`mb-3 p-3 rounded-lg ${
          state.isDarkMode 
            ? 'bg-red-900 bg-opacity-20 text-red-400' 
            : 'bg-red-50 text-red-600'
        }`}>
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="text-xs">
              <p className="font-medium mb-1">Authentication Error</p>
              <p>{error}</p>
            </div>
          </div>
        </div>
      )}

      {!isAuthenticated ? (
        <div className="space-y-3">
          <p className={`text-xs ${
            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            Connect your Google Calendar to see all your events in one place, drag them around, edit them directly, and get better AI scheduling suggestions.
          </p>
          
          <div className={`p-3 rounded-lg text-xs ${
            state.isDarkMode ? 'bg-blue-900 bg-opacity-20 text-blue-400' : 'bg-blue-50 text-blue-600'
          }`}>
            <div className="flex items-center space-x-2 mb-2">
              <Shield className="h-4 w-4" />
              <span className="font-medium">Secure OAuth 2.0 Authentication</span>
            </div>
            <p className="mb-2">This uses industry-standard OAuth 2.0 with PKCE for maximum security. Your credentials are never stored on our servers.</p>
            <button
              onClick={() => setShowConfiguration(!showConfiguration)}
              className="text-xs underline hover:no-underline"
            >
              {showConfiguration ? 'Hide' : 'Show'} configuration details
            </button>
          </div>

          {showConfiguration && (
            <div className={`p-3 rounded-lg text-xs ${
              state.isDarkMode ? 'bg-yellow-900 bg-opacity-20 text-yellow-400' : 'bg-yellow-50 text-yellow-600'
            }`}>
              <p className="font-medium mb-2">📋 OAuth Configuration:</p>
              <div className="space-y-2">
                <div>
                  <p className="font-medium">Required Redirect URI:</p>
                  <div className={`p-2 rounded border font-mono text-xs mt-1 ${
                    state.isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-300'
                  }`}>
                    {getRedirectUriInstructions()}
                  </div>
                </div>
                <div>
                  <p className="font-medium">Setup Instructions:</p>
                  <ol className="list-decimal list-inside space-y-1 mt-1">
                    <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a></li>
                    <li>Navigate to "APIs & Services" → "Credentials"</li>
                    <li>Edit your OAuth 2.0 Client ID</li>
                    <li>Add the redirect URI above to "Authorized redirect URIs"</li>
                    <li>Save and try connecting again</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={isLoading}
            className={`w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
              isLoading
                ? 'opacity-50 cursor-not-allowed'
                : state.isDarkMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            <Key className="h-4 w-4" />
            <span>{isLoading ? 'Connecting...' : 'Connect Google Calendar'}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className={`flex items-center space-x-2 p-2 rounded-lg ${
            state.isDarkMode ? 'bg-green-900 bg-opacity-20' : 'bg-green-50'
          }`}>
            <CheckCircle className={`h-4 w-4 ${
              state.isDarkMode ? 'text-green-400' : 'text-green-600'
            }`} />
            <span className={`text-xs ${
              state.isDarkMode ? 'text-green-400' : 'text-green-600'
            }`}>
              Connected with full editing permissions
            </span>
          </div>

          <div className={`text-xs p-2 rounded-lg ${
            state.isDarkMode ? 'bg-blue-900 bg-opacity-20 text-blue-400' : 'bg-blue-50 text-blue-600'
          }`}>
            <div className="flex items-center space-x-1 mb-1">
              <Shield className="h-3 w-3" />
              <span className="font-medium">Secure Connection Active</span>
            </div>
            <p>You can now drag, edit, and delete Google Calendar events directly in the calendar. Changes sync automatically!</p>
          </div>

          {calendars.length > 0 && (
            <div className={`text-xs ${
              state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              <p className="mb-1">Available calendars:</p>
              <ul className="space-y-1">
                {calendars.slice(0, 3).map((calendar) => (
                  <li key={calendar.id} className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="truncate">
                      {calendar.summary} {calendar.primary && '(Primary)'}
                    </span>
                  </li>
                ))}
                {calendars.length > 3 && (
                  <li className="text-gray-500">+{calendars.length - 3} more</li>
                )}
              </ul>
            </div>
          )}

          <div className="flex space-x-2">
            <button
              onClick={syncEvents}
              disabled={isLoading}
              className={`flex-1 flex items-center justify-center space-x-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-200 ${
                isLoading
                  ? 'opacity-50 cursor-not-allowed'
                  : state.isDarkMode
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
            
            <button
              onClick={handleSignOut}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-200 ${
                state.isDarkMode
                  ? 'text-red-400 hover:bg-red-900 hover:bg-opacity-20'
                  : 'text-red-600 hover:bg-red-50'
              }`}
            >
              <LogOut className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}