import React, { useState } from 'react';
import { MessageCircle, Lightbulb, Send, Mic, X, Sparkles } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import AiSuggestionCard from './AiSuggestionCard';
import GoogleCalendarAuth from '../GoogleCalendar/GoogleCalendarAuth';
import { generatePersonalizedSuggestions } from '../../utils/aiUtils';

export default function AiSidebar() {
  const { state, dispatch } = useApp();
  const [chatInput, setChatInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    // Add user message
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: Date.now().toString(),
        type: 'user',
        content: chatInput,
        timestamp: new Date().toISOString(),
      },
    });

    // Simulate AI response
    setTimeout(() => {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          content: `I understand you want to ${chatInput}. Let me help you optimize your schedule. I'll suggest the best time slots based on your productivity patterns.`,
          timestamp: new Date().toISOString(),
        },
      });
    }, 1000);

    setChatInput('');
  };

  const handleVoiceInput = () => {
    if (!state.user?.preferences.voiceInput) return;
    
    setIsListening(!isListening);
    
    if ('webkitSpeechRecognition' in window) {
      const recognition = new (window as any).webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
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

  const handleGenerateNewIdeas = () => {
    if (!state.user?.preferences) return;

    setIsGenerating(true);

    // Clear existing suggestions
    state.aiSuggestions.forEach(suggestion => {
      dispatch({ type: 'REMOVE_AI_SUGGESTION', payload: suggestion.id });
    });

    // Generate new personalized suggestions
    setTimeout(() => {
      const newSuggestions = generatePersonalizedSuggestions(
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
    }, 1500);
  };

  return (
    <div className={`w-80 h-full border-r flex flex-col ${
      state.isDarkMode 
        ? 'bg-gray-900 border-gray-700' 
        : 'bg-gray-50 border-gray-200'
    }`}>
      {/* Header */}
      <div className={`p-4 border-b ${
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
              AI Assistant
            </h2>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className={`text-xs ${
              state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Online
            </span>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {state.chatMessages.length === 0 && (
          <div className={`text-center py-8 ${
            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Start a conversation with your AI assistant</p>
            <p className="text-xs mt-1">Ask about scheduling, productivity tips, or task management</p>
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
              <p className="text-sm">{message.content}</p>
              <p className={`text-xs mt-1 opacity-70`}>
                {new Date(message.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Chat Input */}
      <div className={`p-4 border-t ${
        state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <form onSubmit={handleSendMessage} className="flex space-x-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type your message here..."
            className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              state.isDarkMode
                ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400'
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
            }`}
          />
          {state.user?.preferences.voiceInput && (
            <button
              type="button"
              onClick={handleVoiceInput}
              className={`p-2 rounded-lg transition-colors duration-200 ${
                isListening
                  ? 'bg-red-500 text-white'
                  : state.isDarkMode
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              <Mic className="h-4 w-4" />
            </button>
          )}
          <button
            type="submit"
            disabled={!chatInput.trim()}
            className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* AI Suggestions */}
      <div className={`border-t p-4 ${
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
              New Ideas
            </h3>
          </div>
          <button
            onClick={handleGenerateNewIdeas}
            disabled={isGenerating || !state.user?.preferences}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              isGenerating
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

        <div className="space-y-2">
          {state.aiSuggestions.length === 0 ? (
            <div className={`text-center py-4 ${
              state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              <Lightbulb className="h-6 w-6 mx-auto mb-2 opacity-50" />
              <p className="text-xs">Click "Generate" for personalized suggestions</p>
            </div>
          ) : (
            state.aiSuggestions.slice(0, 3).map((suggestion) => (
              <AiSuggestionCard key={suggestion.id} suggestion={suggestion} />
            ))
          )}
        </div>
      </div>

      {/* Google Calendar Integration */}
      <GoogleCalendarAuth />
    </div>
  );
}