import React, { useState, useRef, useEffect } from 'react';
import { Plus, Calendar, Clock, Zap, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { format, parse, addHours } from 'date-fns';
import { eventCategories } from '../../data/mockData';
import composioService from '../../services/composioService';

interface QuickEventCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string;
  initialTime?: string;
  onEventCreate?: (event: any) => Promise<void>;
}

export default function QuickEventCreator({ isOpen, onClose, initialDate, initialTime, onEventCreate }: QuickEventCreatorProps) {
  const { state, dispatch } = useApp();
  const { authState } = useAuth();
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if user is authenticated for Google Calendar sync
  const isAuthenticated = authState.isAuthenticated && authState.connectionStatus === 'connected';
  const userEmail = authState.userEmail;

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const parseNaturalLanguage = (text: string) => {
    const today = new Date();
    const defaultDate = initialDate || format(today, 'yyyy-MM-dd');
    const defaultTime = initialTime || '09:00';

    // Simple natural language parsing
    const timeRegex = /(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?/i;
    const dateRegex = /(?:on\s+)?(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;
    const durationRegex = /(?:for\s+)?(\d+)\s*(hour|hours|hr|hrs|minute|minutes|min|mins)/i;

    let parsedTime = defaultTime;
    let parsedDate = defaultDate;
    let duration = 60; // default 1 hour

    // Extract time
    const timeMatch = text.match(timeRegex);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3]?.toLowerCase();

      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;

      parsedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    // Extract date
    const dateMatch = text.match(dateRegex);
    if (dateMatch) {
      const dayString = dateMatch[1].toLowerCase();
      if (dayString === 'today') {
        parsedDate = format(today, 'yyyy-MM-dd');
      } else if (dayString === 'tomorrow') {
        parsedDate = format(addHours(today, 24), 'yyyy-MM-dd');
      }
      // Could extend for specific days of week
    }

    // Extract duration
    const durationMatch = text.match(durationRegex);
    if (durationMatch) {
      const value = parseInt(durationMatch[1]);
      const unit = durationMatch[2].toLowerCase();
      
      if (unit.includes('hour') || unit.includes('hr')) {
        duration = value * 60;
      } else if (unit.includes('minute') || unit.includes('min')) {
        duration = value;
      }
    }

    // Calculate end time
    const startTime = parse(parsedTime, 'HH:mm', new Date());
    const endTime = new Date(startTime.getTime() + duration * 60000);
    const parsedEndTime = format(endTime, 'HH:mm');

    // Extract title (remove time/date/duration info)
    let title = text
      .replace(timeRegex, '')
      .replace(dateRegex, '')
      .replace(durationRegex, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Remove common prepositions
    title = title.replace(/^(at|on|for)\s+/i, '').trim();

    return {
      title: title || 'New Event',
      date: parsedDate,
      startTime: parsedTime,
      endTime: parsedEndTime,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setIsProcessing(true);

    try {
      const parsed = parseNaturalLanguage(input);
      
      const newEvent = {
        id: `event_${Date.now()}`,
        title: parsed.title,
        date: parsed.date,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        category: eventCategories[0], // Default to first category
        priority: 'medium' as const,
        description: '',
        isCompleted: false,
        isStatic: false,
        color: eventCategories[0].color,
      };

      if (onEventCreate) {
        // Use the custom create handler that handles Google Calendar sync
        await onEventCreate(newEvent);
      } else {
        // Fallback to local creation
        if (isAuthenticated && userEmail) {
          // Use Composio service for authenticated users
          try {
            const response = await composioService.createCalendarEvent(userEmail, {
              title: newEvent.title,
              description: newEvent.description,
              startTime: `${newEvent.date}T${newEvent.startTime}:00`,
              endTime: `${newEvent.date}T${newEvent.endTime}:00`,
            });

            if (response.success) {
              console.log('✅ Quick event created successfully via Composio');
              
              // Add to local state
              dispatch({ type: 'ADD_EVENT', payload: newEvent });
              
              // Add AI feedback
              dispatch({
                type: 'ADD_CHAT_MESSAGE',
                payload: {
                  id: Date.now().toString(),
                  type: 'ai',
                  content: `🎯 Perfect! I've created "${newEvent.title}" for ${format(new Date(newEvent.date), 'EEEE, MMMM d')} at ${newEvent.startTime} and synced it with your Google Calendar. The event looks great!`,
                  timestamp: new Date().toISOString(),
                },
              });
            } else {
              throw new Error(response.error || 'Failed to create event in Google Calendar');
            }
          } catch (error) {
            console.error('❌ Error creating quick event via Composio:', error);
            
            // Still add to local state as fallback
            dispatch({ type: 'ADD_EVENT', payload: newEvent });
            
            dispatch({
              type: 'ADD_CHAT_MESSAGE',
              payload: {
                id: Date.now().toString(),
                type: 'ai',
                content: `🎯 I've created "${newEvent.title}" locally for ${format(new Date(newEvent.date), 'EEEE, MMMM d')} at ${newEvent.startTime}, but couldn't sync to Google Calendar. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                timestamp: new Date().toISOString(),
              },
            });
          }
        } else {
          // Handle local events for non-authenticated users
          dispatch({ type: 'ADD_EVENT', payload: newEvent });
          
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: Date.now().toString(),
              type: 'ai',
              content: `🎯 Perfect! I've created "${newEvent.title}" for ${format(new Date(newEvent.date), 'EEEE, MMMM d')} at ${newEvent.startTime} in your local calendar. Connect Google Calendar to sync events across devices.`,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      setInput('');
      onClose();
    } catch (error) {
      console.error('Error creating quick event:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-start justify-center p-4 pt-16">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-25 transition-opacity"
          onClick={onClose}
        />

        {/* Quick Creator */}
        <div className={`relative w-full max-w-2xl rounded-xl shadow-2xl transition-all ${
          state.isDarkMode ? 'bg-gray-800' : 'bg-white'
        }`}>
          {/* Header */}
          <div className={`flex items-center justify-between p-4 border-b ${
            state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className={`font-semibold ${
                  state.isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Quick Event Creator
                </h3>
                <p className={`text-xs ${
                  state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  Just tell me what you want to schedule
                  {isAuthenticated && (
                    <span className="ml-2 text-green-600">• Syncs with Google Calendar</span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                state.isDarkMode
                  ? 'text-gray-400 hover:bg-gray-700 hover:text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="p-4">
            <div className="space-y-4">
              <div>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., 'Team meeting tomorrow at 2pm for 1 hour' or 'Lunch with Sarah on Friday at noon'"
                  className={`w-full px-4 py-3 border rounded-lg text-lg transition-colors ${
                    state.isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500'
                  } focus:outline-none focus:ring-2`}
                />
              </div>

              {/* Examples */}
              <div className={`text-xs ${
                state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>
                <p className="mb-2 font-medium">Try saying things like:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <p>• "Doctor appointment tomorrow at 3pm"</p>
                    <p>• "Study session for 2 hours"</p>
                    <p>• "Team standup at 9am"</p>
                  </div>
                  <div className="space-y-1">
                    <p>• "Lunch meeting on Friday at noon"</p>
                    <p>• "Gym workout for 45 minutes"</p>
                    <p>• "Call mom at 7pm"</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  <span>I'll figure out the details from your description</span>
                  {isAuthenticated && (
                    <span className="text-green-600">• Auto-sync to Google Calendar</span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className={`px-4 py-2 text-sm border rounded-lg transition-colors ${
                      state.isDarkMode
                        ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!input.trim() || isProcessing}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-3 w-3" />
                    <span>{isProcessing ? 'Creating...' : 'Create Event'}</span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}