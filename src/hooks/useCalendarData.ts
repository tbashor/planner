import { useState, useEffect, useCallback } from 'react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import composioService from '../services/composioService';
import { Event } from '../types';
import { mockEvents } from '../data/mockData';

interface CalendarDataState {
  events: Event[];
  isLoading: boolean;
  error: string | null;
  lastFetched: Date | null;
  isAuthenticated: boolean;
}

export function useCalendarData() {
  const { state, dispatch } = useApp();
  const { authState } = useAuth();
  const [calendarState, setCalendarState] = useState<CalendarDataState>({
    events: [],
    isLoading: false,
    error: null,
    lastFetched: null,
    isAuthenticated: false
  });

  // Use authentication from AuthContext
  const userEmail = authState.userEmail || state.user?.email;
  const isAuthenticated = authState.isAuthenticated && authState.connectionStatus === 'connected';

  // Update authentication status
  useEffect(() => {
    setCalendarState(prev => ({ ...prev, isAuthenticated }));
  }, [isAuthenticated]);

  // Convert Google Calendar events to app format
  const transformGoogleEvent = useCallback((googleEvent: {
    id: string;
    title?: string;
    description?: string;
    startTime?: string;
    endTime?: string;
    date?: string;
    location?: string;
    attendees?: Array<{ email: string; name?: string }>;
  }): Event => {
    const startTime = googleEvent.startTime || '';
    const endTime = googleEvent.endTime || '';
    const date = googleEvent.date || '';

    return {
      id: googleEvent.id,
      title: googleEvent.title || 'Untitled Event',
      description: googleEvent.description || '',
      startTime: startTime.includes('T') ? format(new Date(startTime), 'HH:mm') : startTime,
      endTime: endTime.includes('T') ? format(new Date(endTime), 'HH:mm') : endTime,
      date: date || (startTime ? format(new Date(startTime), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')),
      isCompleted: false,
      isStatic: false,
      priority: 'medium' as const,
      color: '#3B82F6',
      category: {
        id: 'google-calendar',
        name: 'Google Calendar',
        color: '#3B82F6',
        icon: '📅'
      }
    };
  }, []);

  // Fetch calendar events for a specific date range
  const fetchEvents = useCallback(async (startDate: Date, endDate: Date) => {
    if (!userEmail || !isAuthenticated) {
      console.log('📅 No authenticated user, using mock events');
      setCalendarState(prev => ({ 
        ...prev, 
        events: mockEvents, 
        isLoading: false, 
        error: null,
        lastFetched: new Date()
      }));
      return;
    }

    setCalendarState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      console.log(`📅 Fetching calendar events for ${userEmail}`);
      
      const response = await composioService.fetchCalendarEvents(
        userEmail,
        startDate,
        endDate
      );

      if (response.success && response.events) {
        console.log(`✅ Fetched ${response.events.length} real calendar events`);
        
        const transformedEvents = response.events.map(transformGoogleEvent);
        
        setCalendarState(prev => ({
          ...prev,
          events: transformedEvents,
          isLoading: false,
          error: null,
          lastFetched: new Date()
        }));

        // Update app state with real events
        dispatch({ type: 'SET_EVENTS', payload: transformedEvents });
      } else {
        console.warn('⚠️ Failed to fetch calendar events, using mock data:', response.error);
        
        // Fallback to mock events
        setCalendarState(prev => ({
          ...prev,
          events: mockEvents,
          isLoading: false,
          error: `Calendar sync issue: ${response.error}. Showing sample events.`,
          lastFetched: new Date()
        }));
      }
    } catch (error) {
      console.error('❌ Error fetching calendar events:', error);
      
      // Fallback to mock events
      setCalendarState(prev => ({
        ...prev,
        events: mockEvents,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load calendar events',
        lastFetched: new Date()
      }));
    }
  }, [userEmail, isAuthenticated, transformGoogleEvent, dispatch]);

  // Fetch events for current week
  const fetchCurrentWeek = useCallback(() => {
    const weekStart = startOfWeek(state.currentWeek, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(state.currentWeek, { weekStartsOn: 0 });
    
    return fetchEvents(weekStart, weekEnd);
  }, [state.currentWeek, fetchEvents]);

  // Auto-fetch events when user authenticates or week changes
  useEffect(() => {
    if (isAuthenticated && userEmail) {
      fetchCurrentWeek();
    } else {
      // Use mock events for unauthenticated users
      setCalendarState(prev => ({ 
        ...prev, 
        events: mockEvents, 
        isLoading: false, 
        error: null,
        lastFetched: new Date()
      }));
    }
  }, [isAuthenticated, userEmail, fetchCurrentWeek]);

  // Create a new event
  const createEvent = useCallback(async (eventData: {
    title: string;
    description?: string;
    startTime: string; // ISO string
    endTime: string; // ISO string
    attendees?: string[];
  }) => {
    if (!userEmail || !isAuthenticated) {
      throw new Error('User must be authenticated to create events');
    }

    setCalendarState(prev => ({ ...prev, isLoading: true }));

    try {
      const response = await composioService.createCalendarEvent(userEmail, eventData);
      
      if (response.success && response.event) {
        console.log('✅ Created calendar event:', response.event.id);
        
        // Refresh events to include the new one
        await fetchCurrentWeek();
        
        return response.event;
      } else {
        throw new Error(response.error || 'Failed to create event');
      }
    } catch (error) {
      console.error('❌ Error creating event:', error);
      setCalendarState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [userEmail, isAuthenticated, fetchCurrentWeek]);

  // Update an existing event
  const updateEvent = useCallback(async (eventId: string, eventData: {
    title?: string;
    description?: string;
    startTime?: string; // ISO string
    endTime?: string; // ISO string
  }) => {
    if (!userEmail || !isAuthenticated) {
      throw new Error('User must be authenticated to update events');
    }

    setCalendarState(prev => ({ ...prev, isLoading: true }));

    try {
      const response = await composioService.updateCalendarEvent(userEmail, eventId, eventData);
      
      if (response.success && response.event) {
        console.log('✅ Updated calendar event:', eventId);
        
        // Refresh events to show the update
        await fetchCurrentWeek();
        
        return response.event;
      } else {
        throw new Error(response.error || 'Failed to update event');
      }
    } catch (error) {
      console.error('❌ Error updating event:', error);
      setCalendarState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [userEmail, isAuthenticated, fetchCurrentWeek]);

  // Delete an event
  const deleteEvent = useCallback(async (eventId: string) => {
    if (!userEmail || !isAuthenticated) {
      throw new Error('User must be authenticated to delete events');
    }

    setCalendarState(prev => ({ ...prev, isLoading: true }));

    try {
      const response = await composioService.deleteCalendarEvent(userEmail, eventId);
      
      if (response.success) {
        console.log('✅ Deleted calendar event:', eventId);
        
        // Refresh events to remove the deleted one
        await fetchCurrentWeek();
        
        return true;
      } else {
        throw new Error(response.error || 'Failed to delete event');
      }
    } catch (error) {
      console.error('❌ Error deleting event:', error);
      setCalendarState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [userEmail, isAuthenticated, fetchCurrentWeek]);

  return {
    events: calendarState.events,
    isLoading: calendarState.isLoading,
    error: calendarState.error,
    lastFetched: calendarState.lastFetched,
    isAuthenticated: calendarState.isAuthenticated,
    userEmail,
    fetchEvents,
    fetchCurrentWeek,
    createEvent,
    updateEvent,
    deleteEvent
  };
} 