import { format, parse, differenceInMinutes } from 'date-fns';

/**
 * Safely format a date string to avoid timezone boundary issues
 * Use this instead of new Date(dateString) for date-only strings
 */
export function formatEventDate(dateString: string, formatString: string = 'EEEE, MMMM d'): string {
  try {
    let date: Date;
    
    if (dateString.includes('T')) {
      // Already has time component, safe to parse directly
      date = new Date(dateString);
    } else {
      // Date-only string - parse at noon local time to avoid timezone shifts
      date = new Date(dateString + 'T12:00:00');
    }
    
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString);
      return dateString; // Return original string if parsing fails
    }
    
    return format(date, formatString);
  } catch (error) {
    console.warn('Error formatting date:', dateString, error);
    return dateString; // Return original string if formatting fails
  }
}

export function formatTime(time: string): string {
  try {
    const date = parse(time, 'HH:mm', new Date());
    return format(date, 'h:mm a');
  } catch {
    return time;
  }
}

export function calculateDuration(startTime: string, endTime: string): number {
  try {
    const start = parse(startTime, 'HH:mm', new Date());
    const end = parse(endTime, 'HH:mm', new Date());
    return differenceInMinutes(end, start);
  } catch {
    return 0;
  }
}

export function addTimeToDate(date: Date, time: string): Date {
  try {
    const [hours, minutes] = time.split(':').map(Number);
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  } catch {
    return date;
  }
}

export function generateTimeSlots(startHour: number = 6, endHour: number = 23, interval: number = 30) {
  const slots = [];
  
  for (let hour = startHour; hour <= endHour; hour++) {
    for (let minute = 0; minute < 60; minute += interval) {
      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      slots.push({
        time,
        label: formatTime(time),
        hour,
        minute,
      });
    }
  }
  
  return slots;
}

export function isTimeInRange(time: string, startTime: string, endTime: string): boolean {
  try {
    const timeDate = parse(time, 'HH:mm', new Date());
    const startDate = parse(startTime, 'HH:mm', new Date());
    const endDate = parse(endTime, 'HH:mm', new Date());
    
    return timeDate >= startDate && timeDate <= endDate;
  } catch {
    return false;
  }
}