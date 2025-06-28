import React, { useRef, useEffect, useState } from 'react';
import Calendar from '@toast-ui/react-calendar';
import '@toast-ui/calendar/dist/toastui-calendar.min.css';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { useHybridCalendarData } from '../../hooks/useHybridCalendarData';
import { Event } from '../../types';
import { format } from 'date-fns';
import EventDialog from '../EventManagement/EventDialog';
import QuickEventCreator from '../EventManagement/QuickEventCreator';
import EventContextMenu from '../EventManagement/EventContextMenu';
import { Plus, Zap, Undo, Redo, Calendar as CalendarIcon, RefreshCw } from 'lucide-react';
import { useUndoRedo } from '../../hooks/useUndoRedo';
import { mockEvents } from '../../data/mockData';
import composioService from '../../services/composioService';

interface ToastCalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  category: 'time' | 'allday' | 'task';
  dueDateClass?: string;
  start: string;
  end: string;
  isReadOnly?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  color?: string;
  dragBackgroundColor?: string;
  location?: string;
  raw?: any;
}

export default function ToastCalendar() {
  const { state, dispatch } = useApp();
  const { authState } = useAuth();
  
  // Use the hybrid calendar data hook
  const { 
    events: calendarEvents, 
    isLoading: isLoadingCalendarData, 
    error: calendarError,
    isAuthenticated,
    userEmail,
    authenticationMethod,
    fetchCurrentWeek,
    createEvent: createCalendarEvent,
    updateEvent: updateCalendarEvent,
    deleteEvent: deleteCalendarEvent
  } = useHybridCalendarData();
  
  const calendarRef = useRef<any>(null);
  const [view, setView] = useState<'month' | 'week' | 'day'>('week');
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [calendarInstance, setCalendarInstance] = useState<any>(null);

  // Event management states
  const [eventDialog, setEventDialog] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit' | 'view';
    event?: Event | null;
    initialDate?: string;
    initialTime?: string;
  }>({
    isOpen: false,
    mode: 'create',
    event: null,
  });
  
  const [quickCreator, setQuickCreator] = useState<{
    isOpen: boolean;
    initialDate?: string;
    initialTime?: string;
  }>({
    isOpen: false,
  });

  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    event?: Event;
    position: { x: number; y: number };
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });

  // Undo/Redo functionality
  const {
    state: eventsHistory,
    set: setEventsHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoRedo(state.events);

  // Sync events history with app state
  useEffect(() => {
    if (JSON.stringify(eventsHistory) !== JSON.stringify(state.events)) {
      dispatch({ type: 'SET_EVENTS', payload: eventsHistory });
    }
  }, [eventsHistory, dispatch]);

  // Combine app events with calendar events from hybrid hook
  const getAllEvents = (): Event[] => {
    if (!isAuthenticated) {
      // If not authenticated and no local events, show mock events
      return state.events.length > 0 ? state.events : mockEvents;
    }
    
    // Merge state events with calendar events, avoiding duplicates
    const existingEventIds = new Set(state.events.map(e => e.id));
    const uniqueCalendarEvents = calendarEvents.filter(e => !existingEventIds.has(e.id));
    
    const allEvents = [...state.events, ...uniqueCalendarEvents];
    
    // If authenticated but no events found, show mock events
    return allEvents.length > 0 ? allEvents : mockEvents;
  };

  // Convert app events to Toast UI Calendar format
  const convertToToastEvents = (events: Event[]): ToastCalendarEvent[] => {
    return events.map(event => {
      const startDateTime = `${event.date}T${event.startTime}:00`;
      const endDateTime = `${event.date}T${event.endTime}:00`;

      return {
        id: event.id,
        calendarId: event.category.id,
        title: event.title,
        category: 'time' as const,
        start: startDateTime,
        end: endDateTime,
        backgroundColor: event.color,
        borderColor: event.color,
        color: '#ffffff',
        dragBackgroundColor: event.color,
        isReadOnly: false, // Make ALL events editable
        location: event.description || '',
        raw: event,
      };
    });
  };

  // Convert Toast UI event back to app event format
  const convertFromToastEvent = (toastEvent: any): Event => {
    const startDate = new Date(toastEvent.start);
    const endDate = new Date(toastEvent.end);
    const allEvents = getAllEvents();
    const existingEvent = allEvents.find(e => e.id === toastEvent.id);

    return {
      id: toastEvent.id,
      title: toastEvent.title,
      startTime: format(startDate, 'HH:mm'),
      endTime: format(endDate, 'HH:mm'),
      date: format(startDate, 'yyyy-MM-dd'),
      category: existingEvent?.category || {
        id: 'general',
        name: 'General',
        color: toastEvent.backgroundColor || '#3B82F6',
        icon: 'Calendar',
      },
      priority: existingEvent?.priority || 'medium',
      description: toastEvent.location || existingEvent?.description || '',
      isCompleted: existingEvent?.isCompleted || false,
      isStatic: false,
      color: toastEvent.backgroundColor || '#3B82F6',
    };
  };

  // Basic calendar options without theme conflicts
  const calendarOptions = {
    defaultView: view,
    useCreationPopup: false,
    useDetailPopup: false,
    isReadOnly: false,
    usageStatistics: false,
    week: {
      startDayOfWeek: 0,
      dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      hourStart: 6,
      hourEnd: 23,
      eventView: ['time'],
      taskView: false,
      collapseDuplicateEvents: false,
    },
    month: {
      dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      visibleWeeksCount: 6,
      workweek: false,
    },
    calendars: [
      {
        id: 'study',
        name: 'Study',
        backgroundColor: '#3B82F6',
        borderColor: '#3B82F6',
        dragBackgroundColor: '#3B82F6',
      },
      {
        id: 'work',
        name: 'Work',
        backgroundColor: '#10B981',
        borderColor: '#10B981',
        dragBackgroundColor: '#10B981',
      },
      {
        id: 'personal',
        name: 'Personal',
        backgroundColor: '#F59E0B',
        borderColor: '#F59E0B',
        dragBackgroundColor: '#F59E0B',
      },
      {
        id: 'health',
        name: 'Health',
        backgroundColor: '#EF4444',
        borderColor: '#EF4444',
        dragBackgroundColor: '#EF4444',
      },
      {
        id: 'social',
        name: 'Social',
        backgroundColor: '#8B5CF6',
        borderColor: '#8B5CF6',
        dragBackgroundColor: '#8B5CF6',
      },
      {
        id: 'meal',
        name: 'Meal',
        backgroundColor: '#EC4899',
        borderColor: '#EC4899',
        dragBackgroundColor: '#EC4899',
      },
      {
        id: 'imported',
        name: 'Google Calendar',
        backgroundColor: '#6B7280',
        borderColor: '#6B7280',
        dragBackgroundColor: '#6B7280',
      },
      {
        id: 'general',
        name: 'General',
        backgroundColor: '#3B82F6',
        borderColor: '#3B82F6',
        dragBackgroundColor: '#3B82F6',
      },
    ],
  };

  // Event handlers
  const onBeforeCreateEvent = async (eventData: any) => {
    const startDate = new Date(eventData.start);
    
    // Create the event object
    const newEvent: Event = {
      id: `event_${Date.now()}`,
      title: eventData.title || 'New Event',
      startTime: format(startDate, 'HH:mm'),
      endTime: format(new Date(eventData.end), 'HH:mm'),
      date: format(startDate, 'yyyy-MM-dd'),
      category: {
        id: 'general',
        name: 'General',
        color: '#3B82F6',
        icon: 'Calendar',
      },
      priority: 'medium',
      description: '',
      isCompleted: false,
      isStatic: false,
      color: '#3B82F6',
    };

    try {
      if (isAuthenticated && userEmail) {
        // Use Composio service for authenticated users
        console.log('📝 Creating event via Composio from calendar click:', newEvent.title);
        
        const response = await composioService.createCalendarEvent(userEmail, {
          title: newEvent.title,
          description: newEvent.description,
          startTime: `${newEvent.date}T${newEvent.startTime}:00`,
          endTime: `${newEvent.date}T${newEvent.endTime}:00`,
        });

        if (response.success) {
          console.log('✅ Event created successfully via Composio');
          
          // Add to local state
          const updatedEvents = [...state.events, newEvent];
          setEventsHistory(updatedEvents);
          
          // Refresh calendar data
          await fetchCurrentWeek();
          
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: Date.now().toString(),
              type: 'ai',
              content: `📅 Perfect! I've created "${newEvent.title}" and synced it with your Google Calendar. Click on the event to edit details.`,
              timestamp: new Date().toISOString(),
            },
          });
        } else {
          throw new Error(response.error || 'Failed to create event');
        }
      } else {
        // Handle local events for non-authenticated users
        const updatedEvents = [...state.events, newEvent];
        setEventsHistory(updatedEvents);
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: Date.now().toString(),
            type: 'ai',
            content: `📅 I've created "${newEvent.title}" in your local calendar. Connect Google Calendar to sync events across devices.`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('❌ Error creating event:', error);
      
      // Still add to local state as fallback
      const updatedEvents = [...state.events, newEvent];
      setEventsHistory(updatedEvents);
      
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `📅 I've created "${newEvent.title}" locally, but couldn't sync to Google Calendar. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  };

  const onBeforeUpdateEvent = async (updateData: any) => {
    const { event, changes } = updateData;
    const updatedEvent = convertFromToastEvent({ ...event, ...changes });
    
    console.log('🔄 Updating event:', {
      eventId: event.id,
      title: updatedEvent.title,
      isAuthenticated,
      userEmail,
      changes
    });
    
    try {
      if (isAuthenticated && userEmail) {
        // Use Composio service for authenticated users
        console.log('🔄 Updating event via Composio:', updatedEvent.title);
        
        // Extract the original event ID (remove any prefixes)
        const originalEventId = event.id.replace(/^(google_|event_|composio_)/, '');
        
        const response = await composioService.updateCalendarEvent(userEmail, originalEventId, {
          title: updatedEvent.title,
          description: updatedEvent.description,
          startTime: `${updatedEvent.date}T${updatedEvent.startTime}:00`,
          endTime: `${updatedEvent.date}T${updatedEvent.endTime}:00`,
        });

        if (response.success) {
          console.log('✅ Event updated successfully via Composio');
          
          // Update local state
          const updatedEvents = state.events.map(e => 
            e.id === updatedEvent.id ? updatedEvent : e
          );
          setEventsHistory(updatedEvents);
          
          // Refresh calendar data to get the latest from Google Calendar
          await fetchCurrentWeek();
          
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: Date.now().toString(),
              type: 'ai',
              content: `✅ Perfect! I've updated "${updatedEvent.title}" in both your local calendar and Google Calendar. The changes are synced across all your devices.`,
              timestamp: new Date().toISOString(),
            },
          });
        } else {
          throw new Error(response.error || 'Failed to update event');
        }
      } else {
        // Handle local events for non-authenticated users
        const updatedEvents = state.events.map(e => 
          e.id === updatedEvent.id ? updatedEvent : e
        );
        setEventsHistory(updatedEvents);
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: Date.now().toString(),
            type: 'ai',
            content: `✅ I've updated "${updatedEvent.title}" in your local calendar. Connect your Google Calendar to sync changes across devices.`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('❌ Error updating event:', error);
      
      // Still update locally as fallback
      const updatedEvents = state.events.map(e => 
        e.id === updatedEvent.id ? updatedEvent : e
      );
      setEventsHistory(updatedEvents);
      
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `❌ I couldn't update "${updatedEvent.title}" in Google Calendar. The change was saved locally. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  };

  const onBeforeDeleteEvent = async (eventData: any) => {
    console.log('🗑️ Deleting event:', {
      eventId: eventData.id,
      title: eventData.title,
      isAuthenticated,
      userEmail
    });
    
    try {
      if (isAuthenticated && userEmail) {
        // Use Composio service for authenticated users
        console.log('🗑️ Deleting event via Composio:', eventData.title);
        
        // Extract the original event ID (remove any prefixes)
        const originalEventId = eventData.id.replace(/^(google_|event_|composio_)/, '');
        
        const response = await composioService.deleteCalendarEvent(userEmail, originalEventId);
        
        if (response.success) {
          console.log('✅ Event deleted successfully via Composio');
          
          // Update local state
          const updatedEvents = state.events.filter(e => e.id !== eventData.id);
          setEventsHistory(updatedEvents);
          
          // Refresh calendar data
          await fetchCurrentWeek();
          
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: Date.now().toString(),
              type: 'ai',
              content: `🗑️ I've successfully deleted "${eventData.title}" from both your local schedule and Google Calendar.`,
              timestamp: new Date().toISOString(),
            },
          });
        } else {
          throw new Error(response.error || 'Failed to delete event');
        }
      } else {
        // Handle local events for non-authenticated users
        const updatedEvents = state.events.filter(e => e.id !== eventData.id);
        setEventsHistory(updatedEvents);
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: Date.now().toString(),
            type: 'ai',
            content: `🗑️ I've removed "${eventData.title}" from your local calendar. Connect your Google Calendar to sync deletions across devices.`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('❌ Error deleting event:', error);
      
      // Still delete locally as fallback
      const updatedEvents = state.events.filter(e => e.id !== eventData.id);
      setEventsHistory(updatedEvents);
      
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `❌ I couldn't delete "${eventData.title}" from Google Calendar. The event was removed locally. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  };

  const onClickEvent = (eventData: any) => {
    console.log('👆 Event clicked:', eventData.event);
    
    // Find the event in our combined events list
    const allEvents = getAllEvents();
    const event = allEvents.find(e => e.id === eventData.event.id);
    
    if (event) {
      console.log('📝 Opening event dialog for:', event.title);
      setEventDialog({
        isOpen: true,
        mode: 'view',
        event: event,
      });
    } else {
      console.warn('⚠️ Event not found in local state:', eventData.event.id);
      // Create a temporary event object from the Toast UI event data
      const tempEvent = convertFromToastEvent(eventData.event);
      setEventDialog({
        isOpen: true,
        mode: 'view',
        event: tempEvent,
      });
    }
  };

  const onRightClickEvent = (eventData: any) => {
    const allEvents = getAllEvents();
    const event = allEvents.find(e => e.id === eventData.event.id);
    
    if (event) {
      setContextMenu({
        isOpen: true,
        event: event,
        position: { x: eventData.nativeEvent.clientX, y: eventData.nativeEvent.clientY },
      });
    } else {
      // Create a temporary event object from the Toast UI event data
      const tempEvent = convertFromToastEvent(eventData.event);
      setContextMenu({
        isOpen: true,
        event: tempEvent,
        position: { x: eventData.nativeEvent.clientX, y: eventData.nativeEvent.clientY },
      });
    }
  };

  // Navigation handlers
  const handleViewChange = (newView: 'month' | 'week' | 'day') => {
    setView(newView);
    if (calendarInstance) {
      calendarInstance.changeView(newView);
      // Calendar events are automatically loaded via the hybrid hook
    }
  };

  const handleNavigation = (direction: 'prev' | 'next' | 'today') => {
    if (calendarInstance) {
      switch (direction) {
        case 'prev':
          calendarInstance.prev();
          break;
        case 'next':
          calendarInstance.next();
          break;
        case 'today':
          calendarInstance.today();
          break;
      }
      
      const newDate = calendarInstance.getDate();
      setCurrentCalendarDate(newDate);
      dispatch({ type: 'SET_CURRENT_WEEK', payload: newDate });
      
      // Fetch events for the new date range
      if (isAuthenticated) {
        fetchCurrentWeek();
      }
    }
  };

  const handleManualSync = async () => {
    if (!isAuthenticated) {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: '🔗 Please connect your Google Calendar first to sync events.',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    await fetchCurrentWeek();
  };

  // Enhanced event creation handler for dialog
  const handleCreateEventFromDialog = async (eventData: Event) => {
    try {
      if (isAuthenticated && userEmail) {
        // Use Composio service for authenticated users
        console.log('📝 Creating event via Composio:', eventData.title);
        
        const response = await composioService.createCalendarEvent(userEmail, {
          title: eventData.title,
          description: eventData.description,
          startTime: `${eventData.date}T${eventData.startTime}:00`,
          endTime: `${eventData.date}T${eventData.endTime}:00`,
        });

        if (response.success) {
          console.log('✅ Event created successfully via Composio');
          
          // Add to local state
          const updatedEvents = [...state.events, eventData];
          setEventsHistory(updatedEvents);
          
          // Refresh calendar data
          await fetchCurrentWeek();
          
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: Date.now().toString(),
              type: 'ai',
              content: `📅 Excellent! I've created "${eventData.title}" in both your local calendar and Google Calendar. It's now synced across all your devices.`,
              timestamp: new Date().toISOString(),
            },
          });
        } else {
          throw new Error(response.error || 'Failed to create event');
        }
      } else {
        // Handle local events for non-authenticated users
        const updatedEvents = [...state.events, eventData];
        setEventsHistory(updatedEvents);
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: Date.now().toString(),
            type: 'ai',
            content: `📅 I've created "${eventData.title}" in your local calendar. Connect your Google Calendar to sync events across devices.`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('❌ Error creating event:', error);
      
      // Still add to local state as fallback
      const updatedEvents = [...state.events, eventData];
      setEventsHistory(updatedEvents);
      
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `📅 I've created "${eventData.title}" locally, but couldn't sync to Google Calendar. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  };

  // Enhanced event update handler for dialog
  const handleUpdateEventFromDialog = async (eventData: Event) => {
    try {
      if (isAuthenticated && userEmail) {
        // Use Composio service for authenticated users
        console.log('🔄 Updating event via Composio from dialog:', eventData.title);
        
        // Extract the original event ID (remove any prefixes)
        const originalEventId = eventData.id.replace(/^(google_|event_|composio_)/, '');
        
        const response = await composioService.updateCalendarEvent(userEmail, originalEventId, {
          title: eventData.title,
          description: eventData.description,
          startTime: `${eventData.date}T${eventData.startTime}:00`,
          endTime: `${eventData.date}T${eventData.endTime}:00`,
        });

        if (response.success) {
          console.log('✅ Event updated successfully via Composio from dialog');
          
          // Update local state
          const updatedEvents = state.events.map(e => 
            e.id === eventData.id ? eventData : e
          );
          setEventsHistory(updatedEvents);
          
          // Refresh calendar data
          await fetchCurrentWeek();
          
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: Date.now().toString(),
              type: 'ai',
              content: `✅ Perfect! I've updated "${eventData.title}" in both your local calendar and Google Calendar. All changes are synced.`,
              timestamp: new Date().toISOString(),
            },
          });
        } else {
          throw new Error(response.error || 'Failed to update event');
        }
      } else {
        // Handle local events for non-authenticated users
        const updatedEvents = state.events.map(e => 
          e.id === eventData.id ? eventData : e
        );
        setEventsHistory(updatedEvents);
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: Date.now().toString(),
            type: 'ai',
            content: `✅ I've updated "${eventData.title}" in your local calendar. Connect your Google Calendar to sync changes across devices.`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('❌ Error updating event from dialog:', error);
      
      // Still update locally as fallback
      const updatedEvents = state.events.map(e => 
        e.id === eventData.id ? eventData : e
      );
      setEventsHistory(updatedEvents);
      
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `❌ I couldn't update "${eventData.title}" in Google Calendar. The change was saved locally. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (eventDialog.isOpen || quickCreator.isOpen || contextMenu.isOpen) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setQuickCreator({ isOpen: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [eventDialog.isOpen, quickCreator.isOpen, contextMenu.isOpen, undo, redo]);

  // Initialize calendar instance
  useEffect(() => {
    if (calendarRef.current) {
      const instance = calendarRef.current.getInstance();
      setCalendarInstance(instance);
    }
  }, []);

  // Update calendar when events change
  useEffect(() => {
    if (calendarInstance) {
      try {
        const allEvents = getAllEvents();
        const toastEvents = convertToToastEvents(allEvents);
        calendarInstance.clear();
        calendarInstance.createEvents(toastEvents);
      } catch (error) {
        console.error('Error updating calendar events:', error);
      }
    }
  }, [state.events, calendarEvents, calendarInstance]);

  return (
    <div className={`h-full flex flex-col ${
      state.isDarkMode ? 'bg-gray-900' : 'bg-white'
    }`}>
      {/* Calendar Header */}
      <div className={`p-4 border-b flex items-center justify-between ${
        state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <div className="flex items-center space-x-4">
          {/* Navigation */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleNavigation('prev')}
              className={`p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200 ${
                state.isDarkMode
                  ? 'text-gray-300 hover:bg-gray-800'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              ←
            </button>
            <button
              onClick={() => handleNavigation('next')}
              className={`p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200 ${
                state.isDarkMode
                  ? 'text-gray-300 hover:bg-gray-800'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              →
            </button>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-orange-500 rounded-lg flex items-center justify-center">
              <CalendarIcon className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className={`font-semibold ${
                state.isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Calendar
              </h2>
              <p className={`text-xs ${
                state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>
                {isAuthenticated ? `Synced with ${userEmail}` : 'Local calendar only'}
              </p>
            </div>
          </div>

          {/* Loading indicator */}
          {isLoadingCalendarData && (
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              <span className={`text-sm ${
                state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Syncing...
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Undo/Redo */}
          <div className="flex items-center space-x-1">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className={`p-2 rounded-lg transition-colors duration-200 ${
                canUndo
                  ? state.isDarkMode
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-600 hover:bg-gray-100'
                  : 'opacity-50 cursor-not-allowed text-gray-400'
              }`}
            >
              <Undo className="h-4 w-4" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              className={`p-2 rounded-lg transition-colors duration-200 ${
                canRedo
                  ? state.isDarkMode
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-600 hover:bg-gray-100'
                  : 'opacity-50 cursor-not-allowed text-gray-400'
              }`}
            >
              <Redo className="h-4 w-4" />
            </button>
          </div>

          {/* Quick Actions */}
          <button
            onClick={() => setQuickCreator({ isOpen: true })}
            title="Quick Create (Ctrl+N)"
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
              state.isDarkMode
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-purple-500 text-white hover:bg-purple-600'
            }`}
          >
            <Zap className="h-4 w-4" />
            <span>Quick Add</span>
          </button>

          <button
            onClick={() => setEventDialog({ isOpen: true, mode: 'create' })}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
              state.isDarkMode
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>New Event</span>
          </button>

          {/* Sync Button */}
          {isAuthenticated && (
            <button
              onClick={handleManualSync}
              disabled={isLoadingCalendarData}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                isLoadingCalendarData
                  ? 'opacity-50 cursor-not-allowed'
                  : state.isDarkMode
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingCalendarData ? 'animate-spin' : ''}`} />
            </button>
          )}

          {/* View Switcher */}
          <div className={`flex rounded-lg border ${
            state.isDarkMode ? 'border-gray-600' : 'border-gray-300'
          }`}>
            {(['month', 'week', 'day'] as const).map((viewType) => (
              <button
                key={viewType}
                onClick={() => handleViewChange(viewType)}
                className={`px-3 py-1 text-sm font-medium capitalize transition-colors duration-200 ${
                  view === viewType
                    ? state.isDarkMode
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-500 text-white'
                    : state.isDarkMode
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-700 hover:bg-gray-100'
                } ${viewType === 'month' ? 'rounded-l-lg' : viewType === 'day' ? 'rounded-r-lg' : ''}`}
              >
                {viewType}
              </button>
            ))}
          </div>

          <button
            onClick={() => handleNavigation('today')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
              state.isDarkMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            Today
          </button>
        </div>
      </div>

      {/* Toast UI Calendar */}
      <div className="flex-1 overflow-hidden">
        <div className={`h-full ${
          state.isDarkMode ? 'bg-gray-800' : 'bg-white'
        }`}>
          <Calendar
            ref={calendarRef}
            height="100%"
            view={view}
            events={convertToToastEvents(getAllEvents())}
            calendars={calendarOptions.calendars}
            week={calendarOptions.week}
            month={calendarOptions.month}
            useCreationPopup={calendarOptions.useCreationPopup}
            useDetailPopup={calendarOptions.useDetailPopup}
            isReadOnly={calendarOptions.isReadOnly}
            usageStatistics={calendarOptions.usageStatistics}
            onBeforeCreateEvent={onBeforeCreateEvent}
            onBeforeUpdateEvent={onBeforeUpdateEvent}
            onBeforeDeleteEvent={onBeforeDeleteEvent}
            onClickEvent={onClickEvent}
            onRightClickEvent={onRightClickEvent}
          />
        </div>
      </div>

      {/* Event Management Dialogs */}
      <EventDialog
        isOpen={eventDialog.isOpen}
        onClose={() => setEventDialog({ isOpen: false, mode: 'create' })}
        event={eventDialog.event}
        mode={eventDialog.mode}
        initialDate={eventDialog.initialDate}
        initialTime={eventDialog.initialTime}
        onEventCreate={handleCreateEventFromDialog}
        onEventUpdate={handleUpdateEventFromDialog}
      />

      <QuickEventCreator
        isOpen={quickCreator.isOpen}
        onClose={() => setQuickCreator({ isOpen: false })}
        initialDate={quickCreator.initialDate}
        initialTime={quickCreator.initialTime}
        onEventCreate={handleCreateEventFromDialog}
      />

      {contextMenu.isOpen && contextMenu.event && (
        <EventContextMenu
          event={contextMenu.event}
          position={contextMenu.position}
          onClose={() => setContextMenu({ isOpen: false, position: { x: 0, y: 0 } })}
          onEdit={() => {
            setEventDialog({
              isOpen: true,
              mode: 'edit',
              event: contextMenu.event,
            });
            setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
          }}
          onView={() => {
            setEventDialog({
              isOpen: true,
              mode: 'view',
              event: contextMenu.event,
            });
            setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
          }}
        />
      )}
    </div>
  );
}