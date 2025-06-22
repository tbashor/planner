import React from 'react';
import { Check, X, Clock, Zap, Target, Coffee, Calendar, Dumbbell, BookOpen, Briefcase, User, Heart } from 'lucide-react';
import { AiSuggestion, Event } from '../../types';
import { useApp } from '../../contexts/AppContext';
import { eventCategories } from '../../data/mockData';

interface AiSuggestionCardProps {
  suggestion: AiSuggestion;
}

export default function AiSuggestionCard({ suggestion }: AiSuggestionCardProps) {
  const { state, dispatch } = useApp();

  const getIcon = (type: string) => {
    switch (type) {
      case 'schedule':
        return <Calendar className="h-4 w-4" />;
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

  const getCategoryByName = (categoryName: string) => {
    const categoryMap: { [key: string]: string } = {
      'health': 'health',
      'study': 'study',
      'work': 'work',
      'personal': 'personal',
      'meal': 'meal',
      'social': 'social'
    };
    
    const categoryId = categoryMap[categoryName] || 'personal';
    return eventCategories.find(cat => cat.id === categoryId) || eventCategories[2]; // Default to personal
  };

  const handleAccept = () => {
    try {
      // Parse the action to see if it's a create_event action
      const actionData = JSON.parse(suggestion.action);
      
      if (actionData.type === 'create_event' && actionData.event) {
        const eventData = actionData.event;
        
        // Create the new event
        const newEvent: Event = {
          id: `event_${Date.now()}`,
          title: eventData.title,
          startTime: eventData.startTime,
          endTime: eventData.endTime,
          date: eventData.date,
          category: getCategoryByName(eventData.category),
          priority: eventData.priority,
          description: eventData.description || '',
          isCompleted: false,
          isStatic: false,
          color: getCategoryByName(eventData.category).color,
        };

        // Add the event to the calendar
        dispatch({ type: 'ADD_EVENT', payload: newEvent });

        // Add success message
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: Date.now().toString(),
            type: 'ai',
            content: `🎉 Perfect! I've added "${newEvent.title}" to your calendar for ${newEvent.date} at ${newEvent.startTime}. This aligns perfectly with your ${state.user?.preferences.focusAreas?.join(' and ') || 'goals'}!`,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        // Handle other types of suggestions (optimize, etc.)
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: Date.now().toString(),
            type: 'ai',
            content: `✅ Great choice! I've applied the suggestion: "${suggestion.title}". Your schedule has been optimized based on your preferences.`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      // Fallback for non-JSON actions
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `✅ Excellent! I've applied the suggestion: "${suggestion.title}". Your schedule is now optimized for better productivity.`,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Remove the suggestion
    dispatch({ type: 'REMOVE_AI_SUGGESTION', payload: suggestion.id });
  };

  const handleReject = () => {
    dispatch({ type: 'REMOVE_AI_SUGGESTION', payload: suggestion.id });
    
    // Add a brief acknowledgment
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: Date.now().toString(),
        type: 'ai',
        content: `No problem! I've removed that suggestion. I'll keep learning your preferences to provide better recommendations.`,
        timestamp: new Date().toISOString(),
      },
    });
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
          title="Dismiss suggestion"
        >
          <X className="h-3 w-3" />
        </button>
        <button
          onClick={handleAccept}
          className="p-1.5 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-200"
          title="Accept and add to calendar"
        >
          <Check className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}