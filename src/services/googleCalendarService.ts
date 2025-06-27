import { Event } from '../types';
import { format, parseISO } from 'date-fns';
import { oauthService } from './oauthService';
import { serverApiService } from './serverApiService';

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  status: string;
  htmlLink?: string;
  colorId?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
  }>;
}

interface GoogleCalendarListResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

class GoogleCalendarService {
  private readonly baseUrl = 'https://www.googleapis.com/calendar/v3';

  constructor() {
    console.log('🔧 Google Calendar Service initialized');
    console.log('- Base URL:', this.baseUrl);
    console.log('- Using OAuth service for authentication');
    console.log('- Server API integration enabled');
  }

  /**
   * Check if the user is authenticated
   */
  isAuthenticated(): boolean {
    return oauthService.isAuthenticated();
  }

  /**
   * Sign out the user
   */
  signOut() {
    oauthService.clearTokens();
    console.log('👋 Google Calendar service signed out');
  }

  /**
   * Connect user's Google Calendar to the server-side Letta/Composio integration
   */
  async connectToServerIntegration(userEmail: string): Promise<boolean> {
    try {
      if (!this.isAuthenticated()) {
        throw new Error('User is not authenticated with Google Calendar');
      }

      const tokens = oauthService.getStoredTokens();
      if (!tokens) {
        throw new Error('No valid tokens available');
      }

      console.log('🔗 Connecting user Google Calendar to server integration:', userEmail);

      // Send user's tokens to server to connect with Composio
      const response = await serverApiService.connectUserGoogleCalendar(
        userEmail,
        tokens.access_token,
        (tokens as any).refresh_token,
        (tokens as any).expires_in
      );

      if (response.success) {
        console.log('✅ User Google Calendar connected to server integration:', response.agentId);
        return true;
      } else {
        throw new Error(response.error || 'Failed to connect to server integration');
      }
    } catch (error) {
      console.error('❌ Failed to connect to server integration:', error);
      return false;
    }
  }

  /**
   * Get user's calendar list
   */
  async getCalendarList(): Promise<Array<{ id: string; summary: string; primary?: boolean }>> {
    try {
      const url = `${this.baseUrl}/users/me/calendarList`;
      const response = await oauthService.makeAuthenticatedRequest(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch calendar list: ${response.statusText}`);
      }

      const data = await response.json();
      return data.items.map((calendar: any) => ({
        id: calendar.id,
        summary: calendar.summary,
        primary: calendar.primary,
      }));
    } catch (error) {
      console.error('❌ Error fetching calendar list:', error);
      return [];
    }
  }

  /**
   * Fetch events from Google Calendar
   */
  async getEvents(
    calendarId: string = 'primary',
    timeMin?: Date,
    timeMax?: Date,
    maxResults: number = 250
  ): Promise<Event[]> {
    try {
      const params = new URLSearchParams({
        maxResults: maxResults.toString(),
        singleEvents: 'true',
        orderBy: 'startTime',
      });

      if (timeMin) {
        params.append('timeMin', timeMin.toISOString());
      }

      if (timeMax) {
        params.append('timeMax', timeMax.toISOString());
      }

      const url = `${this.baseUrl}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
      const response = await oauthService.makeAuthenticatedRequest(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch events: ${response.statusText}`);
      }

      const data: GoogleCalendarListResponse = await response.json();
      return this.convertGoogleEventsToAppEvents(data.items);
    } catch (error) {
      console.error('❌ Error fetching Google Calendar events:', error);
      return [];
    }
  }

  /**
   * Create a new event in Google Calendar
   */
  async createEvent(event: Event, calendarId: string = 'primary'): Promise<boolean> {
    try {
      const googleEvent = this.convertAppEventToGoogleEvent(event);
      
      const url = `${this.baseUrl}/calendars/${encodeURIComponent(calendarId)}/events`;
      const response = await oauthService.makeAuthenticatedRequest(url, {
        method: 'POST',
        body: JSON.stringify(googleEvent),
      });

      if (!response.ok) {
        throw new Error(`Failed to create event: ${response.statusText}`);
      }

      console.log('✅ Event created in Google Calendar:', event.title);
      return true;
    } catch (error) {
      console.error('❌ Error creating Google Calendar event:', error);
      return false;
    }
  }

  /**
   * Update an existing event in Google Calendar
   */
  async updateEvent(event: Event, calendarId: string = 'primary'): Promise<boolean> {
    try {
      // Extract the original Google event ID (remove 'google_' prefix)
      const googleEventId = event.id.replace('google_', '');
      const googleEvent = this.convertAppEventToGoogleEvent(event);
      
      const url = `${this.baseUrl}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`;
      const response = await oauthService.makeAuthenticatedRequest(url, {
        method: 'PUT',
        body: JSON.stringify(googleEvent),
      });

      if (!response.ok) {
        throw new Error(`Failed to update event: ${response.statusText}`);
      }

      console.log('✅ Event updated in Google Calendar:', event.title);
      return true;
    } catch (error) {
      console.error('❌ Error updating Google Calendar event:', error);
      return false;
    }
  }

  /**
   * Delete an event from Google Calendar
   */
  async deleteEvent(eventId: string, calendarId: string = 'primary'): Promise<boolean> {
    try {
      // Extract the original Google event ID (remove 'google_' prefix)
      const googleEventId = eventId.replace('google_', '');
      
      const url = `${this.baseUrl}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`;
      const response = await oauthService.makeAuthenticatedRequest(url, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete event: ${response.statusText}`);
      }

      console.log('✅ Event deleted from Google Calendar');
      return true;
    } catch (error) {
      console.error('❌ Error deleting Google Calendar event:', error);
      return false;
    }
  }

