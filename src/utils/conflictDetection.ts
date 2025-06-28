import { Event } from '../types';
import { format, parse, addMinutes, isBefore, isAfter, isEqual } from 'date-fns';

export interface TimeSlot {
  startTime: string;
  endTime: string;
  date: string;
}

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictingEvents: Event[];
  suggestedResolution?: {
    rearrangedEvents: Event[];
    newEventSlot: TimeSlot;
    message: string;
  };
}

export interface EventRearrangementSuggestion {
  originalEvent: Event;
  newStartTime: string;
  newEndTime: string;
  reason: string;
}

/**
 * Check if two time slots overlap
 */
export function doTimeSlotsOverlap(slot1: TimeSlot, slot2: TimeSlot): boolean {
  if (slot1.date !== slot2.date) return false;

  const start1 = parse(`${slot1.date} ${slot1.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
  const end1 = parse(`${slot1.date} ${slot1.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
  const start2 = parse(`${slot2.date} ${slot2.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
  const end2 = parse(`${slot2.date} ${slot2.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

  // Events overlap if one starts before the other ends
  return (isBefore(start1, end2) || isEqual(start1, end2)) && 
         (isBefore(start2, end1) || isEqual(start2, end1));
}

/**
 * Find all events that conflict with a proposed time slot
 */
export function findConflictingEvents(
  proposedSlot: TimeSlot, 
  existingEvents: Event[],
  excludeEventId?: string
): Event[] {
  return existingEvents.filter(event => {
    if (excludeEventId && event.id === excludeEventId) return false;
    
    const eventSlot: TimeSlot = {
      startTime: event.startTime,
      endTime: event.endTime,
      date: event.date
    };
    
    return doTimeSlotsOverlap(proposedSlot, eventSlot);
  });
}

/**
 * Find available time slots on a given date
 */
export function findAvailableTimeSlots(
  date: string,
  duration: number, // in minutes
  existingEvents: Event[],
  workingHours: { start: string; end: string } = { start: '08:00', end: '22:00' },
  excludeEventId?: string
): TimeSlot[] {
  const availableSlots: TimeSlot[] = [];
  const dayEvents = existingEvents
    .filter(event => event.date === date && (!excludeEventId || event.id !== excludeEventId))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const workStart = parse(`${date} ${workingHours.start}`, 'yyyy-MM-dd HH:mm', new Date());
  const workEnd = parse(`${date} ${workingHours.end}`, 'yyyy-MM-dd HH:mm', new Date());
  
  let currentTime = workStart;

  // Check for slots before the first event
  if (dayEvents.length > 0) {
    const firstEventStart = parse(`${date} ${dayEvents[0].startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const slotEnd = addMinutes(currentTime, duration);
    
    if (isBefore(slotEnd, firstEventStart) || isEqual(slotEnd, firstEventStart)) {
      availableSlots.push({
        startTime: format(currentTime, 'HH:mm'),
        endTime: format(slotEnd, 'HH:mm'),
        date
      });
    }
  }

  // Check for slots between events
  for (let i = 0; i < dayEvents.length - 1; i++) {
    const currentEventEnd = parse(`${date} ${dayEvents[i].endTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const nextEventStart = parse(`${date} ${dayEvents[i + 1].startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    
    const slotStart = currentEventEnd;
    const slotEnd = addMinutes(slotStart, duration);
    
    if (isBefore(slotEnd, nextEventStart) || isEqual(slotEnd, nextEventStart)) {
      availableSlots.push({
        startTime: format(slotStart, 'HH:mm'),
        endTime: format(slotEnd, 'HH:mm'),
        date
      });
    }
  }

  // Check for slots after the last event
  if (dayEvents.length > 0) {
    const lastEventEnd = parse(`${date} ${dayEvents[dayEvents.length - 1].endTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const slotEnd = addMinutes(lastEventEnd, duration);
    
    if (isBefore(slotEnd, workEnd) || isEqual(slotEnd, workEnd)) {
      availableSlots.push({
        startTime: format(lastEventEnd, 'HH:mm'),
        endTime: format(slotEnd, 'HH:mm'),
        date
      });
    }
  }

  // If no events, the entire working day is available
  if (dayEvents.length === 0) {
    const slotEnd = addMinutes(workStart, duration);
    if (isBefore(slotEnd, workEnd) || isEqual(slotEnd, workEnd)) {
      availableSlots.push({
        startTime: format(workStart, 'HH:mm'),
        endTime: format(slotEnd, 'HH:mm'),
        date
      });
    }
  }

  return availableSlots;
}

/**
 * Calculate event duration in minutes
 */
export function getEventDuration(event: Event): number {
  const start = parse(event.startTime, 'HH:mm', new Date());
  const end = parse(event.endTime, 'HH:mm', new Date());
  return Math.abs(end.getTime() - start.getTime()) / (1000 * 60);
}

/**
 * Suggest rearrangement for conflicting events
 */
export function suggestEventRearrangement(
  newEvent: Omit<Event, 'id'>,
  conflictingEvents: Event[],
  allEvents: Event[],
  userPreferences?: {
    productivityHours?: string[];
    workingHours?: { start: string; end: string };
  }
): EventRearrangementSuggestion[] {
  const suggestions: EventRearrangementSuggestion[] = [];
  const workingHours = userPreferences?.workingHours || { start: '08:00', end: '22:00' };

  // Sort conflicting events by priority (high priority events are harder to move)
  const sortedConflicts = conflictingEvents.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  for (const conflictEvent of sortedConflicts) {
    const duration = getEventDuration(conflictEvent);
    
    // Find available slots for this event on the same day
    const availableSlots = findAvailableTimeSlots(
      conflictEvent.date,
      duration,
      allEvents,
      workingHours,
      conflictEvent.id
    );

    if (availableSlots.length > 0) {
      // Prefer slots that align with user's productivity hours
      let bestSlot = availableSlots[0];
      
      if (userPreferences?.productivityHours && 
          (conflictEvent.category.id === 'study' || conflictEvent.category.id === 'work')) {
        const productiveSlot = availableSlots.find(slot => 
          userPreferences.productivityHours!.some(hour => 
            slot.startTime.startsWith(hour.substring(0, 2))
          )
        );
        if (productiveSlot) bestSlot = productiveSlot;
      }

      suggestions.push({
        originalEvent: conflictEvent,
        newStartTime: bestSlot.startTime,
        newEndTime: bestSlot.endTime,
        reason: `Moved to avoid conflict with "${newEvent.title}"`
      });
    }
  }

  return suggestions;
}

/**
 * Main conflict detection and resolution function
 */
export function detectAndResolveConflicts(
  newEvent: Omit<Event, 'id'>,
  existingEvents: Event[],
  userPreferences?: {
    productivityHours?: string[];
    workingHours?: { start: string; end: string };
  }
): ConflictDetectionResult {
  const proposedSlot: TimeSlot = {
    startTime: newEvent.startTime,
    endTime: newEvent.endTime,
    date: newEvent.date
  };

  const conflictingEvents = findConflictingEvents(proposedSlot, existingEvents);

  if (conflictingEvents.length === 0) {
    return {
      hasConflict: false,
      conflictingEvents: []
    };
  }

  // Try to find alternative slots for the new event first
  const newEventDuration = getEventDuration(newEvent as Event);
  const workingHours = userPreferences?.workingHours || { start: '08:00', end: '22:00' };
  
  const availableSlotsForNewEvent = findAvailableTimeSlots(
    newEvent.date,
    newEventDuration,
    existingEvents,
    workingHours
  );

  if (availableSlotsForNewEvent.length > 0) {
    // Prefer slots that align with user preferences
    let bestSlotForNewEvent = availableSlotsForNewEvent[0];
    
    if (userPreferences?.productivityHours && 
        (newEvent.category.id === 'study' || newEvent.category.id === 'work')) {
      const productiveSlot = availableSlotsForNewEvent.find(slot => 
        userPreferences.productivityHours!.some(hour => 
          slot.startTime.startsWith(hour.substring(0, 2))
        )
      );
      if (productiveSlot) bestSlotForNewEvent = productiveSlot;
    }

    return {
      hasConflict: true,
      conflictingEvents,
      suggestedResolution: {
        rearrangedEvents: [],
        newEventSlot: bestSlotForNewEvent,
        message: `I found a conflict with ${conflictingEvents.map(e => `"${e.title}"`).join(' and ')}. I've moved your new event "${newEvent.title}" to ${bestSlotForNewEvent.startTime}-${bestSlotForNewEvent.endTime} to avoid the conflict.`
      }
    };
  }

  // If no slots available for new event, try to rearrange existing events
  const rearrangementSuggestions = suggestEventRearrangement(
    newEvent,
    conflictingEvents,
    existingEvents,
    userPreferences
  );

  if (rearrangementSuggestions.length > 0) {
    const rearrangedEvents = rearrangementSuggestions.map(suggestion => ({
      ...suggestion.originalEvent,
      startTime: suggestion.newStartTime,
      endTime: suggestion.newEndTime
    }));

    const conflictNames = conflictingEvents.map(e => `"${e.title}"`).join(' and ');
    const rearrangedNames = rearrangementSuggestions.map(s => `"${s.originalEvent.title}"`).join(' and ');

    return {
      hasConflict: true,
      conflictingEvents,
      suggestedResolution: {
        rearrangedEvents,
        newEventSlot: proposedSlot,
        message: `I found a conflict with ${conflictNames}. I've automatically rearranged ${rearrangedNames} to make room for your new event "${newEvent.title}" at ${proposedSlot.startTime}-${proposedSlot.endTime}.`
      }
    };
  }

  // If no resolution possible, return conflict without resolution
  return {
    hasConflict: true,
    conflictingEvents,
    suggestedResolution: {
      rearrangedEvents: [],
      newEventSlot: proposedSlot,
      message: `I found a conflict with ${conflictingEvents.map(e => `"${e.title}"`).join(' and ')}, but couldn't find suitable alternative times. Please manually adjust your schedule or choose a different time for "${newEvent.title}".`
    }
  };
}

/**
 * Check if an event update would create conflicts
 */
export function checkEventUpdateConflicts(
  updatedEvent: Event,
  existingEvents: Event[],
  userPreferences?: {
    productivityHours?: string[];
    workingHours?: { start: string; end: string };
  }
): ConflictDetectionResult {
  const proposedSlot: TimeSlot = {
    startTime: updatedEvent.startTime,
    endTime: updatedEvent.endTime,
    date: updatedEvent.date
  };

  // Exclude the event being updated from conflict detection
  const conflictingEvents = findConflictingEvents(
    proposedSlot, 
    existingEvents, 
    updatedEvent.id
  );

  if (conflictingEvents.length === 0) {
    return {
      hasConflict: false,
      conflictingEvents: []
    };
  }

  // For updates, we prefer to move the conflicting events rather than the updated event
  const rearrangementSuggestions = suggestEventRearrangement(
    updatedEvent,
    conflictingEvents,
    existingEvents.filter(e => e.id !== updatedEvent.id),
    userPreferences
  );

  if (rearrangementSuggestions.length > 0) {
    const rearrangedEvents = rearrangementSuggestions.map(suggestion => ({
      ...suggestion.originalEvent,
      startTime: suggestion.newStartTime,
      endTime: suggestion.newEndTime
    }));

    const conflictNames = conflictingEvents.map(e => `"${e.title}"`).join(' and ');
    const rearrangedNames = rearrangementSuggestions.map(s => `"${s.originalEvent.title}"`).join(' and ');

    return {
      hasConflict: true,
      conflictingEvents,
      suggestedResolution: {
        rearrangedEvents,
        newEventSlot: proposedSlot,
        message: `Updating "${updatedEvent.title}" would conflict with ${conflictNames}. I've automatically rearranged ${rearrangedNames} to accommodate your changes.`
      }
    };
  }

  return {
    hasConflict: true,
    conflictingEvents,
    suggestedResolution: {
      rearrangedEvents: [],
      newEventSlot: proposedSlot,
      message: `Updating "${updatedEvent.title}" would conflict with ${conflictingEvents.map(e => `"${e.title}"`).join(' and ')}, but I couldn't find suitable alternative times for the conflicting events. Please manually resolve the conflicts.`
    }
  };
}