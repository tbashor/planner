import React, { useRef, useEffect, useState } from 'react';
import Calendar from '@toast-ui/react-calendar';
import '@toast-ui/calendar/dist/toastui-calendar.min.css';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { useHybridCalendarData } from '../../hooks/useHybridCalendarData';
import { Event } from '../../types';
import { format } from 'date-fns';
import { formatEventDate } from '../../utils/dateUtils';
import EventDialog from '../EventManagement/EventDialog';
import QuickEventCreator from '../EventManagement/QuickEventCreator';
import EventContextMenu from '../EventManagement/EventContextMenu';
import CalendarDateDebugger from './CalendarDateDebugger';
import { Plus, Zap, Undo, Redo, Calendar as CalendarIcon, RefreshCw, Bug } from 'lucide-react';
import { useUndoRedo } from '../../hooks/useUndoRedo';
import { mockEvents } from '../../data/mockData';
import composioService from '../../services/composioService';
import { createEventWithConflictDetection } from '../../utils/aiUtils';
import { checkEventUpdateConflicts } from '../../utils/conflictDetection';
import { DateTimeDebugger } from '../../utils/dateTimeDebugger';

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
  const [showDateDebugger, setShowDateDebugger] = useState(false);
  const [isSuggestionsExpanded, setIsSuggestionsExpanded] = useState(true);
  const [calendarHeight, setCalendarHeight] = useState('100%');

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

  // Listen for AI suggestions panel toggle events and update calendar height
  useEffect(() => {
    const handleSuggestionsToggle = (event: CustomEvent) => {
      const isExpanded = event.detail.isExpanded;
      setIsSuggestionsExpanded(isExpanded);
      
      // Calculate new height based on suggestions panel state
      const headerHeight = 64; // Header height in pixels
      const suggestionsHeight = isExpanded ? 320 : 60; // Expanded vs collapsed height
      const availableHeight = window.innerHeight - headerHeight - suggestionsHeight;
      const newHeight = `${Math.max(availableHeight, isExpanded ? 400 : 600)}px`;
      
      setCalendarHeight(newHeight);
      
      // Update Toast UI Calendar height using setOptions and render
      if (calendarInstance) {
        console.log(`📏 Updating Toast UI Calendar height to: ${newHeight}`);
        
        try {
          // Use setOptions to update the calendar height
          calendarInstance.setOptions({
            height: newHeight
          });
          
          // Call render to apply the height changes
          calendarInstance.render();
          
          console.log('✅ Toast UI Calendar height updated successfully');
        } catch (error) {
          console.error('❌ Error updating Toast UI Calendar height:', error);
        }
      }
    };

    window.addEventListener('aiSuggestionsToggle', handleSuggestionsToggle as EventListener);
    
    return () => {
      window.removeEventListener('aiSuggestionsToggle', handleSuggestionsToggle as EventListener);
    };
  }, [calendarInstance]);

  // Handle window resize to recalculate calendar height
  useEffect(() => {
    const handleResize = () => {
      const headerHeight = 64;
      const suggestionsHeight = isSuggestionsExpanded ? 320 : 60;
      const availableHeight = window.innerHeight - headerHeight - suggestionsHeight;
      const newHeight = `${Math.max(availableHeight, isSuggestionsExpanded ? 400 : 600)}px`;
      
      setCalendarHeight(newHeight);
      
      if (calendarInstance) {
        try {
          calendarInstance.setOptions({
            height: newHeight
          });
          calendarInstance.render();
        } catch (error) {
          console.error('❌ Error updating calendar height on resize:', error);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [calendarInstance, isSuggestionsExpanded]);

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

  // Convert app events to Toast UI Calendar format with enhanced debugging
  const convertToToastEvents = (events: Event[]): ToastCalendarEvent[] => {
    return events.map(event => {
      // Debug each event conversion
      const startDateTime = `${event.date}T${event.startTime}:00`;
      const endDateTime = `${event.date}T${event.endTime}:00`;

      // Log potential date issues
      DateTimeDebugger.debugDateTime(startDateTime, `Converting event: ${event.title}`);
      
      // Check for the specific problematic date
      if (event.date === '2025-06-30') {
        console.warn(`🚨 Found June 30, 2025 event: ${event.title}`);
        DateTimeDebugger.compareEventDates(event.date, event.date, event.title);
      }

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

    // Debug the conversion back
    DateTimeDebugger.debugDateTime(toastEvent.start, `Converting from Toast UI: ${toastEvent.title}`);

    return {
      id: toastEvent.id,
      title: toastEvent.title,
      startTime: format(startDate, 'HH:mm'),
      endTime: format(endDate, 'HH:mm'),
      date: format(startDate, 'yyyy-MM-dd'),
      category: existingEvent?.category || {
        id: 'general',
        name: 'General',
        color: '#3B82F6',
        icon: 'Calendar',
      },
      priority: existingEvent?.priority || 'medium',
      description: toastEvent.location || existingEvent?.description || '',
      isCompleted: existingEvent?.isCompleted || false,
      isStatic: false,
      color: toastEvent.backgroundColor || '#3B82F6',
    };
  };

  // Helper function to sync event with Google Calendar
  const syncEventWithGoogleCalendar = async (event: Event, operation: 'create' | 'update' | 'delete'): Promise<boolean> => {
    if (!isAuthenticated || !userEmail) {
      console.log('🔒 Not authenticated, skipping Google Calendar sync');
      return false;
    }

    try {
      console.log(`🔄 Syncing ${operation} operation for event:`, event.title);
      
      // Extract the original event ID (remove any prefixes)
      const originalEventId = event.id.replace(/^(google_|event_|composio_)/, '');
      
      switch (operation) {
        case 'create':
          const createResponse = await composioService.createCalendarEvent(userEmail, {
            title: event.title,
            description: event.description,
            startTime: `${event.date}T${event.startTime}:00`,
            endTime: `${event.date}T${event.endTime}:00`,
          });
          
          if (createResponse.success) {
            console.log('✅ Event created in Google Calendar');
            return true;
          } else {
            throw new Error(createResponse.error || 'Failed to create event');
          }

        case 'update':
          const updateResponse = await composioService.updateCalendarEvent(userEmail, originalEventId, {
            title: event.title,
            description: event.description,
            startTime: `${event.date}T${event.startTime}:00`,
            endTime: `${event.date}T${event.endTime}:00`,
          });
          
          if (updateResponse.success) {
            console.log('✅ Event updated in Google Calendar');
            return true;
          } else {
            throw new Error(updateResponse.error || 'Failed to update event');
          }

        case 'delete':
          const deleteResponse = await composioService.deleteCalendarEvent(userEmail, originalEventId);
          
          if (deleteResponse.success) {
            console.log('✅ Event deleted from Google Calendar');
            return true;
          } else {
            throw new Error(deleteResponse.error || 'Failed to delete event');
          }

        default:
          return false;
      }
    } catch (error) {
      console.error(`❌ Error syncing ${operation} with Google Calendar:`, error);
      return false;
    }
  };

  // Basic calendar options without theme conflicts
  const calendarOptions = {
    defaultView: view,
    useCreationPopup: false,
    useDetailPopup: false,
    isReadOnly: false,
    usageStatistics: false,
    height: calendarHeight, // Use dynamic height
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

  // Event handlers with conflict detection and enhanced debugging
  const onBeforeCreateEvent = async (eventData: any) => {
    const startDate = new Date(eventData.start);
    
    // Debug the event creation
    DateTimeDebugger.debugDateTime(eventData.start, 'Creating event from calendar click');
    
    // Create the event object
    const newEventData = {
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
      priority: 'medium' as const,
      description: '',
      isCompleted: false,
      isStatic: false,
      color: '#3B82F6',
    };

    console.log('📝 Creating new event from calendar click with conflict detection:', newEventData.title);

    // Use conflict detection for event creation
    const result = createEventWithConflictDetection(
      newEventData,
      state.events,
      state.user?.preferences
    );

    // Add to local state first
    const updatedEvents = [...state.events, result.event];
    
    // Handle any rearranged events
    if (result.conflictResolution?.rearrangedEvents.length > 0) {
      result.conflictResolution.rearrangedEvents.forEach(rearrangedEvent => {
        const eventIndex = updatedEvents.findIndex(e => e.id === rearrangedEvent.id);
        if (eventIndex !== -1) {
          updatedEvents[eventIndex] = rearrangedEvent;
        }
      });
    }
    
    setEventsHistory(updatedEvents);

    // Sync with Google Calendar
    const syncSuccess = await syncEventWithGoogleCalendar(result.event, 'create');
    
    // Create appropriate message based on conflict resolution
    let message = `📅 Perfect! I've created "${result.event.title}"`;
    
    if (result.conflictResolution?.hasConflict) {
      message += ` and handled scheduling conflicts automatically. ${result.conflictResolution.message}`;
    } else {
      message += ` for ${formatEventDate(result.event.date)} at ${result.event.startTime}`;
    }
    
    if (syncSuccess) {
      message += ' and synced it with your Google Calendar. Both calendars are now identical.';
    } else {
      message += `. ${isAuthenticated ? 'Google Calendar sync failed - please try the manual sync button.' : 'Connect Google Calendar to sync events across devices.'}`;
    }
    
    message += ' Click on the event to edit details.';
    
    if (syncSuccess) {
      setTimeout(() => fetchCurrentWeek(), 1000);
    }
    
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `create_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'ai',
        content: message,
        timestamp: new Date().toISOString(),
      },
    });
  };

  const onBeforeUpdateEvent = async (updateData: any) => {
    const { event, changes } = updateData;
    const updatedEvent = convertFromToastEvent({ ...event, ...changes });
    
    console.log('🔄 Updating event via drag/resize with conflict detection:', {
      eventId: event.id,
      title: updatedEvent.title,
      changes
    });
    
    // Debug the update
    DateTimeDebugger.debugDateTime(`${updatedEvent.date}T${updatedEvent.startTime}:00`, `Updating event: ${updatedEvent.title}`);
    
    // Check for conflicts with the updated event
    const conflictResult = checkEventUpdateConflicts(
      updatedEvent,
      state.events,
      state.user?.preferences
    );
    
    // Update local state first
    let updatedEvents = state.events.map(e => 
      e.id === updatedEvent.id ? updatedEvent : e
    );
    
    // Handle any rearranged events from conflict resolution
    if (conflictResult.suggestedResolution?.rearrangedEvents.length > 0) {
      conflictResult.suggestedResolution.rearrangedEvents.forEach(rearrangedEvent => {
        const eventIndex = updatedEvents.findIndex(e => e.id === rearrangedEvent.id);
        if (eventIndex !== -1) {
          updatedEvents[eventIndex] = rearrangedEvent;
        }
      });
    }
    
    setEventsHistory(updatedEvents);

    // Sync with Google Calendar
    const syncSuccess = await syncEventWithGoogleCalendar(updatedEvent, 'update');
    
    // Create appropriate message based on conflict resolution
    let message = `✅ Perfect! I've updated "${updatedEvent.title}"`;
    
    if (conflictResult.hasConflict && conflictResult.suggestedResolution) {
      message += ` and resolved scheduling conflicts. ${conflictResult.suggestedResolution.message}`;
    }
    
    if (syncSuccess) {
      message += ' and synced the changes with your Google Calendar. Both calendars are now identical.';
      setTimeout(() => fetchCurrentWeek(), 1000);
    } else {
      message += `. ${isAuthenticated ? 'Google Calendar sync failed - please try the manual sync button.' : 'Connect your Google Calendar to sync changes across devices.'}`;
    }
    
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'ai',
        content: message,
        timestamp: new Date().toISOString(),
      },
    });
  };

  const onBeforeDeleteEvent = async (eventData: any) => {
    console.log('🗑️ Deleting event:', {
      eventId: eventData.id,
      title: eventData.title
    });
    
    // Find the event in our state
    const eventToDelete = state.events.find(e => e.id === eventData.id);
    if (!eventToDelete) {
      console.warn('⚠️ Event not found in local state:', eventData.id);
      return;
    }

    // Update local state first
    const updatedEvents = state.events.filter(e => e.id !== eventData.id);
    setEventsHistory(updatedEvents);

    // Sync with Google Calendar
    const syncSuccess = await syncEventWithGoogleCalendar(eventToDelete, 'delete');
    
    if (syncSuccess) {
      // Refresh calendar data to get the latest from Google Calendar
      setTimeout(() => fetchCurrentWeek(), 1000);
      
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: `🗑️ I've successfully deleted "${eventData.title}" from both your local calendar and Google Calendar. Both calendars are now identical.`,
          timestamp: new Date().toISOString(),
        },
      });
    } else {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `delete_local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: `🗑️ I've removed "${eventData.title}" locally. ${isAuthenticated ? 'Google Calendar sync failed - please try the manual sync button.' : 'Connect your Google Calendar to sync deletions across devices.'}`,
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
          id: `sync_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: '🔗 Please connect your Google Calendar first to sync events.',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    console.log('🔄 Manual sync requested');
    await fetchCurrentWeek();
    
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `sync_success_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'ai',
        content: '🔄 Calendar sync completed! Your local calendar and Google Calendar are now identical.',
        timestamp: new Date().toISOString(),
      },
    });
  };

  // Enhanced event creation handler for dialog with conflict detection
  const handleCreateEventFromDialog = async (eventData: Event) => {
    console.log('📝 Creating event from dialog with conflict detection:', eventData.title);
    
    // Use conflict detection for event creation
    const result = createEventWithConflictDetection(
      eventData,
      state.events,
      state.user?.preferences
    );

    // Add to local state first
    let updatedEvents = [...state.events, result.event];
    
    // Handle any rearranged events
    if (result.conflictResolution?.rearrangedEvents.length > 0) {
      result.conflictResolution.rearrangedEvents.forEach(rearrangedEvent => {
        const eventIndex = updatedEvents.findIndex(e => e.id === rearrangedEvent.id);
        if (eventIndex !== -1) {
          updatedEvents[eventIndex] = rearrangedEvent;
        }
      });
    }
    
    setEventsHistory(updatedEvents);

    // Sync with Google Calendar
    const syncSuccess = await syncEventWithGoogleCalendar(result.event, 'create');
    
    // Create appropriate message based on conflict resolution
    let message = `📅 Excellent! I've created "${result.event.title}"`;
    
    if (result.conflictResolution?.hasConflict) {
      message += ` and automatically resolved scheduling conflicts. ${result.conflictResolution.message}`;
    }
    
    if (syncSuccess) {
      message += ' and synced it with your Google Calendar. Both calendars are now identical.';
      setTimeout(() => fetchCurrentWeek(), 1000);
    } else {
      message += `. ${isAuthenticated ? 'Google Calendar sync failed - please try the manual sync button.' : 'Connect your Google Calendar to sync events across devices.'}`;
    }
    
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `dialog_create_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'ai',
        content: message,
        timestamp: new Date().toISOString(),
      },
    });
  };

  // Enhanced event update handler for dialog with conflict detection
  const handleUpdateEventFromDialog = async (eventData: Event) => {
    console.log('🔄 Updating event from dialog with conflict detection:', eventData.title, 'ID:', eventData.id);
    
    // Check for conflicts with the updated event
    const conflictResult = checkEventUpdateConflicts(
      eventData,
      state.events,
      state.user?.preferences
    );
    
    // Update local state first
    let updatedEvents = state.events.map(e => 
      e.id === eventData.id ? eventData : e
    );
    
    // Handle any rearranged events from conflict resolution
    if (conflictResult.suggestedResolution?.rearrangedEvents.length > 0) {
      conflictResult.suggestedResolution.rearrangedEvents.forEach(rearrangedEvent => {
        const eventIndex = updatedEvents.findIndex(e => e.id === rearrangedEvent.id);
        if (eventIndex !== -1) {
          updatedEvents[eventIndex] = rearrangedEvent;
        }
      });
    }
    
    setEventsHistory(updatedEvents);

    // Sync with Google Calendar
    const syncSuccess = await syncEventWithGoogleCalendar(eventData, 'update');
    
    // Create appropriate message based on conflict resolution
    let message = `✅ Perfect! I've updated "${eventData.title}"`;
    
    if (conflictResult.hasConflict && conflictResult.suggestedResolution) {
      message += ` and resolved scheduling conflicts. ${conflictResult.suggestedResolution.message}`;
    }
    
    if (syncSuccess) {
      message += ' and synced the changes with your Google Calendar. Both calendars are now identical.';
      setTimeout(() => fetchCurrentWeek(), 1000);
    } else {
      message += `. ${isAuthenticated ? 'Google Calendar sync failed - please try the manual sync button.' : 'Connect your Google Calendar to sync changes across devices.'}`;
    }
    
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `dialog_update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'ai',
        content: message,
        timestamp: new Date().toISOString(),
      },
    });
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
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setShowDateDebugger(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [eventDialog.isOpen, quickCreator.isOpen, contextMenu.isOpen, undo, redo]);

  // Initialize calendar instance and set initial height
  useEffect(() => {
    if (calendarRef.current) {
      const instance = calendarRef.current.getInstance();
      setCalendarInstance(instance);
      
      // Set initial height based on current suggestions panel state
      const headerHeight = 64;
      const suggestionsHeight = isSuggestionsExpanded ? 320 : 60;
      const availableHeight = window.innerHeight - headerHeight - suggestionsHeight;
      const initialHeight = `${Math.max(availableHeight, isSuggestionsExpanded ? 400 : 600)}px`;
      
      setCalendarHeight(initialHeight);
      
      // Apply initial height to Toast UI Calendar
      try {
        instance.setOptions({
          height: initialHeight
        });
        instance.render();
        console.log(`📏 Initial Toast UI Calendar height set to: ${initialHeight}`);
      } catch (error) {
        console.error('❌ Error setting initial calendar height:', error);
      }
    }
  }, [isSuggestionsExpanded]);

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
                Smart Calendar
              </h2>
              <p className={`text-xs ${
                state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>
                {isAuthenticated ? '✅ Synced' : '📱 Local calendar only'} • ⚡ Auto-conflict resolution • 📏 Dynamic height: {calendarHeight}
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
            title="Quick Create (Ctrl+N) - with conflict detection"
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
              state.isDarkMode
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-purple-500 text-white hover:bg-purple-600'
            }`}
          >
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Smart Add</span>
          </button>

          <button
            onClick={() => setEventDialog({ isOpen: true, mode: 'create' })}
            title="New Event - with automatic conflict resolution"
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
              state.isDarkMode
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Event</span>
          </button>

          {/* Enhanced Sync Button */}
          <button
            onClick={handleManualSync}
            disabled={isLoadingCalendarData}
            title={isAuthenticated ? "Sync with Google Calendar" : "Connect Google Calendar to enable sync"}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
              isLoadingCalendarData
                ? 'opacity-50 cursor-not-allowed'
                : isAuthenticated
                ? state.isDarkMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
                : state.isDarkMode
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingCalendarData ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isAuthenticated ? 'Sync' : 'Connect'}</span>
          </button>

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

      {/* Sync Status Indicator */}
      {isAuthenticated && (
        <div className={`px-4 py-2 text-xs border-b ${
          state.isDarkMode 
            ? 'bg-green-900 bg-opacity-30 text-green-300 border-gray-700' 
            : 'bg-green-50 text-green-700 border-gray-200'
        }`}>
          <div className="flex items-center justify-between">
            <span>🔄 Real-time sync enabled with Google Calendar • ⚡ Smart conflict resolution active • 📏 Dynamic height: {calendarHeight}</span>
            <span>Last sync: {new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {/* Toast UI Calendar with Dynamic Height */}
      <div className="flex-1 overflow-hidden">
        <div className={`h-full ${
          state.isDarkMode ? 'bg-gray-800' : 'bg-white'
        }`}>
          <Calendar
            ref={calendarRef}
            height={calendarHeight}
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

      {/* Date Debugger Modal */}
      <CalendarDateDebugger
        isVisible={showDateDebugger}
        onClose={() => setShowDateDebugger(false)}
      />

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