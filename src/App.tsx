import React, { useEffect } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import MainLayout from './components/Layout/MainLayout';
import OAuthCallback from './components/GoogleCalendar/OAuthCallback';
import OnboardingWizard from './components/Onboarding/OnboardingWizard';
import { mockEvents, mockAiSuggestions } from './data/mockData';

interface OnboardingData {
  name: string;
  workSchedule: string;
  productiveHours: string[];
  focusAreas: string[];
  dailyRoutines: string[];
  aiPreferences: string[];
  goals: string;
}

function AppContent() {
  const { state, dispatch } = useApp();

  // Check if this is an OAuth callback
  const isOAuthCallback = window.location.pathname === '/auth/callback' || 
                         window.location.search.includes('code=');

  useEffect(() => {
    // Only initialize mock data if not handling OAuth callback and onboarding is complete
    if (!isOAuthCallback && state.isOnboardingComplete) {
      // Initialize with mock data
      dispatch({ type: 'SET_EVENTS', payload: mockEvents });
      
      // Add initial AI suggestions
      mockAiSuggestions.forEach(suggestion => {
        dispatch({ type: 'ADD_AI_SUGGESTION', payload: suggestion });
      });

      // Add welcome message with personalized greeting
      const userName = state.user?.name || 'there';
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: 'welcome',
          type: 'ai',
          content: `👋 Hello ${userName}! I'm your AI assistant. Based on your preferences, I'm here to help you optimize your schedule, boost productivity, and stay motivated. What would you like to work on today?`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }, [dispatch, isOAuthCallback, state.isOnboardingComplete, state.user?.name]);

  const handleOnboardingComplete = (data: OnboardingData) => {
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

    const user = {
      id: '1',
      name: data.name,
      email: `${data.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
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

    dispatch({ type: 'COMPLETE_ONBOARDING', payload: user });
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
      <AppContent />
    </AppProvider>
  );
}

export default App;