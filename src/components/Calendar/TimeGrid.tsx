import React from 'react';
import { format } from 'date-fns';
import { useApp } from '../../contexts/AppContext';
import EventBlock from './EventBlock';
import { mockEvents } from '../../data/mockData';

interface TimeGridProps {
  weekDays: Date[];
}

export default function TimeGrid({ weekDays }: TimeGridProps) {
  const { state } = useApp();
  
  // Generate time slots from 6 AM to 11 PM
  const timeSlots = Array.from({ length: 17 }, (_, i) => {
    const hour = i + 6;
    return {
      time: `${hour.toString().padStart(2, '0')}:00`,
      hour: hour,
      label: hour > 12 ? `${hour - 12}:00 PM` : hour === 12 ? '12:00 PM' : `${hour}:00 AM`,
    };
  });

  const getEventsForDayAndHour = (day: Date, hour: number) => {
    const dayString = format(day, 'yyyy-MM-dd');
    return mockEvents.filter(event => {
      if (event.date !== dayString) return false;
      const eventStartHour = parseInt(event.startTime.split(':')[0]);
      return eventStartHour === hour;
    });
  };

  const calculateEventHeight = (startTime: string, endTime: string) => {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    const durationInMinutes = endTotalMinutes - startTotalMinutes;
    
    // Each hour is 60px, so calculate proportional height
    return (durationInMinutes / 60) * 60;
  };

  return (
    <div className="grid grid-cols-8 min-h-full">
      {/* Time column */}
      <div className={`border-r ${
        state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
      }`}>
        {timeSlots.map((slot, index) => (
          <div
            key={index}
            className={`h-15 flex items-start justify-end p-2 border-b ${
              state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}
          >
            <span className={`text-xs font-medium ${
              state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              {slot.label}
            </span>
          </div>
        ))}
      </div>

      {/* Day columns */}
      {weekDays.map((day, dayIndex) => (
        <div
          key={dayIndex}
          className={`border-r last:border-r-0 relative ${
            state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          {timeSlots.map((slot, hourIndex) => {
            const events = getEventsForDayAndHour(day, slot.hour);
            
            return (
              <div
                key={hourIndex}
                className={`h-15 border-b relative ${
                  state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
                }`}
              >
                {events.map((event) => (
                  <EventBlock
                    key={event.id}
                    event={event}
                    height={calculateEventHeight(event.startTime, event.endTime)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '4px',
                      right: '4px',
                      zIndex: 10,
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}