import React, { useState, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Header from '../Header';
import AiSidebar from '../AiAssistant/AiSidebar';
import AiSuggestions from '../AiAssistant/AiSuggestions';
import ToastCalendar from '../Calendar/ToastCalendar';
import { useApp } from '../../contexts/AppContext';

export default function MainLayout() {
  const { state } = useApp();
  const [isSuggestionsExpanded, setIsSuggestionsExpanded] = useState(true);

  // Listen for AI suggestions panel toggle events
  useEffect(() => {
    const handleSuggestionsToggle = (event: CustomEvent) => {
      setIsSuggestionsExpanded(event.detail.isExpanded);
    };

    window.addEventListener('aiSuggestionsToggle', handleSuggestionsToggle as EventListener);
    
    return () => {
      window.removeEventListener('aiSuggestionsToggle', handleSuggestionsToggle as EventListener);
    };
  }, []);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={`h-screen flex flex-col overflow-hidden ${
        state.isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        {/* Header - spans full width */}
        <div className="flex-shrink-0">
          <Header />
        </div>
        
        {/* Main content area with responsive layout */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Chat Sidebar - responsive width */}
          <div className="w-full max-w-sm lg:w-96 xl:w-[400px] flex-shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-hidden">
            <AiSidebar />
          </div>
          
          {/* Right panel - flexible layout with dynamic height management */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
            {/* AI Suggestions - responsive height with smooth transitions */}
            <div className={`flex-shrink-0 w-full overflow-hidden transition-all duration-500 ease-in-out ${
              isSuggestionsExpanded ? 'suggestions-expanded' : 'suggestions-collapsed'
            }`}>
              <AiSuggestions />
            </div>
            
            {/* Calendar - dynamically adjusts height based on suggestions panel state */}
            <div className={`w-full overflow-hidden transition-all duration-500 ease-in-out ${
              isSuggestionsExpanded ? 'calendar-with-suggestions' : 'calendar-full-height'
            }`} style={{
              // Dynamic height calculation based on suggestions panel state
              height: isSuggestionsExpanded 
                ? 'calc(100vh - 64px - 320px)' // Header height - Suggestions panel height
                : 'calc(100vh - 64px - 60px)',  // Header height - Collapsed suggestions header
              minHeight: isSuggestionsExpanded ? '400px' : '600px'
            }}>
              <ToastCalendar />
            </div>
          </div>
        </div>

        {/* Floating image in lower right corner */}
        <div className="fixed bottom-4 right-4 z-50 pointer-events-none">
          <img 
            src="/white_circle_360x360.png" 
            alt="Floating logo" 
            className="h-12 w-12 opacity-80 hover:opacity-100 transition-opacity duration-200"
          />
        </div>
      </div>
    </DndProvider>
  );
}