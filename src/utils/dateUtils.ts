import { format, parse, addMinutes, differenceInMinutes } from 'date-fns';

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