import React, { useState } from 'react';
import { Lightbulb, Sparkles, ChevronDown, ChevronUp, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import AiSuggestionCard from './AiSuggestionCard';
import { generatePersonalizedSuggestions } from '../../utils/aiUtils';

export default function AiSuggestions() {
  const { state, dispatch } = useApp();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleGenerateSuggestions = async () => {
    if (!state.user?.preferences) return;
    
    setIsGenerating(true);
    
    // Clear existing suggestions
    state.aiSuggestions.forEach(suggestion => {
      dispatch({ type: 'REMOVE_AI_SUGGESTION', payload: suggestion.id });
    });

    // Generate new suggestions
    const newSuggestions = generatePersonalizedSuggestions(
      state.events,
      state.user.preferences,
      new Date()
    );

    // Add new suggestions with a slight delay for better UX
    setTimeout(() => {
      newSuggestions.forEach(suggestion => {
        dispatch({ type: 'ADD_AI_SUGGESTION', payload: suggestion });
      });
      setIsGenerating(false);
    }, 1000);
  };

  const scrollLeft = () => {
    const container = document.getElementById('suggestions-container');
    if (container) {
      container.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    const container = document.getElementById('suggestions-container');
    if (container) {
      container.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  return (
    <div className={`w-full transition-all duration-300 ease-in-out ${
      state.isDarkMode ? 'bg-gray-900' : 'bg-white'
    } ${isExpanded ? 'h-auto' : 'h-auto'}`}>
      {/* Header */}
      <div className={`p-4 border-b flex items-center justify-between flex-shrink-0 ${
        state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <Lightbulb className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className={`font-semibold ${
              state.isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              AI Suggestions
            </h2>
            <p className={`text-xs ${
              state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Personalized recommendations
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleGenerateSuggestions}
            disabled={isGenerating || !state.user?.preferences}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              isGenerating || !state.user?.preferences
                ? 'opacity-50 cursor-not-allowed'
                : state.isDarkMode
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-purple-500 text-white hover:bg-purple-600'
            }`}
          >
            <Sparkles className={`h-3 w-3 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Generating...' : 'Generate'}</span>
          </button>
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`p-1.5 rounded-lg transition-colors ${
              state.isDarkMode
                ? 'text-gray-400 hover:bg-gray-700 hover:text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Suggestions Content - with proper height management */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
        isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
      }`}>
        <div className="p-4">
          {state.aiSuggestions.length === 0 ? (
            <div className={`text-center py-8 ${
              state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
                <Zap className="h-8 w-8 text-white" />
              </div>
              <p className="text-sm font-medium mb-2">No suggestions yet</p>
              <p className="text-xs">
                {!state.user?.preferences 
                  ? 'Complete onboarding to get personalized suggestions'
                  : 'Click "Generate" for AI-powered recommendations'
                }
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Scroll buttons */}
              {state.aiSuggestions.length > 1 && (
                <>
                  <button
                    onClick={scrollLeft}
                    className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full shadow-lg transition-all duration-200 ${
                      state.isDarkMode
                        ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
                        : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                    }`}
                    style={{ marginLeft: '-12px' }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={scrollRight}
                    className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full shadow-lg transition-all duration-200 ${
                      state.isDarkMode
                        ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
                        : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                    }`}
                    style={{ marginRight: '-12px' }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}

              {/* Horizontal scrolling container with proper height */}
              <div
                id="suggestions-container"
                className="flex space-x-3 overflow-x-auto scrollbar-hide py-2"
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  height: 'auto',
                  minHeight: '200px', // Ensure enough height for full cards
                }}
              >
                {state.aiSuggestions.map((suggestion, index) => (
                  <div
                    key={`${suggestion.id}_${index}`}
                    className="flex-shrink-0 w-80"
                  >
                    <AiSuggestionCard suggestion={suggestion} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}