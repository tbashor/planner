import React, { useRef, useEffect, useState } from 'react';
import Calendar from '@toast-ui/react-calendar';
import '@toast-ui/calendar/dist/toastui-calendar.min.css';
import { useApp } from '../../contexts/AppContext';
import { Event } from '../../types';
import { format, parseISO, addDays, startOfWeek, endOfWeek } from 'date-fns';
import { googleCalendarService } from '../../services/googleCalendarService';
import EventDialog from '../EventManagement/EventDialog';
import QuickEventCreator from '../EventManagement/QuickEventCreator';
import EventContextMenu from '../EventManagement/EventContextMenu';
import { Plus, Zap, Undo, Redo } from 'lucide-react';
import { useUndoRedo } from '../../hooks/useUndoRedo';

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
  const calendarRef = useRef<any>(null);
  const [view, setView] = useState<'month' | 'week' | 'day'>('week');
  const [isLoadingGoogleEvents, setIsLoadingGoogleEvents] = useState(false);
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  
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
        isReadOnly: false,
        location: event.description || '',
        raw: event,
      };
    });
  };

  // Convert Toast UI event back to app event format
  const convertFromToastEvent = (toastEvent: any): Event => {
    const startDate = new Date(toastEvent.start);
    const endDate = new Date(toastEvent.end);

    return {
      id: toastEvent.id,
      title: toastEvent.title,
      startTime: format(startDate, 'HH:mm'),
      endTime: format(endDate, 'HH:mm'),
      date: format(startDate, 'yyyy-MM-dd'),
      category: state.events.find(e => e.id === toastEvent.id)?.category || {
        id: 'general',
        name: 'General',
        color: toastEvent.backgroundColor || '#3B82F6',
        icon: 'Calendar',
      },
      priority: state.events.find(e => e.id === toastEvent.id)?.priority || 'medium',
      description: toastEvent.location || '',
      isCompleted: state.events.find(e => e.id === toastEvent.id)?.isCompleted || false,
      isStatic: false,
      color: toastEvent.backgroundColor || '#3B82F6',
    };
  };

  // Load Google Calendar events for the current view
  const loadGoogleCalendarEvents = async (viewDate: Date) => {
    if (!googleCalendarService.isAuthenticated()) {
      return;
    }

    setIsLoadingGoogleEvents(true);
    
    try {
      let startDate: Date;
      let endDate: Date;

      switch (view) {
        case 'month':
          startDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
          endDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
          break;
        case 'week':
          startDate = startOfWeek(viewDate, { weekStartsOn: 0 });
          endDate = endOfWeek(viewDate, { weekStartsOn: 0 });
          break;
        case 'day':
          startDate = new Date(viewDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(viewDate);
          endDate.setHours(23, 59, 59, 999);
          break;
        default:
          startDate = startOfWeek(viewDate, { weekStartsOn: 0 });
          endDate = endOfWeek(viewDate, { weekStartsOn: 0 });
      }

      const googleEvents = await googleCalendarService.getEvents('primary', startDate, endDate);
      
      const existingGoogleEventIds = new Set(
        state.events
          .filter(e => e.id.startsWith('google_'))
          .map(e => e.id)
      );
      
      const newGoogleEvents = googleEvents.filter(e => !existingGoogleEventIds.has(e.id));
      
      if (newGoogleEvents.length > 0) {
        const updatedEvents = [...state.events, ...newGoogleEvents];
        setEventsHistory(updatedEvents);
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: Date.now().toString(),
            type: 'ai',
            content: `📅 I've synced ${newGoogleEvents.length} events from your Google Calendar for this ${view}. You can now drag and edit these events directly!`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('Error loading Google Calendar events:', error);
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: '⚠️ I had trouble syncing your Google Calendar events. Please check your connection and try again.',
          timestamp: new Date().toISOString(),
        },
      });
    } finally {
      setIsLoadingGoogleEvents(false);
    }
  };

  // Create theme configuration that avoids read-only property issues
  const createThemeConfig = () => {
    if (!state.isDarkMode) {
      return {}; // Use default theme for light mode
    }

    // Create a completely new theme object to avoid read-only issues
    return {
      common: {
        backgroundColor: '#111827',
        border: '1px solid #374151',
        gridSelection: {
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid #3B82F6',
        },
      },
      week: {
        dayGridLeft: {
          backgroundColor: '#1F2937',
          borderRight: '1px solid #374151',
        },
        timeGridLeft: {
          backgroundColor: '#1F2937',
          borderRight: '1px solid #374151',
        },
        timeGridLeftAdditionalTimezone: {
          backgroundColor: '#374151',
        },
        timeGridHalfHourLine: {
          borderBottom: '1px dotted #4B5563',
        },
        timeGridHourLine: {
          borderBottom: '1px solid #374151',
        },
        nowIndicatorLabel: {
          color: '#3B82F6',
        },
        nowIndicatorPast: {
          border: '1px dashed #3B82F6',
        },
        nowIndicatorBullet: {
          backgroundColor: '#3B82F6',
        },
        nowIndicatorToday: {
          border: '1px solid #3B82F6',
        },
        pastTime: {
          color: '#6B7280',
        },
        futureTime: {
          color: '#D1D5DB',
        },
        weekend: {
          backgroundColor: '#1F2937',
        },
      },
      month: {
        dayExceptThisMonth: {
          color: '#4B5563',
        },
        holidayExceptThisMonth: {
          color: '#4B5563',
        },
        weekend: {
          backgroundColor: '#1F2937',
        },
      },
    };
  };

  // Calendar options with proper theme handling
  const getCalendarOptions = () => {
    const baseOptions = {
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
      ],
    };

    // Only add theme if in dark mode
    const themeConfig = createThemeConfig();
    if (Object.keys(themeConfig).length > 0) {
      return { ...baseOptions, theme: themeConfig };
    }

    return baseOptions;
  };

  // Event handlers
  const onBeforeCreateEvent = (eventData: any) => {
    // Open our custom dialog instead of using the default popup
    const startDate = new Date(eventData.start);
    setEventDialog({
      isOpen: true,
      mode: 'create',
      event: null,
      initialDate: format(startDate, 'yyyy-MM-dd'),
      initialTime: format(startDate, 'HH:mm'),
    });
  };

  const onBeforeUpdateEvent = async (updateData: any) => {
    const { event, changes } = updateData;
    const updatedEvent = convertFromToastEvent({ ...event, ...changes });
    
    // Save to history for undo/redo
    const updatedEvents = state.events.map(e => 
      e.id === updatedEvent.id ? updatedEvent : e
    );
    setEventsHistory(updatedEvents);

    // If it's a Google Calendar event, sync the changes back to Google Calendar
    if (event.id.startsWith('google_')) {
      try {
        const success = await googleCalendarService.updateEvent(updatedEvent);
        
        if (success) {
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: Date.now().toString(),
              type: 'ai',
              content: `✅ Perfect! I've updated "${updatedEvent.title}" both locally and in your Google Calendar. The changes are synced across all your devices.`,
              timestamp: new Date().toISOString(),
            },
          });
        } else {
          // Revert local changes if Google Calendar update failed
          undo();
          
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: Date.now().toString(),
              type: 'ai',
              content: `⚠️ I updated "${updatedEvent.title}" locally, but couldn't sync the changes to Google Calendar. The changes have been reverted. Please check your connection and try again.`,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch (error) {
        console.error('Error updating Google Calendar event:', error);
        undo();
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: Date.now().toString(),
            type: 'ai',
            content: `❌ I couldn't update "${updatedEvent.title}" in Google Calendar. The changes have been reverted. Please try again.`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } else {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `✅ I've updated "${updatedEvent.title}" in your schedule. The new timing looks good for your productivity!`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  };

  const onBeforeDeleteEvent = async (eventData: any) => {
    // Save to history for undo/redo
    const updatedEvents = state.events.filter(e => e.id !== eventData.id);
    setEventsHistory(updatedEvents);

    // If it's a Google Calendar event, delete from Google Calendar too
    if (eventData.id.startsWith('google_')) {
      try {
        const success = await googleCalendarService.deleteEvent(eventData.id);
        
        if (success) {
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
          // Revert deletion if Google Calendar deletion failed
          undo();
          
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: Date.now().toString(),
              type: 'ai',
              content: `⚠️ I removed "${eventData.title}" locally, but couldn't delete it from Google Calendar. The event has been restored. Please try again.`,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch (error) {
        console.error('Error deleting Google Calendar event:', error);
        undo();
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: Date.now().toString(),
            type: 'ai',
            content: `❌ I couldn't delete "${eventData.title}" from Google Calendar. The event has been restored. Please try again.`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } else {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `🗑️ I've removed "${eventData.title}" from your schedule. Would you like me to suggest alternative activities for that time slot?`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  };

  const onClickEvent = (eventData: any) => {
    const event = state.events.find(e => e.id === eventData.event.id);
    if (event) {
      setEventDialog({
        isOpen: true,
        mode: 'view',
        event: event,
      });
    }
  };

  const onRightClickEvent = (eventData: any) => {
    const event = state.events.find(e => e.id === eventData.event.id);
    if (event) {
      setContextMenu({
        isOpen: true,
        event: event,
        position: { x: eventData.nativeEvent.clientX, y: eventData.nativeEvent.clientY },
      });
    }
  };

  // Navigation handlers
  const handleViewChange = (newView: 'month' | 'week' | 'day') => {
    setView(newView);
    if (calendarRef.current) {
      calendarRef.current.getInstance().changeView(newView);
      loadGoogleCalendarEvents(currentCalendarDate);
    }
  };

  const handleNavigation = (direction: 'prev' | 'next' | 'today') => {
    if (calendarRef.current) {
      const calendarInstance = calendarRef.current.getInstance();
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
      
      loadGoogleCalendarEvents(newDate);
    }
  };

  const handleManualSync = async () => {
    if (!googleCalendarService.isAuthenticated()) {
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

    await loadGoogleCalendarEvents(currentCalendarDate);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when no dialog is open
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

  // Load Google Calendar events when component mounts or authentication changes
  useEffect(() => {
    if (googleCalendarService.isAuthenticated()) {
      loadGoogleCalendarEvents(currentCalendarDate);
    }
  }, [view]);

  // Update calendar when events change
  useEffect(() => {
    if (calendarRef.current) {
      const calendarInstance = calendarRef.current.getInstance();
      const toastEvents = convertToToastEvents(state.events);
      calendarInstance.clear();
      calendarInstance.createEvents(toastEvents);
    }
  }, [state.events]);

  // Update theme when dark mode changes
  useEffect(() => {
    if (calendarRef.current) {
      const calendarInstance = calendarRef.current.getInstance();
      const themeConfig = createThemeConfig();
      if (Object.keys(themeConfig).length > 0) {
        calendarInstance.setTheme(themeConfig);
      } else {
        // Reset to default theme for light mode
        calendarInstance.setTheme({});
      }
    }
  }, [state.isDarkMode]);

  // Load initial Google Calendar events
  useEffect(() => {
    if (googleCalendarService.isAuthenticated()) {
      loadGoogleCalendarEvents(currentCalendarDate);
    }
  }, []);

  const calendarOptions = getCalendarOptions();

  return (
    <div className={`flex-1 flex flex-col h-full ${
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
          
          <h2 className={`text-xl font-semibold ${
            state.isDarkMode ? 'text-white' : 'text-gray-900'
          }`}>
            Calendar
          </h2>

          {/* Loading indicator */}
          {isLoadingGoogleEvents && (
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
          {googleCalendarService.isAuthenticated() && (
            <button
              onClick={handleManualSync}
              disabled={isLoadingGoogleEvents}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                isLoadingGoogleEvents
                  ? 'opacity-50 cursor-not-allowed'
                  : state.isDarkMode
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Sync
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
      <div className="flex-1 p-4">
        <div className={`h-full rounded-lg overflow-hidden ${
          state.isDarkMode ? 'bg-gray-800' : 'bg-white'
        }`}>
          <Calendar
            ref={calendarRef}
            height="800px"
            view={view}
            events={convertToToastEvents(state.events)}
            calendars={calendarOptions.calendars}
            theme={calendarOptions.theme}
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
      />

      <QuickEventCreator
        isOpen={quickCreator.isOpen}
        onClose={() => setQuickCreator({ isOpen: false })}
        initialDate={quickCreator.initialDate}
        initialTime={quickCreator.initialTime}
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