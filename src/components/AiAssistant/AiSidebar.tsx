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

  // Check Letta agent connection on component mount
  useEffect(() => {
    checkLettaConnection();
  }, []);

  const checkLettaConnection = async () => {
    try {
      const isHealthy = await lettaService.healthCheck();
      setIsLettaConnected(isHealthy);
      setLettaConnectionError(isHealthy ? null : 'Unable to connect to Letta agent');
    } catch {
      setIsLettaConnected(false);
      setLettaConnectionError('Letta agent connection failed');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = chatInput.trim();
    setIsProcessingMessage(true);

    // Add user message
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: Date.now().toString(),
        type: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
      },
    });

    setChatInput('');

    try {
      // Send message to Letta agent
      const lettaResponse = await lettaService.sendMessage(userMessage, {
        events: state.events,
        preferences: state.user?.preferences,
        currentDate: new Date(),
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

      // Add assistant response
      setTimeout(() => {
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: (Date.now() + 1).toString(),
            type: 'ai',
            content: lettaResponse.message,
            timestamp: new Date().toISOString(),
          },
        });
        setIsProcessingMessage(false);
      }, 500);

    } catch (error) {
      console.error('Error processing message with Letta:', error);
      setTimeout(() => {
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: (Date.now() + 1).toString(),
            type: 'ai',
            content: "I'm having trouble processing that request right now. Please try again or check your connection to the AI assistant.",
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

    setIsGenerating(true);

    // Clear existing suggestions
    state.aiSuggestions.forEach(suggestion => {
      dispatch({ type: 'REMOVE_AI_SUGGESTION', payload: suggestion.id });
    });

    try {
      // Generate new suggestions using Letta agent
      const newSuggestions = await lettaService.generateSuggestions(
        state.events,
        state.user!.preferences,
        new Date()
      );

      newSuggestions.forEach(suggestion => {
        dispatch({ type: 'ADD_AI_SUGGESTION', payload: suggestion });
      });

      // Add AI message about new suggestions
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `✨ I've generated ${newSuggestions.length} new personalized suggestions based on your preferences! These are tailored to your focus areas: ${state.user!.preferences.focusAreas?.join(', ') || 'your goals'}. Check them out below!`,
          timestamp: new Date().toISOString(),
        },
      });

      setIsGenerating(false);
    } catch (error) {
      console.error('Error generating suggestions:', error);
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: "I had trouble generating new suggestions. Please try again later.",
          timestamp: new Date().toISOString(),
        },
      });
      setIsGenerating(false);
    }
  };

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
              Letta Assistant
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
        
        {/* Connection Error */}
        {lettaConnectionError && (
          <div className={`mt-2 p-2 rounded-md text-xs ${
            state.isDarkMode 
              ? 'bg-red-900/30 text-red-400 border border-red-800' 
              : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            <div className="flex items-center space-x-1">
              <AlertCircle className="w-3 h-3" />
              <span>Letta agent offline</span>
            </div>
            <button 
              onClick={checkLettaConnection}
              className="mt-1 text-xs underline hover:no-underline"
            >
              Retry connection
            </button>
          </div>
        )}
      </div>

      {/* Chat Messages - Fixed height with scroll */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {state.chatMessages.length === 0 && (
            <div className={`text-center py-8 ${
              state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Start a conversation with your Letta assistant</p>
              <p className="text-xs mt-1">Try: "Schedule a workout tomorrow at 7am" or "What's my schedule today?"</p>
            </div>
          )}
          
          {state.chatMessages.map((message) => (
            <div
              key={message.id}
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
                  <span className="text-xs opacity-70">Letta is thinking...</span>
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
              placeholder={isLettaConnected ? "Ask Letta to manage your calendar..." : "Letta agent is offline"}
              disabled={isProcessingMessage || !isLettaConnected}
              className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                state.isDarkMode
                  ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              } ${(isProcessingMessage || !isLettaConnected) ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {state.user?.preferences.voiceInput && (
              <button
                type="button"
                onClick={handleVoiceInput}
                disabled={isProcessingMessage || !isLettaConnected}
                className={`p-2 rounded-lg transition-colors duration-200 ${
                  isListening
                    ? 'bg-red-500 text-white'
                    : state.isDarkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                } ${(isProcessingMessage || !isLettaConnected) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={!chatInput.trim() || isProcessingMessage || !isLettaConnected}
              className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          
          {/* Helper text */}
          <div className={`mt-2 text-xs ${
            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {isLettaConnected ? (
              <p>💡 Try: "Schedule a meeting tomorrow at 2pm", "What's my schedule?", "Suggest productive tasks"</p>
            ) : (
              <p>🔌 Connect to Letta agent to start managing your calendar with AI</p>
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
              Letta Suggestions
            </h3>
          </div>
          <button
            onClick={handleGenerateNewIdeas}
            disabled={isGenerating || !state.user?.preferences || !isLettaConnected}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              (isGenerating || !isLettaConnected)
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
              {isLettaConnected ? (
                <p className="text-xs">Click "Generate" for personalized suggestions from Letta</p>
              ) : (
                <p className="text-xs">Connect to Letta agent to get AI suggestions</p>
              )}
            </div>
          ) : (
            state.aiSuggestions.slice(0, 3).map((suggestion) => (
              <AiSuggestionCard key={suggestion.id} suggestion={suggestion} />
            ))
          )}
        </div>
      </div>

      {/* Google Calendar Integration - Fixed at bottom */}
      <GoogleCalendarAuth />
    </div>
  );
}