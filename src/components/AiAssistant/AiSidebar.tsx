import React, { useState, useEffect } from 'react';
import { MessageCircle, Lightbulb, Send, Mic, Sparkles, AlertCircle, Settings, Link, TestTube, Calendar, Shield, CheckCircle, Brain, Zap } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import AiSuggestionCard from './AiSuggestionCard';
import composioService from '../../services/composioService';
import { googleCalendarService } from '../../services/googleCalendarService';

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
  const [isGoogleCalendarConnected, setIsGoogleCalendarConnected] = useState(false);
  const [lastToolsUsed, setLastToolsUsed] = useState<number>(0);

  // Helper function to validate if an email is real (not a fallback)
  const isValidRealEmail = (email: string): boolean => {
    if (!email || typeof email !== 'string') return false;
    
    // Check for common fallback patterns
    const fallbackPatterns = [
      'authenticated.user@gmail.com',
      'user@example.com',
      'test@test.com',
      'demo@demo.com',
      /^user_\d+@temp\.local$/,
      /^temp_user_\d+@/,
      /^anonymous_\d+@/,
    ];

    // Check if email matches any fallback pattern
    for (const pattern of fallbackPatterns) {
      if (typeof pattern === 'string') {
        if (email === pattern) return false;
      } else {
        if (pattern.test(email)) return false;
      }
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return false;

    // Must contain a real domain (not just localhost or temp domains)
    const domain = email.split('@')[1];
    const invalidDomains = ['temp.local', 'localhost', 'example.com', 'test.com', 'demo.com'];
    if (invalidDomains.includes(domain)) return false;

    return true;
  };

  // Get the authenticated user email from the app state
  const getAuthenticatedUserEmail = (): string | null => {
    if (state.user?.email && isValidRealEmail(state.user.email)) {
      console.log('🔍 Found valid authenticated user email:', state.user.email);
      return state.user.email;
    }

    console.warn('⚠️ No valid authenticated user email found. Email:', state.user?.email);
    return null;
  };

  // Check server availability and connections
  useEffect(() => {
    checkServerAndConnections();
  }, [state.user?.email]);

  const checkServerAndConnections = async () => {
    try {
      // Check server availability
      const available = await composioService.isServerAvailable();
      setServerAvailable(available);

      // Check Google Calendar connection
      const googleConnected = googleCalendarService.isAuthenticated();
      setIsGoogleCalendarConnected(googleConnected);

      if (!available) {
        setIsComposioConnected(false);
        setComposioConnectionError('AI agent server is not available. Please start the server.');
        return;
      }

      // Get authenticated user email
      const userEmail = getAuthenticatedUserEmail();
      if (!userEmail) {
        setIsComposioConnected(false);
        setComposioConnectionError('Advanced AI agent features require email verification. Basic calendar features are available.');
        setConnectionStatus('no_valid_email');
        return;
      }

      console.log(`🔍 Checking AI agent connection for validated user: ${userEmail}`);

      // Test user's Composio connection
      const testResult = await composioService.testUserConnection(userEmail);
      
      if (testResult.success && testResult.testResult) {
        setIsComposioConnected(true);
        setConnectionStatus(testResult.testResult.connectionStatus);
        setComposioConnectionError(null);
        console.log(`✅ AI agent connection active for ${userEmail}`);
      } else {
        setIsComposioConnected(false);
        setConnectionStatus('disconnected');
        setComposioConnectionError(testResult.error || 'AI agent connection not found');
        console.warn(`❌ AI agent connection failed for ${userEmail}`);
      }
    } catch (error) {
      setIsComposioConnected(false);
      setServerAvailable(false);
      setConnectionStatus('error');
      setComposioConnectionError('Failed to check AI agent connection');
      console.error('❌ Error checking AI agent connection:', error);
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
          content: 'Advanced AI agent features require email verification. Please ensure your Google account email is properly authenticated. Basic calendar features are still available.',
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
      console.log(`🤖 Sending message to OpenAI agent for validated user: ${userEmail}`);
      
      // Send message to OpenAI agent with Composio tools
      const response = await composioService.sendMessage(userMessage, userEmail, {
        events: state.events,
        preferences: state.user?.preferences,
        currentDate: new Date(),
      });

      if (response.success && response.response) {
        // Track tools used by the agent
        if (response.response.toolsUsed) {
          setLastToolsUsed(response.response.toolsUsed);
        }

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
          // Normal AI agent response
          let aiMessage = response.response.message;
          
          // Add tool usage info if tools were used
          if (response.response.toolsUsed && response.response.toolsUsed > 0) {
            aiMessage += `\n\n🔧 *I used ${response.response.toolsUsed} Google Calendar tool${response.response.toolsUsed > 1 ? 's' : ''} to help you with this request.*`;
          }

          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'ai',
              content: aiMessage,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else {
        throw new Error(response.error || 'Failed to get AI agent response');
      }

      setIsProcessingMessage(false);
    } catch (error) {
      console.error(`Error processing message for ${userEmail}:`, error);
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `ai_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: "I'm having trouble processing that request right now. Please check your connection and try again. The AI agent might be temporarily unavailable.",
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
      setComposioConnectionError('Email verification required for AI agent features');
      return;
    }

    setIsTestingConnection(true);
    setTestResults(null);

    try {
      console.log(`🧪 Testing AI agent connection for validated user: ${userEmail}`);
      
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
            content: `🧪 AI agent connection test successful for ${userEmail}! Your OpenAI agent has access to ${result.testResult?.toolsAvailable || 0} Google Calendar tools and can intelligently decide which ones to use for your requests.`,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        setIsComposioConnected(false);
        setComposioConnectionError(result.error || 'AI agent connection test failed');
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `test_failed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'ai',
            content: `❌ AI agent connection test failed for ${userEmail}: ${result.error}. Your connections were set up during onboarding, so this might be a temporary issue.`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('❌ AI agent connection test error:', error);
      setComposioConnectionError('AI agent connection test failed');
      setTestResults({ success: false, error: error.message });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const displayUserEmail = getAuthenticatedUserEmail();
  const hasValidEmail = !!displayUserEmail;

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
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-600 rounded-full flex items-center justify-center">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <h2 className={`font-semibold ${
              state.isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              AI Calendar Agent
            </h2>
          </div>
          <div className="flex items-center space-x-1">
            {isComposioConnected && hasValidEmail ? (
              <>
                <CheckCircle className="w-3 h-3 text-green-400" />
                <span className={`text-xs ${
                  state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  Active
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3 text-red-400" />
                <span className={`text-xs ${
                  state.isDarkMode ? 'text-red-400' : 'text-red-600'
                }`}>
                  {hasValidEmail ? 'Offline' : 'Limited'}
                </span>
              </>
            )}
          </div>
        </div>
        
        {/* User Info */}
        {state.user?.email && (
          <div className={`mt-2 text-xs ${
            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            <div className={`font-medium ${hasValidEmail ? 'text-green-600' : 'text-orange-600'}`}>
              User: {state.user.email}
            </div>
            <div>Agent Status: {connectionStatus}</div>
            <div className="flex items-center space-x-2 mt-1">
              <Calendar className="h-3 w-3" />
              <span>Google Calendar: {isGoogleCalendarConnected ? 'Connected' : 'Disconnected'}</span>
              {isGoogleCalendarConnected && <Shield className="h-3 w-3 text-green-500" />}
            </div>
            {hasValidEmail ? (
              <div className="text-green-500 mt-1">✓ Email verified - AI agent with full tools access</div>
            ) : (
              <div className="text-orange-500 mt-1">⚠️ Email verification needed for AI agent</div>
            )}
            {isComposioConnected && hasValidEmail && (
              <div className="text-purple-500 mt-1">🤖 OpenAI agent with {lastToolsUsed > 0 ? `${lastToolsUsed} tools used recently` : 'Composio tools ready'}</div>
            )}
          </div>
        )}
        
        {/* Connection Error */}
        {composioConnectionError && (
          <div className={`mt-3 p-3 rounded-md text-sm max-h-32 overflow-y-auto ${
            hasValidEmail
              ? state.isDarkMode 
                ? 'bg-red-900/30 text-red-300 border border-red-800' 
                : 'bg-red-50 text-red-700 border border-red-200'
              : state.isDarkMode
                ? 'bg-orange-900/30 text-orange-300 border border-orange-800'
                : 'bg-orange-50 text-orange-700 border border-orange-200'
          }`}>
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="whitespace-pre-wrap break-words">{composioConnectionError}</div>
                <button 
                  onClick={checkServerAndConnections}
                  className={`mt-2 text-xs underline hover:no-underline ${
                    hasValidEmail
                      ? state.isDarkMode ? 'text-red-400' : 'text-red-600'
                      : state.isDarkMode ? 'text-orange-400' : 'text-orange-600'
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
              <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Chat with your intelligent AI calendar agent</p>
              <p className="text-xs mt-1">
                {hasValidEmail 
                  ? 'Powered by OpenAI with Composio Google Calendar tools'
                  : 'Email verification required for AI agent features'
                }
              </p>
              {state.user?.email && (
                <div className="text-xs mt-2 opacity-75">
                  <p>Connected as: {state.user.email}</p>
                  <p>Agent Status: {connectionStatus}</p>
                  {!hasValidEmail && (
                    <p className="text-orange-500 mt-1">⚠️ Limited features - email verification needed</p>
                  )}
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
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="text-xs opacity-70">AI agent is analyzing your request and selecting tools...</span>
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
                !state.user?.email 
                  ? "Complete onboarding to get your AI agent..."
                  : !serverAvailable
                    ? "AI agent server is offline..."
                    : !hasValidEmail
                      ? "Email verification needed for AI agent..."
                      : "Tell me what you need help with..."
              }
              disabled={isProcessingMessage || !state.user?.email || !serverAvailable}
              className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                state.isDarkMode
                  ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              } ${(isProcessingMessage || !state.user?.email || !serverAvailable) ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {state.user?.preferences.voiceInput && (
              <button
                type="button"
                onClick={handleVoiceInput}
                disabled={isProcessingMessage || !state.user?.email || !serverAvailable}
                className={`p-2 rounded-lg transition-colors duration-200 ${
                  isListening
                    ? 'bg-red-500 text-white'
                    : state.isDarkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                } ${(isProcessingMessage || !state.user?.email || !serverAvailable) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={!chatInput.trim() || isProcessingMessage || !state.user?.email || !serverAvailable}
              className="p-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          
          {/* Helper text */}
          <div className={`mt-2 text-xs ${
            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {!state.user?.email ? (
              <p>🔐 Complete onboarding to get your AI agent</p>
            ) : !serverAvailable ? (
              <p>🔌 AI agent server is offline - please start the server</p>
            ) : !hasValidEmail ? (
              <p>📧 Email verification needed for AI agent features</p>
            ) : (
              <p>🤖 Try: "What's on my calendar today?", "Schedule a meeting tomorrow", "Find me free time this week"</p>
            )}
          </div>
        </div>
      </div>

      {/* AI Agent Status */}
      <div className={`border-t p-4 flex-shrink-0 ${
        state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Zap className={`h-4 w-4 ${
              state.isDarkMode ? 'text-purple-400' : 'text-purple-500'
            }`} />
            <h3 className={`text-sm font-medium ${
              state.isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              AI Agent Status
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
            {/* Test Connection Button */}
            {state.user?.email && (
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
                <span>{isTestingConnection ? 'Testing...' : 'Test AI Agent'}</span>
              </button>
            )}

            {/* Test Results */}
            {testResults && (
              <div className={`p-3 rounded-lg text-xs ${
                state.isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-100 border border-gray-300'
              }`}>
                <div className="font-medium mb-2">AI Agent Test Results:</div>
                <pre className={`text-xs overflow-auto max-h-32 ${
                  state.isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  {JSON.stringify(testResults, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Agent Status */}
        <div className={`text-xs p-2 rounded-lg ${
          isComposioConnected && hasValidEmail
            ? state.isDarkMode ? 'bg-purple-900 bg-opacity-20 text-purple-400' : 'bg-purple-50 text-purple-600'
            : hasValidEmail
              ? state.isDarkMode ? 'bg-yellow-900 bg-opacity-20 text-yellow-400' : 'bg-yellow-50 text-yellow-600'
              : state.isDarkMode ? 'bg-orange-900 bg-opacity-20 text-orange-400' : 'bg-orange-50 text-orange-600'
        }`}>
          <div className="flex items-center space-x-1 mb-1">
            <Brain className="h-3 w-3" />
            <span className="font-medium">
              {isComposioConnected && hasValidEmail ? 'AI Agent Active' : 
               hasValidEmail ? 'Agent Connection Issue' : 'Email Verification Needed'}
            </span>
          </div>
          <p>
            {isComposioConnected && hasValidEmail
              ? `Your OpenAI agent (${displayUserEmail}) has access to Google Calendar tools and can intelligently decide which ones to use for your requests.`
              : hasValidEmail
                ? `Your AI agent was set up during onboarding. If you're seeing this message, there might be a temporary server issue.`
                : `Email verification is required for the AI agent with Google Calendar tools. Basic calendar features are available.`
            }
          </p>
          {lastToolsUsed > 0 && isComposioConnected && hasValidEmail && (
            <p className="mt-1 text-xs opacity-75">
              🔧 Last interaction used {lastToolsUsed} calendar tool{lastToolsUsed > 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* AI Suggestions */}
      <div className={`border-t p-4 flex-shrink-0 ${
        state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Lightbulb className={`h-4 w-4 ${
              state.isDarkMode ? 'text-yellow-400' : 'text-yellow-500'
            }`} />
            <h3 className={`text-sm font-medium ${
              state.isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              AI Suggestions
            </h3>
          </div>
          <button
            onClick={() => setIsGenerating(!isGenerating)}
            disabled={isGenerating || !state.user?.preferences}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              (isGenerating)
                ? 'opacity-50 cursor-not-allowed'
                : state.isDarkMode
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-purple-500 text-white hover:bg-purple-600'
            }`}
          >
            <Sparkles className={`h-3 w-3 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Generating...' : 'Generate'}</span>
          </button>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {state.aiSuggestions.length === 0 ? (
            <div className={`text-center py-4 ${
              state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              <Lightbulb className="h-6 w-6 mx-auto mb-2 opacity-50" />
              <p className="text-xs">Click "Generate" for personalized suggestions</p>
            </div>
          ) : (
            state.aiSuggestions.slice(0, 3).map((suggestion, index) => (
              <AiSuggestionCard 
                key={`${suggestion.id}_${index}`}
                suggestion={suggestion} 
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}