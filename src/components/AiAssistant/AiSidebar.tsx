import React, { useState, useEffect } from 'react';
import { MessageCircle, Lightbulb, Send, Mic, Sparkles, AlertCircle } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import AiSuggestionCard from './AiSuggestionCard';
import GoogleCalendarAuth from '../GoogleCalendar/GoogleCalendarAuth';
import lettaService from '../../services/lettaService';

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
  const [isLettaConnected, setIsLettaConnected] = useState(false);
  const [lettaConnectionError, setLettaConnectionError] = useState<string | null>(null);
  const [currentUserAgent, setCurrentUserAgent] = useState<string | null>(null);

  // Get the ACTUAL authenticated user email from the app state
  const getAuthenticatedUserEmail = (): string | null => {
    // First check if we have a user in state with email
    if (state.user?.email) {
      console.log('🔍 Found user email in state:', state.user.email);
      return state.user.email;
    }

    // Check if we have Google Calendar tokens which might contain user info
    try {
      const tokens = localStorage.getItem('oauth_tokens');
      if (tokens) {
        const tokenData = JSON.parse(tokens);
        console.log('🔍 Found OAuth tokens, but no user email in tokens');
      }
    } catch (error) {
      console.warn('Could not parse OAuth tokens:', error);
    }

    console.warn('⚠️ No authenticated user email found');
    return null;
  };

  // Check Letta agent connection on component mount and when user changes
  useEffect(() => {
    checkLettaConnection();
  }, [state.user?.email]);

  const checkLettaConnection = async () => {
    try {
      // Get the REAL authenticated user email
      const userEmail = getAuthenticatedUserEmail();
      
      if (!userEmail) {
        setIsLettaConnected(false);
        setLettaConnectionError('Please complete onboarding to get your personal AI agent');
        setCurrentUserAgent(null);
        return;
      }

      console.log(`🔍 Checking Letta connection for AUTHENTICATED user: ${userEmail}`);
      const isHealthy = await lettaService.healthCheck(userEmail);
      setIsLettaConnected(isHealthy);
      
      if (isHealthy) {
        // Get the user-specific agent ID
        const agentId = lettaService.getCurrentAgentId(userEmail);
        setCurrentUserAgent(agentId);
        setLettaConnectionError(null);
        console.log(`✅ Connected to user-specific agent for ${userEmail}:`, agentId);
      } else {
        // Get the specific error message from the Letta service
        const lastError = lettaService.getLastError();
        setLettaConnectionError(lastError || 'Unable to connect to your personal Letta agent');
        setCurrentUserAgent(null);
        console.warn(`❌ Failed to connect to agent for ${userEmail}`);
      }
    } catch (error) {
      setIsLettaConnected(false);
      setCurrentUserAgent(null);
      // Get the specific error message from the Letta service
      const lastError = lettaService.getLastError();
      setLettaConnectionError(lastError || 'Personal Letta agent connection failed');
      console.error(`❌ Error checking Letta connection:`, error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = chatInput.trim();
    // Get the REAL authenticated user email
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

    // Add user message with unique ID
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
      console.log(`💬 Sending message to user-specific agent for AUTHENTICATED user: ${userEmail}`);
      
      // Send message to user-specific Letta agent with CORRECT email
      const lettaResponse = await lettaService.sendMessage(userMessage, {
        events: state.events,
        preferences: state.user?.preferences,
        currentDate: new Date(),
        userEmail: userEmail, // Use the REAL authenticated email
      });

      // If Letta returned a parsed event, add it to the calendar
      if (lettaResponse.events && lettaResponse.events.length > 0) {
        lettaResponse.events.forEach(event => {
          dispatch({ type: 'ADD_EVENT', payload: event });
        });
      }

      // If Letta returned suggestions, add them
      if (lettaResponse.suggestions && lettaResponse.suggestions.length > 0) {
        lettaResponse.suggestions.forEach(suggestion => {
          dispatch({ type: 'ADD_AI_SUGGESTION', payload: suggestion });
        });
      }

      // Add assistant response with unique ID
      setTimeout(() => {
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'ai',
            content: lettaResponse.message,
            timestamp: new Date().toISOString(),
          },
        });
        setIsProcessingMessage(false);
      }, 500);

    } catch (error) {
      console.error(`Error processing message with user-specific Letta agent for ${userEmail}:`, error);
      setTimeout(() => {
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `ai_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'ai',
            content: "I'm having trouble processing that request with your personal agent right now. Please try again or check your connection to the AI assistant.",
            timestamp: new Date().toISOString(),
          },
        });
        setIsProcessingMessage(false);
      }, 500);
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

  const handleGenerateNewIdeas = async () => {
    if (!state.user?.preferences) return;

    // Get the REAL authenticated user email
    const userEmail = getAuthenticatedUserEmail();
    if (!userEmail) {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: 'Please complete onboarding first to get personalized suggestions.',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    setIsGenerating(true);

    // Clear existing suggestions
    state.aiSuggestions.forEach(suggestion => {
      dispatch({ type: 'REMOVE_AI_SUGGESTION', payload: suggestion.id });
    });

    try {
      console.log(`💡 Generating suggestions for AUTHENTICATED user: ${userEmail}`);
      
      // Generate new suggestions using user-specific Letta agent with CORRECT email
      const newSuggestions = await lettaService.generateSuggestions(
        state.events,
        state.user!.preferences,
        new Date(),
        userEmail // Use the REAL authenticated email
      );

      newSuggestions.forEach(suggestion => {
        dispatch({ type: 'ADD_AI_SUGGESTION', payload: suggestion });
      });

      // Add AI message about new suggestions with unique ID
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `ai_suggestions_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: `✨ I've generated ${newSuggestions.length} new personalized suggestions using your dedicated agent! These are tailored to your focus areas: ${state.user!.preferences.focusAreas?.join(', ') || 'your goals'}. Check them out below!`,
          timestamp: new Date().toISOString(),
        },
      });

      setIsGenerating(false);
    } catch (error) {
      console.error(`Error generating suggestions for ${userEmail}:`, error);
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `ai_error_suggestions_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: "I had trouble generating new suggestions with your personal agent. Please try again later.",
          timestamp: new Date().toISOString(),
        },
      });
      setIsGenerating(false);
    }
  };

  // Get the real authenticated user email for display
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
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <h2 className={`font-semibold ${
              state.isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Personal AI Agent
            </h2>
          </div>
          <div className="flex items-center space-x-1">
            {isLettaConnected ? (
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
        
        {/* User-Specific Agent Info - Show REAL authenticated email */}
        {displayUserEmail && (
          <div className={`mt-2 text-xs ${
            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            <div className="font-medium text-green-600">Authenticated User: {displayUserEmail}</div>
            {currentUserAgent && (
              <div>Agent: {currentUserAgent}</div>
            )}
            {isLettaConnected && (
              <div className="text-green-500 mt-1">✓ Personal agent active for {displayUserEmail}</div>
            )}
          </div>
        )}
        
        {/* Show warning if no authenticated user */}
        {!displayUserEmail && (
          <div className={`mt-2 text-xs ${
            state.isDarkMode ? 'text-red-400' : 'text-red-600'
          }`}>
            <div>⚠️ No authenticated user detected</div>
            <div>Please complete onboarding and Google Calendar authentication</div>
          </div>
        )}
        
        {/* Connection Error */}
        {lettaConnectionError && (
          <div className={`mt-3 p-3 rounded-md text-sm max-h-32 overflow-y-auto ${
            state.isDarkMode 
              ? 'bg-red-900/30 text-red-300 border border-red-800' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="whitespace-pre-wrap break-words">{lettaConnectionError}</div>
                <button 
                  onClick={checkLettaConnection}
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

      {/* Chat Messages - Constrained height with forced scroll */}
      <div className="flex-1 flex flex-col min-h-0">
        <div 
          className={`flex-1 overflow-y-auto p-4 space-y-4 ${
            state.isDarkMode ? 'scrollbar-dark' : 'scrollbar-light'
          }`}
          style={{ 
            maxHeight: 'calc(100vh - 400px)', // Force a maximum height
            minHeight: '200px' // Ensure minimum height
          }}
        >
          {state.chatMessages.length === 0 && (
            <div className={`text-center py-8 ${
              state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Start a conversation with your personal AI agent</p>
              <p className="text-xs mt-1">Try: "Schedule a workout tomorrow at 7am" or "What's my schedule today?"</p>
              {displayUserEmail && currentUserAgent && (
                <div className="text-xs mt-2 opacity-75">
                  <p>Your personal agent: {currentUserAgent}</p>
                  <p>Connected to: {displayUserEmail}</p>
                </div>
              )}
            </div>
          )}
          
          {state.chatMessages.map((message, index) => (
            <div
              key={`${message.id}_${index}`} // Use both ID and index to ensure uniqueness
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
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="text-xs opacity-70">Your personal agent is thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chat Input - Fixed at bottom */}
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
                  ? "Complete onboarding to get your personal agent..."
                  : isLettaConnected 
                    ? "Ask your personal agent to manage your calendar..." 
                    : "Personal agent is offline"
              }
              disabled={isProcessingMessage || !isLettaConnected || !displayUserEmail}
              className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                state.isDarkMode
                  ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              } ${(isProcessingMessage || !isLettaConnected || !displayUserEmail) ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {state.user?.preferences.voiceInput && (
              <button
                type="button"
                onClick={handleVoiceInput}
                disabled={isProcessingMessage || !isLettaConnected || !displayUserEmail}
                className={`p-2 rounded-lg transition-colors duration-200 ${
                  isListening
                    ? 'bg-red-500 text-white'
                    : state.isDarkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                } ${(isProcessingMessage || !isLettaConnected || !displayUserEmail) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={!chatInput.trim() || isProcessingMessage || !isLettaConnected || !displayUserEmail}
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
              <p>🔐 Complete onboarding to get your personal AI agent</p>
            ) : isLettaConnected ? (
              <p>💡 Try: "Schedule a meeting tomorrow at 2pm", "What's my schedule?", "Suggest productive tasks"</p>
            ) : (
              <p>🔌 Connect to your personal Letta agent to start managing your calendar with AI</p>
            )}
          </div>
        </div>
      </div>

      {/* AI Suggestions - Fixed at bottom */}
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
              Personal Suggestions
            </h3>
          </div>
          <button
            onClick={handleGenerateNewIdeas}
            disabled={isGenerating || !state.user?.preferences || !isLettaConnected || !displayUserEmail}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              (isGenerating || !isLettaConnected || !displayUserEmail)
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
              {!displayUserEmail ? (
                <p className="text-xs">Complete onboarding to get personal suggestions</p>
              ) : isLettaConnected ? (
                <p className="text-xs">Click "Generate" for personalized suggestions from your agent</p>
              ) : (
                <p className="text-xs">Connect to your personal agent to get AI suggestions</p>
              )}
            </div>
          ) : (
            state.aiSuggestions.slice(0, 3).map((suggestion, index) => (
              <AiSuggestionCard 
                key={`${suggestion.id}_${index}`} // Use both ID and index to ensure uniqueness
                suggestion={suggestion} 
              />
            ))
          )}
        </div>
      </div>

      {/* Google Calendar Integration - Fixed at bottom */}
      <GoogleCalendarAuth />
    </div>
  );
}