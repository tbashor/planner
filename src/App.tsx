import React, { useEffect, useRef } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainLayout from './components/Layout/MainLayout';
import OAuthCallback from './components/GoogleCalendar/OAuthCallback';
import OnboardingWizard from './components/Onboarding/OnboardingWizard';
import { mockAiSuggestions } from './data/mockData';
import { generatePersonalizedSuggestions } from './utils/aiUtils';
import { Event } from './types';
import { oauthService } from './services/oauthService';
import { googleCalendarService } from './services/googleCalendarService';

interface OnboardingData {
  name: string;
  email: string; // Real authenticated email from Google
  workSchedule: string;
  productiveHours: string[];
  focusAreas: string[];
  dailyRoutines: string[];
  aiPreferences: string[];
  goals: string;
}

function AppContent() {
  const { state, dispatch } = useApp();
  const { authState, authDispatch, checkConnectionStatus } = useAuth();
  const authRestorationAttempted = useRef(false);

  // Check if this is an OAuth callback
  const isOAuthCallback = window.location.pathname === '/auth/callback' || 
                         window.location.search.includes('code=');

  // Add authentication restoration logic
  useEffect(() => {
    const restoreAuthentication = async () => {
      // Prevent multiple restoration attempts
      if (authRestorationAttempted.current) {
        console.log('⏭️ Authentication restoration already attempted, skipping');
        return;
      }
      
      authRestorationAttempted.current = true;
      console.log('🔄 Checking authentication state on app startup...');
      
      // Skip restoration if handling OAuth callback
      if (isOAuthCallback) {
        console.log('⏭️ Skipping auth restoration - handling OAuth callback');
        return;
      }

      // Add guard to prevent infinite loops
      if (authState.connectionStatus === 'checking') {
        console.log('⏭️ Already checking connection status, skipping');
        return;
      }

      try {
        // Check if OAuth tokens exist
        const hasOAuthTokens = oauthService.isAuthenticated();
        console.log('🔑 OAuth tokens available:', hasOAuthTokens);

        if (hasOAuthTokens) {
          // Try to get authenticated user email
          const userEmail = await googleCalendarService.getAuthenticatedUserEmail();
          console.log('📧 Retrieved authenticated user email:', userEmail);

          if (userEmail && userEmail !== 'authenticated.user@gmail.com') {
            // Test the connection to make sure tokens are valid
            try {
              const testResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: {
                  'Authorization': `Bearer ${await oauthService.getValidAccessToken()}`,
                },
              });

              if (testResponse.ok) {
                console.log('✅ OAuth tokens are valid, restoring authentication');
                
                // Update auth context with valid authentication
                authDispatch({ 
                  type: 'SET_AUTHENTICATED', 
                  payload: { userEmail } 
                });

                // Check Composio connection status only if not already authenticated with this email
                if (authState.userEmail !== userEmail || authState.connectionStatus !== 'connected') {
                  console.log('🔍 Checking Composio connection status...');
                  await checkConnectionStatus(userEmail);
                }
              } else {
                console.warn('⚠️ OAuth tokens are invalid, clearing OAuth state only');
                await handleOAuthFailure();
              }
            } catch (error) {
              console.error('❌ Error testing OAuth tokens:', error);
              await handleOAuthFailure();
            }
          } else {
            console.warn('⚠️ No valid user email found, clearing OAuth state only');
            await handleOAuthFailure();
          }
        } else {
          console.log('ℹ️ No OAuth tokens found');
          // If user has completed onboarding but has no OAuth tokens, that's fine
          // They just haven't connected Google Calendar yet
          if (authState.userEmail && state.isOnboardingComplete) {
            console.log('ℹ️ User has completed onboarding but no Google Calendar connection - this is normal');
            // Only check Composio connection if we haven't already verified it recently
            const timeSinceLastCheck = Date.now() - authState.lastChecked;
            if (timeSinceLastCheck > 60000) { // Only check if more than 1 minute since last check
              console.log('🔍 Checking Composio connection status (periodic check)...');
              await checkConnectionStatus(authState.userEmail);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error during authentication restoration:', error);
        // Only clear OAuth-related state, not the entire authentication
        await handleOAuthFailure();
      }
    };

    const handleOAuthFailure = async () => {
      console.log('🧹 Clearing OAuth tokens only (preserving user authentication)');
      
      // Clear OAuth tokens
      oauthService.clearTokens();
      
      // Clear Google Calendar service tokens
      googleCalendarService.clearExternalTokens();
      
      // Don't clear the entire auth state - just mark as needing reconnection
      // The user might have completed onboarding but just needs to reconnect Google Calendar
      if (authState.userEmail) {
        console.log('ℹ️ Preserving user authentication, marking Google Calendar as disconnected');
        // We'll let the normal connection flow handle reconnection
      } else {
        // If no user email, then clear everything
        authDispatch({ 
          type: 'SET_DISCONNECTED', 
          payload: 'Authentication expired - please reconnect' 
        });
      }
    };

    // Only run restoration if onboarding is complete and we haven't run this recently
    if (state.isOnboardingComplete) {
      restoreAuthentication();
    }
  }, [isOAuthCallback, state.isOnboardingComplete]);

  useEffect(() => {
    // Check for preserved AI events from reset
    const preservedAiEvents = localStorage.getItem('smartplan_preserved_ai_events');
    
    // Only restore preserved AI events if not handling OAuth callback and onboarding is complete
    if (!isOAuthCallback && state.isOnboardingComplete && state.events.length === 0) {
      let eventsToLoad: Event[] = [];
      
      // If we have preserved AI events, add them
      if (preservedAiEvents) {
        try {
          const aiEvents = JSON.parse(preservedAiEvents);
          eventsToLoad = [...eventsToLoad, ...aiEvents];
          
          // Clear the preserved events from localStorage
          localStorage.removeItem('smartplan_preserved_ai_events');
          
          // Add message about restored AI events
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `restore_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'ai',
              content: `🎉 Welcome back! I've restored your ${aiEvents.length} AI-suggested events and I'm now adapting my suggestions to your updated preferences. Your schedule continuity is maintained!`,
              timestamp: new Date().toISOString(),
            },
          });
        } catch (error) {
          console.error('Error parsing preserved AI events:', error);
        }
      }
      
      // Initialize with events (mock + potentially preserved AI events)
      dispatch({ type: 'SET_EVENTS', payload: eventsToLoad });
      
      // Generate AI suggestions based on current preferences
      if (state.user?.preferences) {
        const newSuggestions = generatePersonalizedSuggestions(
          eventsToLoad,
          state.user.preferences,
          new Date()
        );
        
        newSuggestions.forEach(suggestion => {
          dispatch({ type: 'ADD_AI_SUGGESTION', payload: suggestion });
        });
      } else {
        // Fallback to mock suggestions if no preferences yet
        mockAiSuggestions.forEach(suggestion => {
          dispatch({ type: 'ADD_AI_SUGGESTION', payload: suggestion });
        });
      }
    }

    // Add welcome message only if no chat messages exist and onboarding is complete
    if (!isOAuthCallback && state.isOnboardingComplete && state.chatMessages.length === 0) {
      const userName = state.user?.name || 'there';
      const userEmail = state.user?.email || 'your account';
      const hasPreservedEvents = preservedAiEvents !== null;
      
      const welcomeMessage = hasPreservedEvents 
        ? `👋 Welcome back ${userName}! I've successfully restored your AI-suggested events and updated my recommendations based on your new preferences. Your calendar for ${userEmail} is ready to go!`
        : `👋 Welcome ${userName}! I'm your AI assistant connected to ${userEmail}. I'm here to help you optimize your schedule, boost productivity, and stay motivated. What would you like to work on today?`;
      
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `welcome_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: welcomeMessage,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }, [dispatch, isOAuthCallback, state.isOnboardingComplete, state.user?.name, state.user?.email, state.events.length, state.chatMessages.length]);

  const handleOnboardingComplete = (data: OnboardingData) => {
    console.log('🎉 Onboarding completed with REAL email:', data.email);
    
    // Convert onboarding data to user preferences
    const productivityHours = data.productiveHours.map(period => {
      switch (period) {
        case 'early-morning': return ['06:00', '07:00', '08:00'];
        case 'mid-morning': return ['09:00', '10:00', '11:00'];
        case 'afternoon': return ['12:00', '13:00', '14:00'];
        case 'late-afternoon': return ['15:00', '16:00', '17:00'];
        case 'evening': return ['18:00', '19:00', '20:00'];
        default: return [];
      }
    }).flat();

    const workingHours = (() => {
      switch (data.workSchedule) {
        case 'morning': return { start: '06:00', end: '12:00' };
        case 'afternoon': return { start: '12:00', end: '18:00' };
        case 'evening': return { start: '18:00', end: '24:00' };
        default: return { start: '08:00', end: '22:00' };
      }
    })();

    // Create user with REAL authenticated email
    const user = {
      id: '1',
      name: data.name,
      email: data.email, // Use the REAL authenticated email from Google
      avatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=400',
      preferences: {
        theme: 'light' as const,
        timeBlockSize: 30,
        workingHours,
        productivityHours,
        motivationalFeedback: data.aiPreferences.includes('motivational-feedback'),
        voiceInput: true,
        aiSuggestions: data.aiPreferences.includes('smart-scheduling'),
        focusAreas: data.focusAreas,
        dailyRoutines: data.dailyRoutines,
        goals: data.goals,
      },
    };

    console.log('✅ Created user with authenticated email:', user.email);
    dispatch({ type: 'COMPLETE_ONBOARDING', payload: user });
    
    // Also authenticate with Composio auth context
    authDispatch({ 
      type: 'SET_AUTHENTICATED', 
      payload: { userEmail: data.email } 
    });
    
    console.log('🔐 Set Composio authentication for:', data.email);
  };

  // Render OAuth callback component if this is a callback
  if (isOAuthCallback) {
    return <OAuthCallback />;
  }

  // Render onboarding wizard if not completed
  if (!state.isOnboardingComplete) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} />;
  }

  return <MainLayout />;
}

function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </AppProvider>
  );
}

export default App;