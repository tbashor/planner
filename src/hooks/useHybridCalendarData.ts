import { useState, useEffect, useCallback, useRef } from 'react';
import { Event } from '../types';
import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns';
import { composioService } from '../services/composioService';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { mockEvents } from '../data/mockData';

export interface UseHybridCalendarDataReturn {
  events: Event[];
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  userEmail: string | null;
  authenticationMethod: 'external' | 'oauth' | 'none';
  fetchCurrentWeek: () => Promise<void>;
  fetchEvents: (startDate: Date, endDate: Date) => Promise<Event[]>;
  createEvent: (event: Omit<Event, 'id'>) => Promise<boolean>;
  updateEvent: (event: Event) => Promise<boolean>;
  deleteEvent: (eventId: string) => Promise<boolean>;
  refreshTokens: () => Promise<void>;
}

export function useHybridCalendarData(): UseHybridCalendarDataReturn {
  const { authState } = useAuth();
  const { state } = useApp();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  // Check if user is authenticated via Composio
  const isAuthenticated = authState.isAuthenticated && authState.connectionStatus === 'connected';

  // Set user email from auth state
  useEffect(() => {
    if (authState.userEmail) {
      setUserEmail(authState.userEmail);
    }
  }, [authState.userEmail]);

  /**
   * Transform Composio calendar event to app format with proper timezone handling
   */
  const transformComposioEventToAppEvent = useCallback((composioEvent: any): Event => {
    console.log('🔄 Transforming Composio event:', composioEvent);
    
    let startTime = '09:00';
    let endTime = '10:00';
    let eventDate = format(new Date(), 'yyyy-MM-dd');

    try {
      // Handle different date/time formats from Google Calendar
      if (composioEvent.startTime) {
        let startDateTime: Date;
        
        if (composioEvent.startTime.includes('T')) {
          // ISO format with timezone: "2025-01-21T18:15:00-08:00"
          startDateTime = parseISO(composioEvent.startTime);
        } else if (composioEvent.startTime.includes(' ')) {
          // Format: "2025-01-21 18:15:00"
          startDateTime = new Date(composioEvent.startTime);
        } else {
          // Just time: "18:15"
          startDateTime = new Date();
          const [hours, minutes] = composioEvent.startTime.split(':').map(Number);
          startDateTime.setHours(hours, minutes, 0, 0);
        }

        // Ensure we have a valid date
        if (!isNaN(startDateTime.getTime())) {
          eventDate = format(startDateTime, 'yyyy-MM-dd');
          startTime = format(startDateTime, 'HH:mm');
          console.log(`✅ Parsed start time: ${composioEvent.startTime} -> ${eventDate} ${startTime}`);
        } else {
          console.warn('⚠️ Invalid start time, using default:', composioEvent.startTime);
        }
      }

      if (composioEvent.endTime) {
        let endDateTime: Date;
        
        if (composioEvent.endTime.includes('T')) {
          // ISO format with timezone
          endDateTime = parseISO(composioEvent.endTime);
        } else if (composioEvent.endTime.includes(' ')) {
          // Format: "2025-01-21 19:15:00"
          endDateTime = new Date(composioEvent.endTime);
        } else {
          // Just time: "19:15"
          endDateTime = new Date();
          const [hours, minutes] = composioEvent.endTime.split(':').map(Number);
          endDateTime.setHours(hours, minutes, 0, 0);
        }

        // Ensure we have a valid date
        if (!isNaN(endDateTime.getTime())) {
          endTime = format(endDateTime, 'HH:mm');
          console.log(`✅ Parsed end time: ${composioEvent.endTime} -> ${endTime}`);
        } else {
          console.warn('⚠️ Invalid end time, using default:', composioEvent.endTime);
        }
      }

      // Handle date field separately if provided
      if (composioEvent.date) {
        try {
          const dateObj = new Date(composioEvent.date);
          if (!isNaN(dateObj.getTime())) {
            eventDate = format(dateObj, 'yyyy-MM-dd');
            console.log(`✅ Parsed date: ${composioEvent.date} -> ${eventDate}`);
          }
        } catch (dateError) {
          console.warn('⚠️ Error parsing date field:', composioEvent.date, dateError);
        }
      }

    } catch (error) {
      console.error('❌ Error parsing event times:', error, composioEvent);
    }

    const transformedEvent: Event = {
      id: composioEvent.id || `composio_${Date.now()}_${Math.random()}`,
      title: composioEvent.title || composioEvent.summary || 'Untitled Event',
      description: composioEvent.description || '',
      startTime,
      endTime,
      date: eventDate,
      isCompleted: false,
      isStatic: false,
      priority: 'medium' as const,
      color: '#3B82F6',
      category: {
        id: 'composio-calendar',
        name: 'Google Calendar',
        color: '#3B82F6',
        icon: '📅'
      }
    };

    console.log('✅ Transformed event:', {
      original: composioEvent,
      transformed: transformedEvent
    });

    return transformedEvent;
  }, []);

  /**
   * Fetch events for a date range using Composio calendar tools
   */
  const fetchEvents = useCallback(async (startDate: Date, endDate: Date): Promise<Event[]> => {
    if (!isAuthenticated || !authState.userEmail) {
      console.log('🔍 No Composio authentication, returning mock events');
      return mockEvents;
    }

    try {
      console.log(`📅 Fetching events via Composio from ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      const response = await composioService.fetchCalendarEvents(
        authState.userEmail,
        startDate,
        endDate
      );

      if (response.success && response.events) {
        console.log(`✅ Retrieved ${response.events.length} events via Composio`);
        
        // If we got an empty array but with a message about tool unavailability, fall back to mock events
        if (response.events.length === 0 && response.message && response.message.includes('tool not available')) {
          console.log('📝 Google Calendar list tool not available, using mock events');
          return mockEvents;
        }
        
        // Transform Composio events to app format with proper timezone handling
        const transformedEvents: Event[] = response.events.map(transformComposioEventToAppEvent);
        
        console.log(`🔄 Transformed ${transformedEvents.length} events with proper timezone handling`);
        return transformedEvents;
      } else {
        console.warn('⚠️ Failed to fetch calendar events via Composio:', response.error);
        
        // Check if this is a connection error
        if (response.error && (
          response.error.includes('No connection found') ||
          response.error.includes('Cannot fetch events') ||
          response.error.includes('403') ||
          response.error.includes('Forbidden')
        )) {
          // This is a connection issue, not a general error
          console.log('🔗 Connection issue detected, user needs to setup Composio connection');
          throw new Error('Google Calendar connection not found. Please use the "Setup Connection" button in the AI assistant to connect your calendar.');
        }
        
        return mockEvents;
      }
    } catch (error) {
      console.error('❌ Error fetching calendar events via Composio:', error);
      
      // Check if this is a connection-related error
      if (error instanceof Error && (
        error.message.includes('No connection found') ||
        error.message.includes('Cannot fetch events') ||
        error.message.includes('403') ||
        error.message.includes('Forbidden') ||
        error.message.includes('connection not found')
      )) {
        // Re-throw connection errors so they can be handled appropriately
        throw error;
      }
      
      // For other errors, fall back to mock events
      console.log('📝 Falling back to mock events due to error');
      return mockEvents;
    }
  }, [isAuthenticated, authState.userEmail, transformComposioEventToAppEvent]);

  /**
   * Fetch events for the current week
   */
  const fetchCurrentWeek = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    setIsLoading(true);
    setError(null);

    try {
      // Use the current week from app state, or fallback to current date
      // Ensure we have a valid Date object
      let currentDate = new Date();
      
      if (state.currentWeek) {
        // Check if state.currentWeek is a valid Date
        const stateDate = new Date(state.currentWeek);
        if (!isNaN(stateDate.getTime())) {
          currentDate = stateDate;
        } else {
          console.warn('⚠️ Invalid date in state.currentWeek, using current date instead');
        }
      }

      // Use user's local timezone for week calculation
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday start
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 }); // Saturday end

      console.log(`📅 Fetching events for week in local timezone: ${format(weekStart, 'yyyy-MM-dd')} to ${format(weekEnd, 'yyyy-MM-dd')}`);
      console.log(`🌍 User timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

      const weekEvents = await fetchEvents(weekStart, weekEnd);
      
      if (isMountedRef.current) {
        setEvents(weekEvents);
        console.log(`✅ Successfully loaded ${weekEvents.length} events for the week`);
      }
    } catch (error) {
      console.error('❌ Error fetching current week events:', error);
      if (isMountedRef.current) {
        if (!isAuthenticated) {
          // If not authenticated, use mock events instead of showing error
          setEvents(mockEvents);
          setError('Connect your Google Calendar via the AI assistant to see your real events.');
        } else if (error instanceof Error && (
          error.message.includes('connection not found') ||
          error.message.includes('No connection found') ||
          error.message.includes('Setup Connection')
        )) {
          // Connection-specific error
          setEvents(mockEvents);
          setError('Google Calendar connection needed. Use "Setup Connection" in the AI assistant to connect your calendar.');
        } else {
          // If authenticated but connection failed, show mock events with appropriate message
          setEvents(mockEvents);
          setError('Connection to Google Calendar failed. Showing sample events instead.');
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [fetchEvents, isAuthenticated, state.currentWeek]);

  /**
   * Create a new event using Composio calendar tools with proper timezone handling
   */
  const createEvent = useCallback(async (eventData: Omit<Event, 'id'>): Promise<boolean> => {
    if (!isAuthenticated || !authState.userEmail) {
      throw new Error('Not authenticated with Google Calendar via Composio');
    }

    try {
      console.log(`📝 Creating event via Composio: ${eventData.title}`);
      
      // Convert to user's local timezone for Google Calendar
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startDateTime = `${eventData.date}T${eventData.startTime}:00`;
      const endDateTime = `${eventData.date}T${eventData.endTime}:00`;
      
      console.log(`🌍 Creating event in timezone ${userTimezone}:`, {
        title: eventData.title,
        startDateTime,
        endDateTime
      });
      
      const response = await composioService.createCalendarEvent(authState.userEmail, {
        title: eventData.title,
        description: eventData.description,
        startTime: startDateTime,
        endTime: endDateTime,
      });
      
      if (response.success) {
        console.log('✅ Event created successfully via Composio');
        // Refresh events after creation
        await fetchCurrentWeek();
        return true;
      } else {
        throw new Error(response.error || 'Failed to create event');
      }
    } catch (error) {
      console.error('❌ Error creating event via Composio:', error);
      throw error;
    }
  }, [isAuthenticated, authState.userEmail, fetchCurrentWeek]);

  /**
   * Update an existing event using Composio calendar tools with proper timezone handling
   */
  const updateEvent = useCallback(async (event: Event): Promise<boolean> => {
    if (!isAuthenticated || !authState.userEmail) {
      throw new Error('Not authenticated with Google Calendar via Composio');
    }

    try {
      console.log(`✏️ Updating event via Composio: ${event.title}`);
      
      // Convert to user's local timezone for Google Calendar
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startDateTime = `${event.date}T${event.startTime}:00`;
      const endDateTime = `${event.date}T${event.endTime}:00`;
      
      console.log(`🌍 Updating event in timezone ${userTimezone}:`, {
        title: event.title,
        startDateTime,
        endDateTime
      });
      
      const response = await composioService.updateCalendarEvent(authState.userEmail, event.id, {
        title: event.title,
        description: event.description,
        startTime: startDateTime,
        endTime: endDateTime,
      });
      
      if (response.success) {
        console.log('✅ Event updated successfully via Composio');
        // Refresh events after update
        await fetchCurrentWeek();
        return true;
      } else {
        throw new Error(response.error || 'Failed to update event');
      }
    } catch (error) {
      console.error('❌ Error updating event via Composio:', error);
      throw error;
    }
  }, [isAuthenticated, authState.userEmail, fetchCurrentWeek]);

  /**
   * Delete an event using Composio calendar tools
   */
  const deleteEvent = useCallback(async (eventId: string): Promise<boolean> => {
    if (!isAuthenticated || !authState.userEmail) {
      throw new Error('Not authenticated with Google Calendar via Composio');
    }

    try {
      console.log(`🗑️ Deleting event via Composio: ${eventId}`);
      
      const response = await composioService.deleteCalendarEvent(authState.userEmail, eventId);
      
      if (response.success) {
        console.log('✅ Event deleted successfully via Composio');
        // Refresh events after deletion
        await fetchCurrentWeek();
        return true;
      } else {
        throw new Error(response.error || 'Failed to delete event');
      }
    } catch (error) {
      console.error('❌ Error deleting event via Composio:', error);
      throw error;
    }
  }, [isAuthenticated, authState.userEmail, fetchCurrentWeek]);

  /**
   * Refresh tokens - not needed for Composio approach, but kept for interface compatibility
   */
  const refreshTokens = useCallback(async () => {
    console.log('🔄 Refresh tokens called (not needed for Composio approach)');
    // For Composio, we just re-fetch the current week
    await fetchCurrentWeek();
  }, [fetchCurrentWeek]);

  // Fetch current week events when authentication state changes
  useEffect(() => {
    isMountedRef.current = true;
    
    // Always fetch events, whether authenticated or not
    fetchCurrentWeek();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchCurrentWeek]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    events,
    isLoading,
    error,
    isAuthenticated,
    userEmail,
    authenticationMethod: isAuthenticated ? 'external' : 'none',
    fetchCurrentWeek,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    refreshTokens,
  };
}