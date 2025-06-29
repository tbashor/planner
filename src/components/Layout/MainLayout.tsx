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
      <div className={`h-screen grid grid-cols-[400px_1fr] grid-rows-[auto_1fr_1fr] ${
        state.isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        {/* Header - spans full width */}
        <div className="col-span-2 row-span-1">
          <Header />
        </div>
        
        {/* Chat Sidebar - spans full height of remaining space */}
        <div className="col-span-1 row-span-2 border-r border-gray-200 dark:border-gray-700">
          <AiSidebar />
        </div>
        
        {/* AI Suggestions - top right */}
        <div className="col-span-1 row-span-1 border-b border-gray-200 dark:border-gray-700">
          <AiSuggestions />
        </div>
        
        {/* Calendar - bottom right */}
        <div className="col-span-1 row-span-1 overflow-hidden">
          <ToastCalendar />
        </div>
      </div>
    </DndProvider>
  );
}