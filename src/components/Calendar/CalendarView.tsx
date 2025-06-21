import React from 'react';
import { format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import TimeGrid from './TimeGrid';
import WeekHeader from './WeekHeader';

export default function CalendarView() {
  const { state, dispatch } = useApp();

  const weekStart = startOfWeek(state.currentWeek, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newWeek = direction === 'prev' 
      ? subWeeks(state.currentWeek, 1)
      : addWeeks(state.currentWeek, 1);
    dispatch({ type: 'SET_CURRENT_WEEK', payload: newWeek });
  };

  const goToToday = () => {
    const today = new Date();
    dispatch({ type: 'SET_CURRENT_WEEK', payload: today });
    dispatch({ type: 'SET_SELECTED_DATE', payload: today });
  };

  return (
    <div className={`flex-1 flex flex-col h-full ${
      state.isDarkMode ? 'bg-gray-900' : 'bg-white'
    }`}>
      {/* Calendar Header */}
      <div className={`p-4 border-b flex items-center justify-between ${
        state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigateWeek('prev')}
              className={`p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200 ${
                state.isDarkMode
                  ? 'text-gray-300 hover:bg-gray-800'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => navigateWeek('next')}
              className={`p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200 ${
                state.isDarkMode
                  ? 'text-gray-300 hover:bg-gray-800'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          
          <h2 className={`text-xl font-semibold ${
            state.isDarkMode ? 'text-white' : 'text-gray-900'
          }`}>
            {format(weekStart, 'yyyy.MM.dd')} ~ {format(addDays(weekStart, 6), 'MM.dd')}
          </h2>
        </div>

        <button
          onClick={goToToday}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
            state.isDarkMode
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          Today
        </button>
      </div>

      {/* Week Header */}
      <WeekHeader weekDays={weekDays} />

      {/* Time Grid */}
      <div className="flex-1 overflow-auto">
        <TimeGrid weekDays={weekDays} />
      </div>
    </div>
  );
}