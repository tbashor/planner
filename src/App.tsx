import React, { useEffect } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import MainLayout from './components/Layout/MainLayout';
import OAuthCallback from './components/GoogleCalendar/OAuthCallback';
import { mockEvents, mockAiSuggestions } from './data/mockData';

function AppContent() {
  const { dispatch } = useApp();

  // Check if this is an OAuth callback
  const isOAuthCallback = window.location.pathname === '/auth/callback' || 
                         window.location.search.includes('code=');

  useEffect(() => {
    // Only initialize mock data if not handling OAuth callback
    if (!isOAuthCallback) {
      // Initialize with mock data
      dispatch({ type: 'SET_EVENTS', payload: mockEvents });
      
      // Add initial AI suggestions
      mockAiSuggestions.forEach(suggestion => {
        dispatch({ type: 'ADD_AI_SUGGESTION', payload: suggestion });
      });

      // Add welcome message
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: 'welcome',
          type: 'ai',
          content: "👋 Hello! I'm your AI assistant. I'm here to help you optimize your schedule, boost productivity, and stay motivated. What would you like to work on today?",
          timestamp: new Date().toISOString(),
        },
      });
    }
  }, [dispatch, isOAuthCallback]);

  // Render OAuth callback component if this is a callback
  if (isOAuthCallback) {
    return <OAuthCallback />;
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