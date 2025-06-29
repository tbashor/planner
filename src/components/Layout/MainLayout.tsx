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
      <div className={`h-screen flex flex-col ${
        state.isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        {/* Header - spans full width */}
        <div className="flex-shrink-0">
          <Header />
        </div>
        
        {/* Main content area with flexible layout */}
        <div className="flex-1 flex min-h-0">
          {/* Chat Sidebar - fixed width */}
          <div className="w-[400px] flex-shrink-0 border-r border-gray-200 dark:border-gray-700">
            <AiSidebar />
          </div>
          
          {/* Right panel - flexible layout */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* AI Suggestions - dynamic height */}
            <div className="flex-shrink-0">
              <AiSuggestions />
            </div>
            
            {/* Calendar - takes remaining space */}
            <div className="flex-1 min-h-0">
              <ToastCalendar />
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
}