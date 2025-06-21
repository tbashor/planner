import { Event } from '../types';
import { format, parseISO } from 'date-fns';

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
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private apiKey: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    this.clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    this.clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';
    this.apiKey = import.meta.env.VITE_GOOGLE_API_KEY || '';
    
    // Use Google's OAuth playground for manual authorization
    this.redirectUri = 'https://developers.google.com/oauthplayground';
    
    // Load tokens from localStorage
    this.loadTokensFromStorage();
    
    console.log('🔧 Google Calendar Service Configuration:');
    console.log('- Client ID:', this.clientId ? `${this.clientId.substring(0, 20)}...` : '❌ Missing');
    console.log('- Client Secret:', this.clientSecret ? '✅ Set' : '❌ Missing');
    console.log('- API Key:', this.apiKey ? '✅ Set' : '❌ Missing');
    console.log('- Using manual authorization flow with OAuth playground');
  }

  private loadTokensFromStorage() {
    this.accessToken = localStorage.getItem('google_access_token');
    this.refreshToken = localStorage.getItem('google_refresh_token');
  }

  private saveTokensToStorage(accessToken: string, refreshToken?: string) {
    this.accessToken = accessToken;
    localStorage.setItem('google_access_token', accessToken);
    
    if (refreshToken) {
      this.refreshToken = refreshToken;
      localStorage.setItem('google_refresh_token', refreshToken);
    }
  }

  private clearTokensFromStorage() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_refresh_token');
  }

  /**
   * Generate the Google OAuth2 authorization URL
   */
  getAuthUrl(): string {
    if (!this.clientId) {
      throw new Error('Google Client ID is not configured. Please check your .env file.');
    }

    const scope = 'https://www.googleapis.com/auth/calendar';
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scope,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<boolean> {
    if (!this.clientId || !this.clientSecret) {
      console.error('❌ Missing Google OAuth credentials');
      return false;
    }

    try {
      console.log('🔄 Exchanging authorization code for tokens...');
      console.log('- Code:', code.substring(0, 20) + '...');
      
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Token exchange failed:', errorData);
        throw new Error(`Token exchange failed: ${response.statusText} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log('✅ Token exchange successful!');
      this.saveTokensToStorage(data.access_token, data.refresh_token);
      return true;
    } catch (error) {
      console.error('❌ Error exchanging code for token:', error);
      return false;
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken || !this.clientId || !this.clientSecret) {
      console.error('❌ Missing refresh token or OAuth credentials');
      return false;
    }

    try {
      console.log('🔄 Refreshing access token...');
      
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Token refresh failed:', errorData);
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Token refresh successful!');
      this.saveTokensToStorage(data.access_token);
      return true;
    } catch (error) {
      console.error('❌ Error refreshing token:', error);
      this.clearTokensFromStorage();
      return false;
    }
  }

  /**
   * Make an authenticated request to the Google Calendar API
   */
  private async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const requestOptions = {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    let response = await fetch(url, requestOptions);

    // If token is expired, try to refresh it
    if (response.status === 401) {
      console.log('🔄 Access token expired, attempting refresh...');
      const refreshed = await this.refreshAccessToken();
      if (refreshed && this.accessToken) {
        requestOptions.headers = {
          ...requestOptions.headers,
          'Authorization': `Bearer ${this.accessToken}`,
        };
        response = await fetch(url, requestOptions);
      }
    }

    return response;
  }

  /**
   * Check if the user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  /**
   * Sign out the user
   */
  signOut() {
    this.clearTokensFromStorage();
  }

  /**
   * Get user's calendar list
   */
  async getCalendarList(): Promise<Array<{ id: string; summary: string; primary?: boolean }>> {
    try {
      const url = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
      const response = await this.makeAuthenticatedRequest(url);

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
      console.error('Error fetching calendar list:', error);
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

      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
      const response = await this.makeAuthenticatedRequest(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch events: ${response.statusText}`);
      }

      const data: GoogleCalendarListResponse = await response.json();
      return this.convertGoogleEventsToAppEvents(data.items);
    } catch (error) {
      console.error('Error fetching Google Calendar events:', error);
      return [];
    }
  }

  /**
   * Create a new event in Google Calendar
   */
  async createEvent(event: Event, calendarId: string = 'primary'): Promise<boolean> {
    try {
      const googleEvent = this.convertAppEventToGoogleEvent(event);
      
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
      const response = await this.makeAuthenticatedRequest(url, {
        method: 'POST',
        body: JSON.stringify(googleEvent),
      });

      if (!response.ok) {
        throw new Error(`Failed to create event: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('Error creating Google Calendar event:', error);
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
      
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`;
      const response = await this.makeAuthenticatedRequest(url, {
        method: 'PUT',
        body: JSON.stringify(googleEvent),
      });

      if (!response.ok) {
        throw new Error(`Failed to update event: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('Error updating Google Calendar event:', error);
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
      
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`;
      const response = await this.makeAuthenticatedRequest(url, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete event: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('Error deleting Google Calendar event:', error);
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