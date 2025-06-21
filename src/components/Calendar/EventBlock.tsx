import React, { useState } from 'react';
import { Check, Clock, Link, MoreHorizontal, X } from 'lucide-react';
import { Event } from '../../types';
import { useApp } from '../../contexts/AppContext';

interface EventBlockProps {
  event: Event;
  height: number;
  style?: React.CSSProperties;
}

export default function EventBlock({ event, height, style }: EventBlockProps) {
  const { state, dispatch } = useApp();
  const [showMenu, setShowMenu] = useState(false);

  const handleComplete = () => {
    dispatch({ type: 'COMPLETE_EVENT', payload: event.id });
    
    if (state.user?.preferences.motivationalFeedback) {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `🎉 Excellent work completing "${event.title}"! You're making great progress today. Keep up the momentum!`,
          timestamp: new Date().toISOString(),
        },
      });
    }
    
    setShowMenu(false);
  };

  const handleDelete = () => {
    dispatch({ type: 'DELETE_EVENT', payload: event.id });
    setShowMenu(false);
  };

  const getPriorityBorder = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-l-4 border-l-red-500';
      case 'medium':
        return 'border-l-4 border-l-yellow-500';
      case 'low':
        return 'border-l-4 border-l-green-500';
      default:
        return 'border-l-4 border-l-gray-300';
    }
  };

  return (
    <div
      className={`group relative cursor-pointer rounded-lg p-2 text-white shadow-sm hover:shadow-md transition-all duration-200 ${
        getPriorityBorder(event.priority)
      } ${event.isCompleted ? 'opacity-60' : ''}`}
      style={{
        ...style,
        height: `${height}px`,
        backgroundColor: event.color,
        minHeight: '40px',
      }}
      onClick={() => setShowMenu(!showMenu)}
    >
      {/* Event Content */}
      <div className="flex items-start justify-between h-full">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-1 mb-1">
            <Clock className="h-3 w-3 opacity-75" />
            <span className="text-xs font-medium opacity-90">
              {event.startTime}
            </span>
            {event.isCompleted && (
              <Check className="h-3 w-3 text-green-300" />
            )}
          </div>
          <h3 className={`text-sm font-medium leading-tight ${
            event.isCompleted ? 'line-through' : ''
          }`}>
            {event.title}
          </h3>
          {event.description && height > 60 && (
            <p className="text-xs opacity-75 mt-1 line-clamp-2">
              {event.description}
            </p>
          )}
          {event.links && event.links.length > 0 && (
            <div className="flex items-center mt-1">
              <Link className="h-3 w-3 opacity-60" />
              <span className="text-xs opacity-60 ml-1">
                {event.links.length} link{event.links.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
        
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-white hover:bg-opacity-20 rounded"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>
      </div>

      {/* Event Menu */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setShowMenu(false)}
          />
          <div className={`absolute top-full left-0 mt-1 w-48 rounded-lg shadow-lg py-1 z-30 ${
            state.isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
          }`}>
            {!event.isCompleted && (
              <button
                onClick={handleComplete}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-opacity-80 transition-colors duration-200 flex items-center space-x-2 ${
                  state.isDarkMode
                    ? 'text-green-400 hover:bg-gray-700'
                    : 'text-green-600 hover:bg-gray-100'
                }`}
              >
                <Check className="h-4 w-4" />
                <span>Mark Complete</span>
              </button>
            )}
            <button
              className={`w-full text-left px-4 py-2 text-sm hover:bg-opacity-80 transition-colors duration-200 ${
                state.isDarkMode
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Edit Event
            </button>
            <button
              onClick={handleDelete}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-opacity-80 transition-colors duration-200 flex items-center space-x-2 ${
                state.isDarkMode
                  ? 'text-red-400 hover:bg-gray-700'
                  : 'text-red-600 hover:bg-gray-100'
              }`}
            >
              <X className="h-4 w-4" />
              <span>Delete</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}