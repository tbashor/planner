import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, Clock, MapPin, Users, Repeat, Save, Trash2, Edit3, AlertCircle, CheckCircle } from 'lucide-react';
import { Event, EventCategory } from '../../types';
import { useApp } from '../../contexts/AppContext';
import { format, parse, addDays, startOfDay } from 'date-fns';
import { eventCategories } from '../../data/mockData';

interface EventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  event?: Event | null;
  initialDate?: string;
  initialTime?: string;
  mode: 'create' | 'edit' | 'view';
}

interface RecurrenceOptions {
  type: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  endDate?: string;
  count?: number;
}

export default function EventDialog({ isOpen, onClose, event, initialDate, initialTime, mode }: EventDialogProps) {
  const { state, dispatch } = useApp();
  const [currentMode, setCurrentMode] = useState(mode);
  const [formData, setFormData] = useState({
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    isAllDay: false,
    location: '',
    description: '',
    attendees: '',
    category: eventCategories[0],
    priority: 'medium' as const,
    recurrence: { type: 'none', interval: 1 } as RecurrenceOptions,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Initialize form data
  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        isAllDay: event.startTime === '00:00' && event.endTime === '23:59',
        location: '',
        description: event.description || '',
        attendees: '',
        category: event.category,
        priority: event.priority,
        recurrence: { type: 'none', interval: 1 },
      });
    } else {
      const today = new Date();
      const defaultDate = initialDate || format(today, 'yyyy-MM-dd');
      const defaultStartTime = initialTime || '09:00';
      const defaultEndTime = calculateEndTime(defaultStartTime, 60);

      setFormData({
        title: '',
        date: defaultDate,
        startTime: defaultStartTime,
        endTime: defaultEndTime,
        isAllDay: false,
        location: '',
        description: '',
        attendees: '',
        category: eventCategories[0],
        priority: 'medium',
        recurrence: { type: 'none', interval: 1 },
      });
    }
  }, [event, initialDate, initialTime]);

  // Focus title input when dialog opens
  useEffect(() => {
    if (isOpen && titleInputRef.current) {
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    try {
      const [hours, minutes] = startTime.split(':').map(Number);
      const startDate = new Date();
      startDate.setHours(hours, minutes, 0, 0);
      const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
      return format(endDate, 'HH:mm');
    } catch {
      return '10:00';
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Please give your event a title so you can easily identify it later.';
    }

    if (!formData.date) {
      newErrors.date = 'When would you like this event to happen? Please select a date.';
    }

    if (!formData.isAllDay) {
      if (!formData.startTime) {
        newErrors.startTime = 'What time should this event start?';
      }
      if (!formData.endTime) {
        newErrors.endTime = 'What time should this event end?';
      }
      if (formData.startTime && formData.endTime && formData.startTime >= formData.endTime) {
        newErrors.endTime = 'The end time should be after the start time. Would you like to adjust it?';
      }
    }

    // Validate date is not in the past (unless editing)
    if (formData.date && currentMode === 'create') {
      const selectedDate = new Date(formData.date);
      const today = startOfDay(new Date());
      if (selectedDate < today) {
        newErrors.date = 'This date is in the past. Would you like to schedule it for today or a future date?';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const eventData: Event = {
        id: event?.id || `event_${Date.now()}`,
        title: formData.title.trim(),
        date: formData.date,
        startTime: formData.isAllDay ? '00:00' : formData.startTime,
        endTime: formData.isAllDay ? '23:59' : formData.endTime,
        category: formData.category,
        priority: formData.priority,
        description: formData.description.trim(),
        isCompleted: event?.isCompleted || false,
        isStatic: false,
        color: formData.category.color,
      };

      if (currentMode === 'create') {
        dispatch({ type: 'ADD_EVENT', payload: eventData });
        setConfirmationMessage(`Perfect! "${eventData.title}" has been added to your calendar for ${format(new Date(eventData.date), 'EEEE, MMMM d')}.`);
      } else {
        dispatch({ type: 'UPDATE_EVENT', payload: eventData });
        setConfirmationMessage(`Great! I've updated "${eventData.title}" with your changes.`);
      }

      // Add AI feedback
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: currentMode === 'create' 
            ? `📅 Excellent! I've added "${eventData.title}" to your schedule. ${formData.location ? `I see it's at ${formData.location} - ` : ''}Would you like me to suggest the best preparation time or set a reminder?`
            : `✅ Perfect! "${eventData.title}" has been updated successfully. Your schedule is looking great!`,
          timestamp: new Date().toISOString(),
        },
      });

      setShowConfirmation(true);
      setTimeout(() => {
        setShowConfirmation(false);
        onClose();
      }, 2000);

    } catch (error) {
      setErrors({ submit: 'Something went wrong while saving your event. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!event) return;

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

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Auto-calculate end time when start time changes
    if (field === 'startTime' && value && !formData.isAllDay) {
      const newEndTime = calculateEndTime(value, 60);
      setFormData(prev => ({ ...prev, endTime: newEndTime }));
    }

    // Handle all-day toggle
    if (field === 'isAllDay') {
      if (value) {
        setFormData(prev => ({ 
          ...prev, 
          startTime: '00:00', 
          endTime: '23:59',
          isAllDay: true 
        }));
      } else {
        setFormData(prev => ({ 
          ...prev, 
          startTime: '09:00', 
          endTime: '10:00',
          isAllDay: false 
        }));
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />

        {/* Dialog */}
        <div className={`relative w-full max-w-2xl rounded-xl shadow-2xl transition-all ${
          state.isDarkMode ? 'bg-gray-800' : 'bg-white'
        }`}>
          {/* Header */}
          <div className={`flex items-center justify-between p-6 border-b ${
            state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${
                currentMode === 'create' ? 'bg-blue-500' : 
                currentMode === 'edit' ? 'bg-green-500' : 'bg-gray-500'
              }`}>
                {currentMode === 'create' ? (
                  <Calendar className="h-5 w-5 text-white" />
                ) : currentMode === 'edit' ? (
                  <Edit3 className="h-5 w-5 text-white" />
                ) : (
                  <Calendar className="h-5 w-5 text-white" />
                )}
              </div>
              <div>
                <h2 className={`text-xl font-semibold ${
                  state.isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  {currentMode === 'create' ? 'Create New Event' : 
                   currentMode === 'edit' ? 'Edit Event' : 'Event Details'}
                </h2>
                <p className={`text-sm ${
                  state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {currentMode === 'create' ? 'Tell me about your new event' : 
                   currentMode === 'edit' ? 'Make any changes you need' : 'View event information'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              {currentMode === 'view' && (
                <button
                  onClick={() => setCurrentMode('edit')}
                  className={`p-2 rounded-lg transition-colors ${
                    state.isDarkMode
                      ? 'text-gray-400 hover:bg-gray-700 hover:text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Edit3 className="h-4 w-4" />
                </button>
              )}
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
          </div>

          {/* Confirmation Message */}
          {showConfirmation && (
            <div className="p-4 bg-green-50 border-b border-green-200">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <p className="text-green-800 font-medium">{confirmationMessage}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Title */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                state.isDarkMode ? 'text-gray-200' : 'text-gray-700'
              }`}>
                What's this event about? *
              </label>
              <input
                ref={titleInputRef}
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="e.g., Team meeting, Doctor appointment, Study session..."
                disabled={currentMode === 'view'}
                className={`w-full px-4 py-3 border rounded-lg transition-colors ${
                  errors.title 
                    ? 'border-red-500 focus:ring-red-500' 
                    : state.isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500'
                } focus:outline-none focus:ring-2`}
              />
              {errors.title && (
                <div className="mt-2 flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-600">{errors.title}</p>
                </div>
              )}
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  state.isDarkMode ? 'text-gray-200' : 'text-gray-700'
                }`}>
                  When is this happening? *
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleInputChange('date', e.target.value)}
                  disabled={currentMode === 'view'}
                  className={`w-full px-4 py-3 border rounded-lg transition-colors ${
                    errors.date 
                      ? 'border-red-500 focus:ring-red-500' 
                      : state.isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-white focus:ring-blue-500 focus:border-blue-500'
                      : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 focus:border-blue-500'
                  } focus:outline-none focus:ring-2`}
                />
                {errors.date && (
                  <div className="mt-2 flex items-start space-x-2">
                    <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-600">{errors.date}</p>
                  </div>
                )}
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  state.isDarkMode ? 'text-gray-200' : 'text-gray-700'
                }`}>
                  All day event?
                </label>
                <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors hover:bg-opacity-50">
                  <input
                    type="checkbox"
                    checked={formData.isAllDay}
                    onChange={(e) => handleInputChange('isAllDay', e.target.checked)}
                    disabled={currentMode === 'view'}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className={`text-sm ${
                    state.isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    This event lasts all day
                  </span>
                </label>
              </div>
            </div>

            {/* Time Range */}
            {!formData.isAllDay && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${
                    state.isDarkMode ? 'text-gray-200' : 'text-gray-700'
                  }`}>
                    Start time *
                  </label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => handleInputChange('startTime', e.target.value)}
                    disabled={currentMode === 'view'}
                    className={`w-full px-4 py-3 border rounded-lg transition-colors ${
                      errors.startTime 
                        ? 'border-red-500 focus:ring-red-500' 
                        : state.isDarkMode
                        ? 'bg-gray-700 border-gray-600 text-white focus:ring-blue-500 focus:border-blue-500'
                        : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 focus:border-blue-500'
                    } focus:outline-none focus:ring-2`}
                  />
                  {errors.startTime && (
                    <div className="mt-2 flex items-start space-x-2">
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-600">{errors.startTime}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${
                    state.isDarkMode ? 'text-gray-200' : 'text-gray-700'
                  }`}>
                    End time *
                  </label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => handleInputChange('endTime', e.target.value)}
                    disabled={currentMode === 'view'}
                    className={`w-full px-4 py-3 border rounded-lg transition-colors ${
                      errors.endTime 
                        ? 'border-red-500 focus:ring-red-500' 
                        : state.isDarkMode
                        ? 'bg-gray-700 border-gray-600 text-white focus:ring-blue-500 focus:border-blue-500'
                        : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 focus:border-blue-500'
                    } focus:outline-none focus:ring-2`}
                  />
                  {errors.endTime && (
                    <div className="mt-2 flex items-start space-x-2">
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-600">{errors.endTime}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Category and Priority */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  state.isDarkMode ? 'text-gray-200' : 'text-gray-700'
                }`}>
                  What type of event is this?
                </label>
                <select
                  value={formData.category.id}
                  onChange={(e) => {
                    const category = eventCategories.find(c => c.id === e.target.value) || eventCategories[0];
                    handleInputChange('category', category);
                  }}
                  disabled={currentMode === 'view'}
                  className={`w-full px-4 py-3 border rounded-lg transition-colors ${
                    state.isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-white focus:ring-blue-500 focus:border-blue-500'
                      : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 focus:border-blue-500'
                  } focus:outline-none focus:ring-2`}
                >
                  {eventCategories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  state.isDarkMode ? 'text-gray-200' : 'text-gray-700'
                }`}>
                  How important is this?
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => handleInputChange('priority', e.target.value)}
                  disabled={currentMode === 'view'}
                  className={`w-full px-4 py-3 border rounded-lg transition-colors ${
                    state.isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-white focus:ring-blue-500 focus:border-blue-500'
                      : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 focus:border-blue-500'
                  } focus:outline-none focus:ring-2`}
                >
                  <option value="low">Low priority - Nice to do</option>
                  <option value="medium">Medium priority - Should do</option>
                  <option value="high">High priority - Must do</option>
                </select>
              </div>
            </div>

            {/* Location */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                state.isDarkMode ? 'text-gray-200' : 'text-gray-700'
              }`}>
                <MapPin className="inline h-4 w-4 mr-1" />
                Where is this happening?
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                placeholder="e.g., Conference Room A, 123 Main St, Online via Zoom..."
                disabled={currentMode === 'view'}
                className={`w-full px-4 py-3 border rounded-lg transition-colors ${
                  state.isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500'
                } focus:outline-none focus:ring-2`}
              />
            </div>

            {/* Description */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                state.isDarkMode ? 'text-gray-200' : 'text-gray-700'
              }`}>
                Any additional details?
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Add any notes, agenda items, or important details..."
                rows={3}
                disabled={currentMode === 'view'}
                className={`w-full px-4 py-3 border rounded-lg transition-colors resize-none ${
                  state.isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500'
                } focus:outline-none focus:ring-2`}
              />
            </div>

            {/* Error Message */}
            {errors.submit && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-red-800">{errors.submit}</p>
                </div>
              </div>
            )}

            {/* Actions */}
            {currentMode !== 'view' && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div>
                  {event && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="flex items-center space-x-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Delete Event</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className={`px-6 py-2 border rounded-lg font-medium transition-colors ${
                      state.isDarkMode
                        ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`flex items-center space-x-2 px-6 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <Save className="h-4 w-4" />
                    <span>
                      {isSubmitting ? 'Saving...' : 
                       currentMode === 'create' ? 'Create Event' : 'Save Changes'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}