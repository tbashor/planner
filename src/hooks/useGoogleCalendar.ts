import { useState, useEffect } from 'react';
import { googleCalendarService } from '../services/googleCalendarService';
import { Event } from '../types';

export function useGoogleCalendar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsAuthenticated(googleCalendarService.isAuthenticated());
  }, []);

  const signIn = () => {
    const authUrl = googleCalendarService.getAuthUrl();
    window.location.href = authUrl;
  };

  const signOut = () => {
    googleCalendarService.signOut();
    setIsAuthenticated(false);
    setError(null);
  };

  const syncEvents = async (weekStart: Date): Promise<Event[]> => {
    if (!isAuthenticated) {
      throw new Error('Not authenticated with Google Calendar');
    }

    setIsLoading(true);
    setError(null);

    try {
      const events = await googleCalendarService.getWeekEvents(weekStart);
      return events;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sync events';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const getCalendars = async () => {
    if (!isAuthenticated) {
      return [];
    }

    try {
      return await googleCalendarService.getCalendarList();
    } catch (err) {
      setError('Failed to load calendars');
      return [];
    }
  };

  return {
    isAuthenticated,
    isLoading,
    error,
    signIn,
    signOut,
    syncEvents,
    getCalendars,
  };
}