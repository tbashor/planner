import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Header from '../Header';
import AiSidebar from '../AiAssistant/AiSidebar';
import AiSuggestions from '../AiAssistant/AiSuggestions';
import ToastCalendar from '../Calendar/ToastCalendar';
import { useApp } from '../../contexts/AppContext';

export default function MainLayout() {
  const { state } = useApp();

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
          
          {/* Right panel - flexible layout with proper overflow handling */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
            {/* AI Suggestions - responsive height */}
            <div className="flex-shrink-0 w-full overflow-hidden">
              <AiSuggestions />
            </div>
            
            {/* Calendar - takes remaining space */}
            <div className="flex-1 min-h-0 w-full overflow-hidden">
              <ToastCalendar />
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
}