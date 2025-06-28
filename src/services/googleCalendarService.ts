import { Event, Priority } from '../types';
import { format, parseISO } from 'date-fns';
import { oauthService } from './oauthService';

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

interface ExternalTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  token_type: string;
  scope?: string;
  userEmail: string;
}

class GoogleCalendarService {
  private readonly baseUrl = 'https://www.googleapis.com/calendar/v3';
  private externalTokens: ExternalTokens | null = null;

  constructor() {
    console.log('🔧 Google Calendar Service initialized');
    console.log('- Base URL:', this.baseUrl);
    console.log('- Using OAuth service for authentication (with external token support)');
  }

  /**
   * Set external OAuth tokens (from Composio)
   */
  setExternalTokens(tokens: ExternalTokens): void {
    this.externalTokens = tokens;
    console.log(`🔑 External tokens set for user: ${tokens.userEmail}`);
    console.log(`  - Access Token: ${tokens.access_token ? 'Present' : 'Missing'}`);
    console.log(`  - Refresh Token: ${tokens.refresh_token ? 'Present' : 'Missing'}`);
    console.log(`  - Expires At: ${tokens.expires_at || 'Unknown'}`);
  }

  /**
   * Clear external tokens
   */
  clearExternalTokens(): void {
    const userEmail = this.externalTokens?.userEmail;
    this.externalTokens = null;
    console.log(`🧹 External tokens cleared${userEmail ? ` for user: ${userEmail}` : ''}`);
  }

  /**
   * Check if external tokens are available
   */
  hasExternalTokens(): boolean {
    return this.externalTokens !== null && !!this.externalTokens.access_token;
  }

  /**
   * Get current authentication method
   */
  getAuthenticationMethod(): 'external' | 'oauth' | 'none' {
    if (this.hasExternalTokens()) {
      return 'external';
    } else if (oauthService.isAuthenticated()) {
      return 'oauth';
    } else {
      return 'none';
    }
  }

  /**
   * Check if the user is authenticated (either via external tokens or OAuth)
   */
  isAuthenticated(): boolean {
    return this.hasExternalTokens() || oauthService.isAuthenticated();
  }

