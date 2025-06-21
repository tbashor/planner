import React, { useState, useEffect, useRef } from 'react';
import { Edit3, Trash2, Copy, Clock, CheckCircle, MoreHorizontal } from 'lucide-react';
import { Event } from '../../types';
import { useApp } from '../../contexts/AppContext';

interface EventContextMenuProps {
  event: Event;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: () => void;
  onView: () => void;
}

export default function EventContextMenu({ event, position, onClose, onEdit, onView }: EventContextMenuProps) {
  const { state, dispatch } = useApp();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

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
    
    onClose();
  };

  const handleDelete = () => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${event.title}"? This action cannot be undone.`
    );

    if (confirmDelete) {
      dispatch({ type: 'DELETE_EVENT', payload: event.id });
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `🗑️ I've removed "${event.title}" from your calendar. Would you like me to suggest alternative activities for that time slot?`,
          timestamp: new Date().toISOString(),
        },
      });
      onClose();
    }
  };

  const handleDuplicate = () => {
    const duplicatedEvent = {
      ...event,
      id: `event_${Date.now()}`,
      title: `${event.title} (Copy)`,
    };

    dispatch({ type: 'ADD_EVENT', payload: duplicatedEvent });
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: Date.now().toString(),
        type: 'ai',
        content: `📋 I've created a copy of "${event.title}" for you. You can now edit the details as needed.`,
        timestamp: new Date().toISOString(),
      },
    });
    onClose();
  };

  // Calculate menu position to keep it within viewport
  const getMenuStyle = () => {
    const menuWidth = 200;
    const menuHeight = 240;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = position.x;
    let y = position.y;

    // Adjust horizontal position
    if (x + menuWidth > viewportWidth) {
      x = viewportWidth - menuWidth - 10;
    }

    // Adjust vertical position
    if (y + menuHeight > viewportHeight) {
      y = viewportHeight - menuHeight - 10;
    }

    return {
      position: 'fixed' as const,
      left: `${x}px`,
      top: `${y}px`,
      zIndex: 1000,
    };
  };

  return (
    <div
      ref={menuRef}
      style={getMenuStyle()}
      className={`w-48 rounded-lg shadow-xl border py-1 ${
        state.isDarkMode 
          ? 'bg-gray-800 border-gray-700' 
          : 'bg-white border-gray-200'
      }`}
    >
      {/* Event Info Header */}
      <div className={`px-3 py-2 border-b ${
        state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <p className={`text-sm font-medium truncate ${
          state.isDarkMode ? 'text-white' : 'text-gray-900'
        }`}>
          {event.title}
        </p>
        <p className={`text-xs ${
          state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
        }`}>
          {event.startTime} - {event.endTime}
        </p>
      </div>

      {/* Menu Items */}
      <div className="py-1">
        <button
          onClick={onView}
          className={`w-full text-left px-3 py-2 text-sm hover:bg-opacity-80 transition-colors flex items-center space-x-2 ${
            state.isDarkMode
              ? 'text-gray-300 hover:bg-gray-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span>View Details</span>
        </button>

        <button
          onClick={onEdit}
          className={`w-full text-left px-3 py-2 text-sm hover:bg-opacity-80 transition-colors flex items-center space-x-2 ${
            state.isDarkMode
              ? 'text-gray-300 hover:bg-gray-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Edit3 className="h-4 w-4" />
          <span>Edit Event</span>
        </button>

        {!event.isCompleted && (
          <button
            onClick={handleComplete}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-opacity-80 transition-colors flex items-center space-x-2 ${
              state.isDarkMode
                ? 'text-green-400 hover:bg-gray-700'
                : 'text-green-600 hover:bg-gray-100'
            }`}
          >
            <CheckCircle className="h-4 w-4" />
            <span>Mark Complete</span>
          </button>
        )}

        <button
          onClick={handleDuplicate}
          className={`w-full text-left px-3 py-2 text-sm hover:bg-opacity-80 transition-colors flex items-center space-x-2 ${
            state.isDarkMode
              ? 'text-gray-300 hover:bg-gray-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Copy className="h-4 w-4" />
          <span>Duplicate</span>
        </button>

        <div className={`my-1 border-t ${
          state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
        }`} />

        <button
          onClick={handleDelete}
          className={`w-full text-left px-3 py-2 text-sm hover:bg-opacity-80 transition-colors flex items-center space-x-2 ${
            state.isDarkMode
              ? 'text-red-400 hover:bg-gray-700'
              : 'text-red-600 hover:bg-gray-100'
          }`}
        >
          <Trash2 className="h-4 w-4" />
          <span>Delete Event</span>
        </button>
      </div>
    </div>
  );
}