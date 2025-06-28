import { useState, useEffect, useCallback, useRef } from 'react';
import { Event } from '../types';
import { startOfWeek, endOfWeek } from 'date-fns';
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
        
        // Transform Composio events to app format
        const transformedEvents: Event[] = response.events.map(event => ({
          id: event.id,
          title: event.title || 'Untitled Event',
          description: event.description || '',
          startTime: event.startTime || '09:00',
          endTime: event.endTime || '10:00',
          date: event.date || new Date().toISOString().split('T')[0],
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
        }));
        
        return transformedEvents;
      } else {
        console.warn('⚠️ Failed to fetch calendar events via Composio:', response.error);
        return mockEvents;
      }
    } catch (error) {
      console.error('❌ Error fetching calendar events via Composio:', error);
      throw error;
    }
  }, [isAuthenticated, authState.userEmail]);

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

      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday start
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 }); // Saturday end

      console.log(`📅 Fetching events for week: ${weekStart.toISOString()} to ${weekEnd.toISOString()}`);

      const weekEvents = await fetchEvents(weekStart, weekEnd);
      
      if (isMountedRef.current) {
        setEvents(weekEvents);
      }
    } catch (error) {
      console.error('❌ Error fetching current week events:', error);
      if (isMountedRef.current) {
        if (!isAuthenticated) {
          // If not authenticated, use mock events instead of showing error
          setEvents(mockEvents);
          setError('Connect your Google Calendar via the AI assistant to see your real events.');
        } else {
          setError(`Failed to fetch calendar events: ${error instanceof Error ? error.message : 'Unknown error'}`);
          setEvents([]);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [fetchEvents, isAuthenticated, state.currentWeek]);

  /**
   * Create a new event using Composio calendar tools
   */
  const createEvent = useCallback(async (eventData: Omit<Event, 'id'>): Promise<boolean> => {
    if (!isAuthenticated || !authState.userEmail) {
      throw new Error('Not authenticated with Google Calendar via Composio');
    }

    try {
      console.log(`📝 Creating event via Composio: ${eventData.title}`);
      
      const response = await composioService.createCalendarEvent(authState.userEmail, {
        title: eventData.title,
        description: eventData.description,
        startTime: `${eventData.date}T${eventData.startTime}:00`,
        endTime: `${eventData.date}T${eventData.endTime}:00`,
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
   * Update an existing event using Composio calendar tools
   */
  const updateEvent = useCallback(async (event: Event): Promise<boolean> => {
    if (!isAuthenticated || !authState.userEmail) {
      throw new Error('Not authenticated with Google Calendar via Composio');
    }

    try {
      console.log(`✏️ Updating event via Composio: ${event.title}`);
      
      const response = await composioService.updateCalendarEvent(authState.userEmail, event.id, {
        title: event.title,
        description: event.description,
        startTime: `${event.date}T${event.startTime}:00`,
        endTime: `${event.date}T${event.endTime}:00`,
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