  /**
   * Make an authenticated request using external tokens or OAuth service
   */
  private async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    if (this.hasExternalTokens() && this.externalTokens) {
      // Use external tokens
      console.log(`🔑 Making request with external tokens for: ${this.externalTokens.userEmail}`);
      
      const headers = {
        'Authorization': `${this.externalTokens.token_type || 'Bearer'} ${this.externalTokens.access_token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      };

      return fetch(url, {
        ...options,
        headers,
      });
    } else if (oauthService.isAuthenticated()) {
      // Use OAuth service
      console.log(`🔑 Making request with OAuth service`);
      return oauthService.makeAuthenticatedRequest(url, options);
    } else {
      throw new Error('No authentication method available. Please authenticate first.');
    }
  }

  /**
   * Get authorization URL for Google Calendar
   */
  async getAuthUrl(): Promise<string> {
    return await oauthService.buildAuthUrl(true);
  }

  /**
   * Sign out the user
   */
  signOut() {
    oauthService.clearTokens();
    console.log('👋 Google Calendar service signed out');
  }

  /**
   * Get the authenticated user's email from external tokens or Google's userinfo endpoint
   */
  async getAuthenticatedUserEmail(): Promise<string | null> {
    try {
      // If using external tokens, return the email directly
      if (this.hasExternalTokens() && this.externalTokens) {
        console.log(`✅ Using external token email: ${this.externalTokens.userEmail}`);
        return this.externalTokens.userEmail;
      }

      console.log('🔍 Retrieving authenticated user email from Google OAuth...');
      
      // Try multiple Google userinfo endpoints
      const endpoints = [
        'https://www.googleapis.com/oauth2/v2/userinfo',
        'https://www.googleapis.com/oauth2/v1/userinfo',
        'https://openidconnect.googleapis.com/v1/userinfo',
        'https://www.googleapis.com/plus/v1/people/me'
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`🔍 Trying endpoint: ${endpoint}`);
          const response = await this.makeAuthenticatedRequest(endpoint);
          
          if (response.ok) {
            const userInfo = await response.json();
            console.log('✅ Retrieved user info from Google:', userInfo);
            
            // Extract email from different possible fields
            const email = userInfo.email || userInfo.emailAddress || userInfo.emails?.[0]?.value;
            
            if (email && email !== 'authenticated.user@gmail.com') {
              console.log('✅ Successfully retrieved real user email:', email);
              return email;
            } else {
              console.warn('⚠️ No valid email found in response:', userInfo);
            }
          } else {
            console.warn(`⚠️ Failed to get user info from ${endpoint}:`, response.status, response.statusText);
            
            // Log response body for debugging
            try {
              const errorBody = await response.text();
              console.warn('Error response body:', errorBody);
            } catch {
              // Ignore error reading response body
            }
          }
        } catch (endpointError) {
          console.warn(`⚠️ Error with endpoint ${endpoint}:`, endpointError);
          continue; // Try next endpoint
        }
      }

      // If all endpoints fail, try to extract email from token payload
      console.log('🔍 All userinfo endpoints failed, trying to extract from token...');
      const tokens = oauthService.getStoredTokens();
      
      if (tokens?.access_token) {
        try {
          // Try to decode JWT token if it's a JWT
          const tokenParts = tokens.access_token.split('.');
          if (tokenParts.length === 3) {
            const payload = JSON.parse(atob(tokenParts[1]));
            const email = payload.email || payload.sub;
            if (email && email.includes('@')) {
              console.log('✅ Extracted email from token payload:', email);
              return email;
            }
          }
        } catch (tokenError) {
          console.warn('⚠️ Could not decode token:', tokenError);
        }
      }

      console.error('❌ Could not retrieve user email from any source');
      return null;
    } catch (error) {
      console.error('❌ Error getting authenticated user email:', error);
      return null;
    }
  }

  /**
   * Connect to server integration (for Composio) - only if we have a real email
   */
  async connectToServerIntegration(userEmail: string): Promise<void> {
    try {
      // Don't connect to server integration with fake emails
      if (!userEmail || userEmail === 'authenticated.user@gmail.com' || !userEmail.includes('@')) {
        console.warn('⚠️ Skipping server integration - no valid user email available');
        return;
      }

      console.log('🔗 Connecting to server integration for:', userEmail);
      
      const tokens = oauthService.getStoredTokens();
      if (!tokens) {
        throw new Error('No OAuth tokens available');
      }

      // This would typically send the tokens to your server for Composio integration
      // For now, we'll just log that the connection is established
      console.log('✅ Server integration connection established for:', userEmail);
    } catch (error) {
      console.error('❌ Error connecting to server integration:', error);
      throw error;
    }
  }

  /**
   * Get user's calendar list
   */
  async getCalendarList(): Promise<Array<{ id: string; summary: string; primary?: boolean }>> {
    try {
      const url = `${this.baseUrl}/users/me/calendarList`;
      const response = await this.makeAuthenticatedRequest(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch calendar list: ${response.statusText}`);
      }

      const data = await response.json();
      return data.items.map((calendar: { id: string; summary: string; primary?: boolean }) => ({
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
      const response = await this.makeAuthenticatedRequest(url);

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
      const response = await this.makeAuthenticatedRequest(url, {
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
      const response = await this.makeAuthenticatedRequest(url, {
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
      const response = await this.makeAuthenticatedRequest(url, {
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
  private convertAppEventToGoogleEvent(event: Event): {
    summary: string;
    description: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    colorId: string;
  } {
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
    const convertedEvents: Event[] = [];
    
    for (const event of googleEvents) {
      if (event.status === 'cancelled') {
        continue;
      }

      const startDateTime = event.start.dateTime || event.start.date;
      const endDateTime = event.end.dateTime || event.end.date;

      if (!startDateTime || !endDateTime) {
        continue;
      }

      const startDate = parseISO(startDateTime);
      const endDate = parseISO(endDateTime);

      // Determine if this is an all-day event
      const isAllDay = !event.start.dateTime;

      convertedEvents.push({
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
        priority: 'medium' as Priority,
        description: event.description || '',
        links: event.htmlLink ? [event.htmlLink] : [],
        isCompleted: false,
        isStatic: false,
        color: this.getColorFromColorId(event.colorId),
      });
    }
    
    return convertedEvents;
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