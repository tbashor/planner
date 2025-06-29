import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { oauthService } from '../../services/oauthService';
import { googleCalendarService } from '../../services/googleCalendarService';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import composioService from '../../services/composioService';

interface CallbackState {
  status: 'processing' | 'success' | 'error';
  message: string;
  details?: string;
}

export default function OAuthCallback() {
  const { state, dispatch } = useApp();
  const { authDispatch, checkConnectionStatus } = useAuth();
  const [callbackState, setCallbackState] = useState<CallbackState>({
    status: 'processing',
    message: 'Processing authentication...',
  });

  useEffect(() => {
    handleOAuthCallback();
  }, []);

  const handleOAuthCallback = async () => {
    try {
      setCallbackState({
        status: 'processing',
        message: 'Validating authorization...',
      });

      // Get current URL
      const currentUrl = window.location.href;
      const urlParams = new URLSearchParams(window.location.search);
      console.log('🔍 Processing OAuth callback:', currentUrl);

      // Check if this is a Composio OAuth callback
      const composioSuccess = urlParams.get('composio_success');
      const composioError = urlParams.get('composio_error');
      const userEmail = urlParams.get('user');

      if (composioSuccess === 'true' && userEmail) {
        console.log('✅ Composio OAuth callback detected for:', userEmail);
        await handleComposioOAuthCallback(userEmail);
        return;
      }

      if (composioError) {
        throw new Error(`Composio OAuth error: ${composioError}`);
      }

      // Check if this is a standard Google OAuth callback
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (code && state) {
        console.log('🔍 Standard Google OAuth callback detected');
        await handleGoogleOAuthCallback(currentUrl);
        return;
      }

      // If no recognizable callback parameters, show error
      throw new Error('Invalid OAuth callback - missing required parameters');

    } catch (error) {
      console.error('❌ OAuth callback error:', error);
      
      // Clear any partial authentication state
      oauthService.clearTokens();
      googleCalendarService.clearExternalTokens();
      authDispatch({ 
        type: 'SET_DISCONNECTED', 
        payload: error instanceof Error ? error.message : 'Unknown error occurred' 
      });
      
      setCallbackState({
        status: 'error',
        message: 'Authentication failed',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
      });

      // Add error message to chat
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `❌ Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try connecting again.`,
          timestamp: new Date().toISOString(),
        },
      });

      // Redirect back to main app after showing error
      setTimeout(() => {
        window.location.href = '/';
      }, 5000);
    }
  };

  const handleComposioOAuthCallback = async (userEmail: string) => {
    console.log('🎉 Processing Composio OAuth callback for:', userEmail);
    
    setCallbackState({
      status: 'processing',
      message: 'Verifying Composio connection...',
    });

    try {
      // Wait a moment for Composio to process the OAuth completion
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Test the connection to ensure it's active
      const testResult = await composioService.testUserConnection(userEmail);
      
      if (!testResult.success || !testResult.testResult) {
        throw new Error('Composio connection verification failed');
      }

      console.log('✅ Composio connection verified successfully');

      setCallbackState({
        status: 'processing',
        message: 'Setting up AI integration...',
      });

      // Generate user name from email
      const userName = userEmail.split('@')[0]
        .replace(/[._]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());

      // Update AuthContext with successful authentication
      authDispatch({ 
        type: 'SET_AUTHENTICATED', 
        payload: { userEmail } 
      });

      // Check Composio connection status
      try {
        await checkConnectionStatus(userEmail);
        console.log('✅ Composio connection status checked');
      } catch (error) {
        console.warn('⚠️ Failed to check Composio connection:', error);
        // Don't fail the entire flow if connection check fails
      }

      setCallbackState({
        status: 'success',
        message: 'Authentication successful!',
        details: 'Google Calendar is now connected with AI integration. Redirecting...',
      });

      // Add success message to chat
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `🎉 Perfect! Google Calendar is now connected with full editing permissions and AI integration for ${userEmail}. Your calendar events will sync automatically and I can now directly create, update, and manage events in your Google Calendar using natural language commands!`,
          timestamp: new Date().toISOString(),
        },
      });

      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);

      // Redirect back to main app after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);

    } catch (error) {
      console.error('❌ Composio OAuth callback processing error:', error);
      throw error;
    }
  };

  const handleGoogleOAuthCallback = async (currentUrl: string) => {
    console.log('🔍 Processing standard Google OAuth callback');
    
    setCallbackState({
      status: 'processing',
      message: 'Validating authorization code...',
    });

    // Handle the callback
    const callbackResult = oauthService.handleCallback(currentUrl);
    
    if (!callbackResult) {
      throw new Error('Failed to process OAuth callback');
    }

    const { code, state: stateParam } = callbackResult;

    setCallbackState({
      status: 'processing',
      message: 'Exchanging authorization code for access token...',
    });

    // Exchange code for tokens
    await oauthService.exchangeCodeForTokens(code, stateParam);

    setCallbackState({
      status: 'processing',
      message: 'Retrieving user information...',
    });

    // Get authenticated user email
    const userEmail = await googleCalendarService.getAuthenticatedUserEmail();
    
    if (!userEmail || userEmail === 'authenticated.user@gmail.com') {
      throw new Error('Could not retrieve valid user email from Google');
    }

    console.log('✅ Retrieved authenticated user email:', userEmail);

    setCallbackState({
      status: 'processing',
      message: 'Setting up integration...',
    });

    // Update AuthContext with successful authentication
    authDispatch({ 
      type: 'SET_AUTHENTICATED', 
      payload: { userEmail } 
    });

    // Check Composio connection status
    try {
      await checkConnectionStatus(userEmail);
      console.log('✅ Connection status checked');
    } catch (error) {
      console.warn('⚠️ Failed to check connection:', error);
      // Don't fail the entire flow if connection check fails
    }

    // Connect to server integration if available
    try {
      await googleCalendarService.connectToServerIntegration(userEmail);
      console.log('✅ Connected to server integration');
    } catch (error) {
      console.warn('⚠️ Failed to connect to server integration:', error);
      // Don't fail the entire flow if server integration fails
    }

    setCallbackState({
      status: 'success',
      message: 'Authentication successful!',
      details: 'Google Calendar is now connected. Redirecting...',
    });

    // Add success message to chat
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: Date.now().toString(),
        type: 'ai',
        content: `🎉 Google Calendar is now connected for ${userEmail}. Your calendar events will sync automatically!`,
        timestamp: new Date().toISOString(),
      },
    });

    // Redirect back to main app after a short delay
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
  };

  const getStatusIcon = () => {
    switch (callbackState.status) {
      case 'processing':
        return <Loader2 className="h-8 w-8 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-8 w-8 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-8 w-8 text-red-500" />;
    }
  };

  const getStatusColor = () => {
    switch (callbackState.status) {
      case 'processing':
        return 'border-blue-200 bg-blue-50';
      case 'success':
        return 'border-green-200 bg-green-50';
      case 'error':
        return 'border-red-200 bg-red-50';
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${
      state.isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      <div className={`max-w-md w-full rounded-xl shadow-lg border p-8 text-center ${
        state.isDarkMode 
          ? 'bg-gray-800 border-gray-700' 
          : `bg-white ${getStatusColor()}`
      }`}>
        {/* Status Icon */}
        <div className="flex justify-center mb-6">
          {getStatusIcon()}
        </div>

        {/* Status Message */}
        <h1 className={`text-xl font-semibold mb-4 ${
          state.isDarkMode ? 'text-white' : 'text-gray-900'
        }`}>
          {callbackState.message}
        </h1>

        {/* Details */}
        {callbackState.details && (
          <p className={`text-sm mb-6 ${
            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {callbackState.details}
          </p>
        )}

        {/* Progress Indicator */}
        {callbackState.status === 'processing' && (
          <div className={`w-full bg-gray-200 rounded-full h-2 ${
            state.isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
          }`}>
            <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
          </div>
        )}

        {/* Action Buttons */}
        {callbackState.status === 'error' && (
          <div className="mt-6">
            <button
              onClick={() => window.location.href = '/'}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                state.isDarkMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              Return to App
            </button>
          </div>
        )}

        {/* Debug Information (Development Only) */}
        {import.meta.env.DEV && (
          <div className={`mt-6 p-4 rounded-lg text-xs text-left ${
            state.isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
          }`}>
            <p className="font-medium mb-2">Debug Info:</p>
            <p>URL: {window.location.href}</p>
            <p>Status: {callbackState.status}</p>
            <p>User Email: {state.user?.email || 'Not available'}</p>
            <p>Timestamp: {new Date().toISOString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}