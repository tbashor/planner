import React, { useState, useEffect } from 'react';
import { MessageCircle, Lightbulb, Send, Mic, Sparkles, AlertCircle, Settings, Link, TestTube } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import AiSuggestionCard from './AiSuggestionCard';
import GoogleCalendarAuth from '../GoogleCalendar/GoogleCalendarAuth';
import composioService from '../../services/composioService';

// Extend Window interface for webkit speech recognition
declare global {
  interface Window {
    webkitSpeechRecognition: new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void;
      onerror: () => void;
      start: () => void;
    };
  }
}

export default function AiSidebar() {
  const { state, dispatch } = useApp();
  const [chatInput, setChatInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessingMessage, setIsProcessingMessage] = useState(false);
  const [isComposioConnected, setIsComposioConnected] = useState(false);
  const [composioConnectionError, setComposioConnectionError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('unknown');
  const [showComposioSettings, setShowComposioSettings] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);

  // Get the ACTUAL authenticated user email from the app state
  const getAuthenticatedUserEmail = (): string | null => {
    if (state.user?.email) {
      console.log('🔍 Found authenticated user email:', state.user.email);
      return state.user.email;
    }

    console.warn('⚠️ No authenticated user email found');
    return null;
  };

  // Check server availability and Composio connection
  useEffect(() => {
    checkServerAndConnection();
  }, [state.user?.email]);

  const checkServerAndConnection = async () => {
    try {
      // Check server availability
      const available = await composioService.isServerAvailable();
      setServerAvailable(available);

      if (!available) {
        setIsComposioConnected(false);
        setComposioConnectionError('Composio server is not available. Please start the server.');
        return;
      }

      // Get authenticated user email
      const userEmail = getAuthenticatedUserEmail();
      if (!userEmail) {
        setIsComposioConnected(false);
        setComposioConnectionError('Please complete onboarding to get your personal AI assistant');
        setConnectionStatus('no_user');
        return;
      }

      console.log(`🔍 Checking Composio connection for user: ${userEmail}`);

      // Test user's Composio connection
      const testResult = await composioService.testUserConnection(userEmail);
      
      if (testResult.success && testResult.testResult) {
        setIsComposioConnected(true);
        setConnectionStatus(testResult.testResult.connectionStatus);
        setComposioConnectionError(null);
        console.log(`✅ Composio connection active for ${userEmail}`);
      } else {
        setIsComposioConnected(false);
        setConnectionStatus('disconnected');
        setComposioConnectionError(testResult.error || 'Composio connection not found');
        console.warn(`❌ Composio connection failed for ${userEmail}`);
      }
    } catch (error) {
      setIsComposioConnected(false);
      setServerAvailable(false);
      setConnectionStatus('error');
      setComposioConnectionError('Failed to check Composio connection');
      console.error('❌ Error checking Composio connection:', error);
    }
  };

  const handleSetupConnection = async () => {
    const userEmail = getAuthenticatedUserEmail();
    if (!userEmail) {
      setComposioConnectionError('Please complete onboarding first');
      return;
    }

    try {
      console.log(`🔗 Setting up Composio connection for ${userEmail}`);
      setComposioConnectionError(null);

      const result = await composioService.setupUserConnection(userEmail);
      
      if (result.success) {
        if (result.redirectUrl) {
          // User needs to authenticate with Google Calendar
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `composio_setup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'ai',
              content: `🔗 Great! I've set up your personal Composio entity. Please complete the Google Calendar authentication using this link: ${result.redirectUrl}

Once you've authenticated, I'll be able to manage your Google Calendar directly using AI commands!`,
              timestamp: new Date().toISOString(),
            },
          });

          // Open the redirect URL
          window.open(result.redirectUrl, '_blank');
        } else {
          // Connection already exists
          setIsComposioConnected(true);
          setConnectionStatus(result.status || 'active');
          
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `composio_ready_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'ai',
              content: `🎉 Perfect! Your Composio connection is already active. I can now manage your Google Calendar using AI commands. Try asking me to "schedule a meeting tomorrow at 2pm" or "what's on my calendar today?"`,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else {
        setComposioConnectionError(result.error || 'Failed to setup Composio connection');
      }
    } catch (error) {
      console.error('❌ Error setting up Composio connection:', error);
      setComposioConnectionError('Failed to setup Composio connection');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = chatInput.trim();
    const userEmail = getAuthenticatedUserEmail();

    if (!userEmail) {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: 'Please complete onboarding first to get your personal AI assistant.',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    setIsProcessingMessage(true);

    // Add user message
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
      },
    });

    setChatInput('');

    try {
      console.log(`💬 Sending message to Composio AI for user: ${userEmail}`);
      
      // Send message to Composio + OpenAI service
      const response = await composioService.sendMessage(userMessage, userEmail, {
        events: state.events,
        preferences: state.user?.preferences,
        currentDate: new Date(),
      });

      if (response.success && response.response) {
        // Check if user needs to setup connection
        if (response.response.needsConnection) {
          if (response.response.redirectUrl) {
            // Add message with redirect URL
            dispatch({
              type: 'ADD_CHAT_MESSAGE',
              payload: {
                id: `ai_redirect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'ai',
                content: `${response.response.message}\n\nClick here to authenticate: ${response.response.redirectUrl}`,
                timestamp: new Date().toISOString(),
              },
            });
          } else {
            // Add message suggesting connection setup
            dispatch({
              type: 'ADD_CHAT_MESSAGE',
              payload: {
                id: `ai_setup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'ai',
                content: response.response.message,
                timestamp: new Date().toISOString(),
              },
            });
          }
        } else {
          // Normal AI response
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'ai',
              content: response.response.message,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else {
        throw new Error(response.error || 'Failed to get AI response');
      }

      setIsProcessingMessage(false);
    } catch (error) {
      console.error(`Error processing message for ${userEmail}:`, error);
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `ai_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: "I'm having trouble processing that request right now. Please check your Composio connection and try again.",
          timestamp: new Date().toISOString(),
        },
      });
      setIsProcessingMessage(false);
    }
  };

  const handleVoiceInput = () => {
    if (!state.user?.preferences.voiceInput) return;
    
    setIsListening(!isListening);
    
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setChatInput(transcript);
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.start();
    }
  };

  const handleTestConnection = async () => {
    const userEmail = getAuthenticatedUserEmail();
    if (!userEmail) {
      setComposioConnectionError('Please complete onboarding first');
      return;
    }

    setIsTestingConnection(true);
    setTestResults(null);

    try {
      console.log(`🧪 Testing Composio connection for ${userEmail}`);
      
      const result = await composioService.testUserConnection(userEmail);
      setTestResults(result);
      
      if (result.success) {
        setIsComposioConnected(true);
        setConnectionStatus(result.testResult?.connectionStatus || 'active');
        setComposioConnectionError(null);
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `test_success_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'ai',
            content: `🧪 Connection test successful! Your Composio integration is working perfectly. I have access to ${result.testResult?.toolsAvailable || 0} Google Calendar tools for managing your calendar.`,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        setIsComposioConnected(false);
        setComposioConnectionError(result.error || 'Connection test failed');
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `test_failed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'ai',
            content: `❌ Connection test failed: ${result.error}. Please setup your Composio connection first.`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('❌ Connection test error:', error);
      setComposioConnectionError('Connection test failed');
      setTestResults({ success: false, error: error.message });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const displayUserEmail = getAuthenticatedUserEmail();

  return (
    <div className={`w-80 h-full border-r flex flex-col ${
      state.isDarkMode 
        ? 'bg-gray-900 border-gray-700' 
        : 'bg-gray-50 border-gray-200'
    }`}>
      {/* Header */}
      <div className={`p-4 border-b flex-shrink-0 ${
        state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-600 rounded-full flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <h2 className={`font-semibold ${
              state.isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              AI Calendar Assistant
            </h2>
          </div>
          <div className="flex items-center space-x-1">
            {isComposioConnected ? (
              <>
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className={`text-xs ${
                  state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  Connected
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3 text-red-400" />
                <span className={`text-xs ${
                  state.isDarkMode ? 'text-red-400' : 'text-red-600'
                }`}>
                  Disconnected
                </span>
              </>
            )}
          </div>
        </div>
        
        {/* User Info */}
        {displayUserEmail && (
          <div className={`mt-2 text-xs ${
            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            <div className="font-medium text-green-600">User: {displayUserEmail}</div>
            <div>Status: {connectionStatus}</div>
            {isComposioConnected && (
              <div className="text-green-500 mt-1">✓ Composio + OpenAI integration active</div>
            )}
          </div>
        )}
        
        {/* Connection Error */}
        {composioConnectionError && (
          <div className={`mt-3 p-3 rounded-md text-sm max-h-32 overflow-y-auto ${
            state.isDarkMode 
              ? 'bg-red-900/30 text-red-300 border border-red-800' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="whitespace-pre-wrap break-words">{composioConnectionError}</div>
                <button 
                  onClick={checkServerAndConnection}
                  className={`mt-2 text-xs underline hover:no-underline ${
                    state.isDarkMode ? 'text-red-400' : 'text-red-600'
                  }`}
                >
                  Retry connection
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Messages */}
      <div className="flex-1 flex flex-col min-h-0">
        <div 
          className={`flex-1 overflow-y-auto p-4 space-y-4 ${
            state.isDarkMode ? 'scrollbar-dark' : 'scrollbar-light'
          }`}
          style={{ 
            maxHeight: 'calc(100vh - 500px)',
            minHeight: '200px'
          }}
        >
          {state.chatMessages.length === 0 && (
            <div className={`text-center py-8 ${
              state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Start a conversation with your AI calendar assistant</p>
              <p className="text-xs mt-1">Powered by Composio + OpenAI for direct Google Calendar management</p>
              {displayUserEmail && (
                <div className="text-xs mt-2 opacity-75">
                  <p>Connected as: {displayUserEmail}</p>
                  <p>Status: {connectionStatus}</p>
                </div>
              )}
            </div>
          )}
          
          {state.chatMessages.map((message, index) => (
            <div
              key={`${message.id}_${index}`}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  message.type === 'user'
                    ? 'bg-blue-500 text-white'
                    : state.isDarkMode
                    ? 'bg-gray-800 text-gray-200'
                    : 'bg-white text-gray-900 border border-gray-200'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                <p className={`text-xs mt-1 opacity-70`}>
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {/* Processing indicator */}
          {isProcessingMessage && (
            <div className="flex justify-start">
              <div className={`max-w-[80%] p-3 rounded-lg ${
                state.isDarkMode
                  ? 'bg-gray-800 text-gray-200'
                  : 'bg-white text-gray-900 border border-gray-200'
              }`}>
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="text-xs opacity-70">AI is processing your calendar request...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className={`p-4 border-t flex-shrink-0 ${
          state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <form onSubmit={handleSendMessage} className="flex space-x-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={
                !displayUserEmail 
                  ? "Complete onboarding to get your AI assistant..."
                  : !serverAvailable
                    ? "Server is offline..."
                    : "Ask me to manage your Google Calendar..."
              }
              disabled={isProcessingMessage || !displayUserEmail || !serverAvailable}
              className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                state.isDarkMode
                  ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              } ${(isProcessingMessage || !displayUserEmail || !serverAvailable) ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {state.user?.preferences.voiceInput && (
              <button
                type="button"
                onClick={handleVoiceInput}
                disabled={isProcessingMessage || !displayUserEmail || !serverAvailable}
                className={`p-2 rounded-lg transition-colors duration-200 ${
                  isListening
                    ? 'bg-red-500 text-white'
                    : state.isDarkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                } ${(isProcessingMessage || !displayUserEmail || !serverAvailable) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={!chatInput.trim() || isProcessingMessage || !displayUserEmail || !serverAvailable}
              className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          
          {/* Helper text */}
          <div className={`mt-2 text-xs ${
            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {!displayUserEmail ? (
              <p>🔐 Complete onboarding to get your AI assistant</p>
            ) : !serverAvailable ? (
              <p>🔌 Server is offline - please start the server</p>
            ) : (
              <p>💡 Try: "Schedule a meeting tomorrow at 2pm", "What's on my calendar?", "Create a workout session"</p>
            )}
          </div>
        </div>
      </div>

      {/* Composio Settings */}
      <div className={`border-t p-4 flex-shrink-0 ${
        state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Link className={`h-4 w-4 ${
              state.isDarkMode ? 'text-green-400' : 'text-green-500'
            }`} />
            <h3 className={`text-sm font-medium ${
              state.isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Composio Integration
            </h3>
          </div>
          <button
            onClick={() => setShowComposioSettings(!showComposioSettings)}
            className={`p-1 rounded transition-colors ${
              state.isDarkMode
                ? 'text-gray-400 hover:bg-gray-700 hover:text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Settings className="h-3 w-3" />
          </button>
        </div>

        {showComposioSettings && (
          <div className="space-y-3 mb-3">
            {/* Setup Connection Button */}
            {displayUserEmail && !isComposioConnected && (
              <button
                onClick={handleSetupConnection}
                disabled={!serverAvailable}
                className={`w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-200 ${
                  !serverAvailable
                    ? 'opacity-50 cursor-not-allowed'
                    : state.isDarkMode
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-green-500 text-white hover:bg-green-600'
                }`}
              >
                <Link className="h-3 w-3" />
                <span>Setup Composio Connection</span>
              </button>
            )}

            {/* Test Connection Button */}
            {displayUserEmail && (
              <button
                onClick={handleTestConnection}
                disabled={isTestingConnection || !serverAvailable}
                className={`w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-200 ${
                  isTestingConnection || !serverAvailable
                    ? 'opacity-50 cursor-not-allowed'
                    : state.isDarkMode
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-purple-500 text-white hover:bg-purple-600'
                }`}
              >
                <TestTube className={`h-3 w-3 ${isTestingConnection ? 'animate-spin' : ''}`} />
                <span>{isTestingConnection ? 'Testing...' : 'Test Connection'}</span>
              </button>
            )}

            {/* Test Results */}
            {testResults && (
              <div className={`p-3 rounded-lg text-xs ${
                state.isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-100 border border-gray-300'
              }`}>
                <div className="font-medium mb-2">Test Results:</div>
                <pre className={`text-xs overflow-auto max-h-32 ${
                  state.isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  {JSON.stringify(testResults, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Connection Status */}
        <div className={`text-xs p-2 rounded-lg ${
          isComposioConnected
            ? state.isDarkMode ? 'bg-green-900 bg-opacity-20 text-green-400' : 'bg-green-50 text-green-600'
            : state.isDarkMode ? 'bg-yellow-900 bg-opacity-20 text-yellow-400' : 'bg-yellow-50 text-yellow-600'
        }`}>
          <div className="flex items-center space-x-1 mb-1">
            <Link className="h-3 w-3" />
            <span className="font-medium">
              {isComposioConnected ? 'Composio Connected' : 'Setup Required'}
            </span>
          </div>
          <p>
            {isComposioConnected 
              ? `Your Google Calendar is connected via Composio. I can create, update, and manage events using AI commands.`
              : `Connect your Google Calendar through Composio to enable AI-powered calendar management.`
            }
          </p>
        </div>
      </div>

      {/* Google Calendar Integration */}
      <GoogleCalendarAuth />
    </div>
  );
}