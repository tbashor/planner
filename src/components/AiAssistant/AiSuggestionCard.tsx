import React from 'react';
import { Check, X, Clock, Zap, Target, Coffee } from 'lucide-react';
import { AiSuggestion } from '../../types';
import { useApp } from '../../contexts/AppContext';

interface AiSuggestionCardProps {
  suggestion: AiSuggestion;
}

export default function AiSuggestionCard({ suggestion }: AiSuggestionCardProps) {
  const { state, dispatch } = useApp();

  const getIcon = (type: string) => {
    switch (type) {
      case 'schedule':
        return <Clock className="h-4 w-4" />;
      case 'break':
        return <Coffee className="h-4 w-4" />;
      case 'optimize':
        return <Zap className="h-4 w-4" />;
      default:
        return <Target className="h-4 w-4" />;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'schedule':
        return 'bg-blue-500';
      case 'break':
        return 'bg-green-500';
      case 'optimize':
        return 'bg-yellow-500';
      default:
        return 'bg-purple-500';
    }
  };

  const handleAccept = () => {
    // Implement AI suggestion acceptance logic
    dispatch({ type: 'REMOVE_AI_SUGGESTION', payload: suggestion.id });
    
    // Add motivational message
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: Date.now().toString(),
        type: 'ai',
        content: `Great choice! I've applied the suggestion: "${suggestion.title}". Your schedule has been optimized.`,
        timestamp: new Date().toISOString(),
      },
    });
  };

  const handleReject = () => {
    dispatch({ type: 'REMOVE_AI_SUGGESTION', payload: suggestion.id });
  };

  return (
    <div className={`p-3 rounded-lg border transition-all duration-200 hover:shadow-md ${
      state.isDarkMode
        ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
        : 'bg-white border-gray-200 hover:border-gray-300'
    }`}>
      <div className="flex items-start space-x-3">
        <div className={`${getColor(suggestion.type)} p-1.5 rounded-lg text-white flex-shrink-0`}>
          {getIcon(suggestion.type)}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={`text-sm font-medium mb-1 ${
            state.isDarkMode ? 'text-white' : 'text-gray-900'
          }`}>
            {suggestion.title}
          </h4>
          <p className={`text-xs ${
            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {suggestion.description}
          </p>
        </div>
      </div>
      
      <div className="flex justify-end space-x-1 mt-3">
        <button
          onClick={handleReject}
          className={`p-1.5 rounded-md hover:bg-opacity-80 transition-colors duration-200 ${
            state.isDarkMode
              ? 'text-gray-400 hover:bg-gray-700'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <X className="h-3 w-3" />
        </button>
        <button
          onClick={handleAccept}
          className="p-1.5 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-200"
        >
          <Check className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}