  /**
   * Convert app Event to Google Calendar event format
   */
  private convertAppEventToGoogleEvent(event: Event): any {
    const startDateTime = `${event.date}T${event.startTime}:00`;
    const endDateTime = `${event.date}T${event.endTime}:00`;

    return {
      summary: event.title,
      description: event.description || '',
      start: {
        dateTime: startDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      colorId: this.getGoogleColorId(event.color),
    };
  }

  /**
   * Convert Google Calendar events to app Event format
   */
  private convertGoogleEventsToAppEvents(googleEvents: GoogleCalendarEvent[]): Event[] {
    return googleEvents
      .filter(event => event.status !== 'cancelled')
      .map(event => {
        const startDateTime = event.start.dateTime || event.start.date;
        const endDateTime = event.end.dateTime || event.end.date;

        if (!startDateTime || !endDateTime) {
          return null;
        }

        const startDate = parseISO(startDateTime);
        const endDate = parseISO(endDateTime);

        // Determine if this is an all-day event
        const isAllDay = !event.start.dateTime;

        return {
          id: `google_${event.id}`,
          title: event.summary || 'Untitled Event',
          startTime: isAllDay ? '00:00' : format(startDate, 'HH:mm'),
          endTime: isAllDay ? '23:59' : format(endDate, 'HH:mm'),
          date: format(startDate, 'yyyy-MM-dd'),
          category: {
            id: 'imported',
            name: 'Google Calendar',
            color: this.getColorFromColorId(event.colorId),
            icon: 'Calendar',
          },
          priority: 'medium' as const,
          description: event.description || '',
          links: event.htmlLink ? [event.htmlLink] : [],
          isCompleted: false,
          isStatic: false,
          color: this.getColorFromColorId(event.colorId),
        };
      })
      .filter((event): event is Event => event !== null);
  }

  /**
   * Get color hex code from Google Calendar color ID
   */
  private getColorFromColorId(colorId?: string): string {
    const colorMap: { [key: string]: string } = {
      '1': '#7986CB', // Lavender
      '2': '#33B679', // Sage
      '3': '#8E24AA', // Grape
      '4': '#E67C73', // Flamingo
      '5': '#F6BF26', // Banana
      '6': '#F4511E', // Tangerine
      '7': '#039BE5', // Peacock
      '8': '#616161', // Graphite
      '9': '#3F51B5', // Blueberry
      '10': '#0B8043', // Basil
      '11': '#D50000', // Tomato
    };

    return colorMap[colorId || '1'] || '#3B82F6';
  }

  /**
   * Get Google Calendar color ID from hex color
   */
  private getGoogleColorId(hexColor: string): string {
    const colorMap: { [key: string]: string } = {
      '#7986CB': '1', // Lavender
      '#33B679': '2', // Sage
      '#8E24AA': '3', // Grape
      '#E67C73': '4', // Flamingo
      '#F6BF26': '5', // Banana
      '#F4511E': '6', // Tangerine
      '#039BE5': '7', // Peacock
      '#616161': '8', // Graphite
      '#3F51B5': '9', // Blueberry
      '#0B8043': '10', // Basil
      '#D50000': '11', // Tomato
    };

    return colorMap[hexColor] || '1';
  }

  /**
   * Get events for a specific week
   */
  async getWeekEvents(weekStart: Date): Promise<Event[]> {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    return this.getEvents('primary', weekStart, weekEnd);
  }
}

export const googleCalendarService = new GoogleCalendarService();
export default GoogleCalendarService;