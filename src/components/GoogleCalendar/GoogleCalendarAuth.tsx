import React, { useState, useEffect } from 'react';
import { Calendar, ExternalLink, RefreshCw, LogOut, CheckCircle, AlertCircle, Edit3, Copy, ExternalLinkIcon, Key } from 'lucide-react';
import { googleCalendarService } from '../../services/googleCalendarService';
import { useApp } from '../../contexts/AppContext';

export default function GoogleCalendarAuth() {
  const { state, dispatch } = useApp();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<Array<{ id: string; summary: string; primary?: boolean }>>([]);
  const [showSetupInstructions, setShowSetupInstructions] = useState(false);
  const [showManualAuth, setShowManualAuth] = useState(false);

  useEffect(() => {
    setIsAuthenticated(googleCalendarService.isAuthenticated());
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadCalendars();
    }
  }, [isAuthenticated]);

  const handleManualAuth = async () => {
    setError(null);
    
    try {
      const authUrl = googleCalendarService.getAuthUrl();
      
      // Open the auth URL in a new tab
      window.open(authUrl, '_blank');
      
      // Show manual code entry
      setShowManualAuth(true);
      
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: '🔗 I\'ve opened the Google authorization page in a new tab. After granting permission, you\'ll get an authorization code. Please copy it and paste it in the input field below.',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      console.error('❌ Error generating auth URL:', err);
      setError('Failed to generate authentication URL. Please check your configuration.');
    }
  };

  const handleManualCodeSubmit = async (code: string) => {
    if (!code.trim()) {
      setError('Please enter the authorization code.');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const success = await googleCalendarService.exchangeCodeForToken(code.trim());
      if (success) {
        setIsAuthenticated(true);
        setShowManualAuth(false);
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: Date.now().toString(),
            type: 'ai',
            content: '🎉 Perfect! Google Calendar is now connected with full editing permissions. Your calendar events will sync automatically.',
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        setError('Failed to exchange authorization code. Please make sure the code is correct and try again.');
      }
    } catch (err: any) {
      console.error('❌ Token exchange error:', err);
      setError(err.message || 'Failed to complete authentication. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = () => {
    googleCalendarService.signOut();
    setIsAuthenticated(false);
    setCalendars([]);
    setError(null);
    setShowManualAuth(false);
    
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
          <Edit3 className={`h-3 w-3 ${
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
              <p className="font-medium mb-1">Connection Error</p>
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
            <p className="font-medium mb-1">🔧 Manual Authorization Required</p>
            <p className="mb-2">Due to the OAuth configuration, manual authorization is required. Click below to get started.</p>
            <button
              onClick={() => setShowSetupInstructions(!showSetupInstructions)}
              className="text-xs underline hover:no-underline"
            >
              {showSetupInstructions ? 'Hide' : 'Show'} setup requirements
            </button>
          </div>

          {showSetupInstructions && (
            <div className={`p-3 rounded-lg text-xs ${
              state.isDarkMode ? 'bg-yellow-900 bg-opacity-20 text-yellow-400' : 'bg-yellow-50 text-yellow-600'
            }`}>
              <p className="font-medium mb-2">📋 Google Cloud Console Setup:</p>
              <ol className="list-decimal list-inside space-y-1 mb-3">
                <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a></li>
                <li>Navigate to "APIs & Services" → "Credentials"</li>
                <li>Edit your OAuth 2.0 Client ID</li>
                <li>In "Authorized redirect URIs", add:</li>
              </ol>
              
              <div className={`p-2 rounded border font-mono text-xs mb-2 ${
                state.isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-300'
              }`}>
                https://developers.google.com/oauthplayground
              </div>
              
              <p className="text-xs opacity-75">
                This is Google's official OAuth playground URL that works reliably with manual authorization flows.
              </p>
            </div>
          )}

          {!showManualAuth ? (
            <button
              onClick={handleManualAuth}
              className={`w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                state.isDarkMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              <Key className="h-4 w-4" />
              <span>Connect with Manual Authorization</span>
            </button>
          ) : (
            <ManualAuthForm 
              onSubmit={handleManualCodeSubmit}
              onCancel={() => setShowManualAuth(false)}
              isLoading={isLoading}
              isDarkMode={state.isDarkMode}
            />
          )}
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
              <Edit3 className="h-3 w-3" />
              <span className="font-medium">Full Control Enabled</span>
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

interface ManualAuthFormProps {
  onSubmit: (code: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  isDarkMode: boolean;
}

function ManualAuthForm({ onSubmit, onCancel, isLoading, isDarkMode }: ManualAuthFormProps) {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(code);
  };

  return (
    <div className="space-y-3">
      <div className={`p-3 rounded-lg text-xs ${
        isDarkMode ? 'bg-blue-900 bg-opacity-20 text-blue-400' : 'bg-blue-50 text-blue-600'
      }`}>
        <p className="font-medium mb-1">📋 Instructions:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Complete the authorization in the opened tab</li>
          <li>Copy the authorization code from the page</li>
          <li>Paste it in the field below</li>
        </ol>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste authorization code here..."
          className={`w-full px-3 py-2 text-xs border rounded-lg transition-colors ${
            isDarkMode
              ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500'
          } focus:outline-none focus:ring-2`}
        />
        
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className={`flex-1 px-3 py-2 text-xs border rounded-lg transition-colors ${
              isDarkMode
                ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!code.trim() || isLoading}
            className="flex-1 px-3 py-2 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </form>
    </div>
  );
}