import React from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { useApp } from '../../contexts/AppContext';

interface WeekHeaderProps {
  weekDays: Date[];
}

export default function WeekHeader({ weekDays }: WeekHeaderProps) {
  const { state, dispatch } = useApp();

  const handleDateClick = (date: Date) => {
    dispatch({ type: 'SET_SELECTED_DATE', payload: date });
  };

  return (
    <div className={`grid grid-cols-8 border-b ${
      state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
    }`}>
      {/* Time column header */}
      <div className={`p-4 text-center border-r ${
        state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <span className={`text-sm font-medium ${
          state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
        }`}>
          Time
        </span>
      </div>

      {/* Day headers */}
      {weekDays.map((day, index) => {
        const isSelected = isSameDay(day, state.selectedDate);
        const isTodayDate = isToday(day);
        
        return (
          <div key={index} className={`border-r last:border-r-0 ${
            state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <button
              onClick={() => handleDateClick(day)}
              className={`w-full p-4 text-center hover:bg-opacity-80 transition-colors duration-200 ${
                isSelected
                  ? state.isDarkMode
                    ? 'bg-blue-900 text-blue-300'
                    : 'bg-blue-50 text-blue-600'
                  : state.isDarkMode
                  ? 'hover:bg-gray-800'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex flex-col items-center space-y-1">
                <span className={`text-xs font-medium uppercase ${
                  isTodayDate
                    ? 'text-blue-500'
                    : state.isDarkMode
                    ? 'text-gray-400'
                    : 'text-gray-600'
                }`}>
                  {format(day, 'EEE')}
                </span>
                <span className={`text-lg font-semibold ${
                  isTodayDate
                    ? 'text-blue-500'
                    : isSelected
                    ? state.isDarkMode
                      ? 'text-blue-300'
                      : 'text-blue-600'
                    : state.isDarkMode
                    ? 'text-white'
                    : 'text-gray-900'
                }`}>
                  {format(day, 'd')}
                </span>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}