import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Header from '../Header';
import AiSidebar from '../AiAssistant/AiSidebar';
import ToastCalendar from '../Calendar/ToastCalendar';
import { useApp } from '../../contexts/AppContext';

export default function MainLayout() {
  const { state } = useApp();

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={`min-h-screen flex flex-col ${
        state.isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        <Header />
        <div className="flex-1 flex overflow-hidden">
          <AiSidebar />
          <ToastCalendar />
        </div>
      </div>
    </DndProvider>
  );
}