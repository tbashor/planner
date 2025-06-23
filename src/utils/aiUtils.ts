import { Event, AiSuggestion, UserPreferences } from '../types';
import { format, addDays, addHours, startOfDay, parse } from 'date-fns';
import { eventCategories } from '../data/mockData';

export function generateSmartSuggestions(
  events: Event[],
  preferences: UserPreferences,
  currentDate: Date
): AiSuggestion[] {
  const suggestions: AiSuggestion[] = [];

  // Check for study time optimization
  const studyEvents = events.filter(e => e.category.name === 'Study');
  if (studyEvents.length > 0) {
    const isOptimalTime = preferences.productivityHours.some(hour => {
      return studyEvents.some(event => event.startTime.startsWith(hour.slice(0, 2)));
    });
    
    if (!isOptimalTime) {
      suggestions.push({
        id: `optimize-study-${Date.now()}`,
        type: 'optimize',
        title: 'Optimize Study Schedule',
        description: `Move study sessions to your peak hours: ${preferences.productivityHours.join(', ')}`,
        action: 'optimize_study_time',
        priority: 1,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Check for break suggestions
  const workingEvents = events.filter(e => 
    e.category.name === 'Study' || e.category.name === 'Work'
  );
  
  if (workingEvents.length > 2) {
    suggestions.push({
      id: `break-${Date.now()}`,
      type: 'break',
      title: 'Schedule Break Time',
      description: 'Consider adding 15-minute breaks between intensive sessions',
      action: 'add_breaks',
      priority: 2,
      createdAt: new Date().toISOString(),
    });
  }

  return suggestions;
}

export function generatePersonalizedSuggestions(
  events: Event[],
  preferences: UserPreferences,
  currentDate: Date
): AiSuggestion[] {
  const suggestions: AiSuggestion[] = [];
  const today = format(currentDate, 'yyyy-MM-dd');
  const tomorrow = format(addDays(currentDate, 1), 'yyyy-MM-dd');

  // Get user's focus areas and daily routines
  const focusAreas = preferences.focusAreas || [];
  const dailyRoutines = preferences.dailyRoutines || [];
  const productivityHours = preferences.productivityHours || [];

  // Suggest events based on focus areas
  if (focusAreas.includes('health-fitness')) {
    const hasWorkout = events.some(e => 
      e.category.name === 'Health' && 
      (e.date === today || e.date === tomorrow)
    );
    
    if (!hasWorkout) {
      const optimalTime = getOptimalTimeForActivity('workout', productivityHours, preferences.workingHours);
      suggestions.push({
        id: `workout-${Date.now()}`,
        type: 'schedule',
        title: 'Schedule Workout Session',
        description: `Add a 45-minute workout at ${optimalTime} based on your health & fitness goals`,
        action: JSON.stringify({
          type: 'create_event',
          event: {
            title: 'Workout Session',
            startTime: optimalTime,
            endTime: addMinutesToTime(optimalTime, 45),
            date: tomorrow,
            category: 'health',
            priority: 'medium',
            description: 'Stay active and maintain your fitness routine'
          }
        }),
        priority: 1,
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (focusAreas.includes('learning-education')) {
    const hasStudy = events.some(e => 
      e.category.name === 'Study' && 
      (e.date === today || e.date === tomorrow)
    );
    
    if (!hasStudy) {
      const optimalTime = getOptimalTimeForActivity('study', productivityHours, preferences.workingHours);
      suggestions.push({
        id: `study-${Date.now()}`,
        type: 'schedule',
        title: 'Schedule Learning Time',
        description: `Block 90 minutes at ${optimalTime} for focused learning during your peak hours`,
        action: JSON.stringify({
          type: 'create_event',
          event: {
            title: 'Learning Session',
            startTime: optimalTime,
            endTime: addMinutesToTime(optimalTime, 90),
            date: tomorrow,
            category: 'study',
            priority: 'high',
            description: 'Dedicated time for learning and skill development'
          }
        }),
        priority: 1,
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (focusAreas.includes('work-career')) {
    const hasCareerWork = events.some(e => 
      (e.category.name === 'Work' || e.title.toLowerCase().includes('career')) && 
      (e.date === today || e.date === tomorrow)
    );
    
    if (!hasCareerWork) {
      const optimalTime = getOptimalTimeForActivity('work', productivityHours, preferences.workingHours);
      suggestions.push({
        id: `career-${Date.now()}`,
        type: 'schedule',
        title: 'Career Development Time',
        description: `Schedule 60 minutes at ${optimalTime} for career-focused activities`,
        action: JSON.stringify({
          type: 'create_event',
          event: {
            title: 'Career Development',
            startTime: optimalTime,
            endTime: addMinutesToTime(optimalTime, 60),
            date: tomorrow,
            category: 'work',
            priority: 'high',
            description: 'Focus on career growth and professional development'
          }
        }),
        priority: 1,
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (focusAreas.includes('self-care')) {
    const hasSelfCare = events.some(e => 
      (e.category.name === 'Personal' || e.title.toLowerCase().includes('self-care')) && 
      (e.date === today || e.date === tomorrow)
    );
    
    if (!hasSelfCare) {
      const optimalTime = getOptimalTimeForActivity('selfcare', productivityHours, preferences.workingHours);
      suggestions.push({
        id: `selfcare-${Date.now()}`,
        type: 'schedule',
        title: 'Self-Care Time',
        description: `Block 30 minutes at ${optimalTime} for relaxation and self-care`,
        action: JSON.stringify({
          type: 'create_event',
          event: {
            title: 'Self-Care Time',
            startTime: optimalTime,
            endTime: addMinutesToTime(optimalTime, 30),
            date: tomorrow,
            category: 'personal',
            priority: 'medium',
            description: 'Time for relaxation, meditation, or personal wellness'
          }
        }),
        priority: 2,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Suggest routine-based events
  if (dailyRoutines.includes('exercise') && !events.some(e => e.category.name === 'Health' && e.date === tomorrow)) {
    const exerciseTime = getOptimalTimeForActivity('exercise', productivityHours, preferences.workingHours);
    suggestions.push({
      id: `routine-exercise-${Date.now()}`,
      type: 'schedule',
      title: 'Daily Exercise Routine',
      description: `Add your regular exercise routine at ${exerciseTime}`,
      action: JSON.stringify({
        type: 'create_event',
        event: {
          title: 'Exercise Routine',
          startTime: exerciseTime,
          endTime: addMinutesToTime(exerciseTime, 45),
          date: tomorrow,
          category: 'health',
          priority: 'medium',
          description: 'Daily exercise routine to stay healthy and energized'
        }
      }),
      priority: 2,
      createdAt: new Date().toISOString(),
    });
  }

  // Suggest meal planning if user has meal routines
  if (dailyRoutines.includes('breakfast') && !events.some(e => e.category.name === 'Meal' && e.title.includes('Breakfast') && e.date === tomorrow)) {
    suggestions.push({
      id: `breakfast-${Date.now()}`,
      type: 'schedule',
      title: 'Schedule Breakfast',
      description: 'Add your regular breakfast time to maintain routine',
      action: JSON.stringify({
        type: 'create_event',
        event: {
          title: 'Breakfast',
          startTime: '08:00',
          endTime: '08:30',
          date: tomorrow,
          category: 'meal',
          priority: 'low',
          description: 'Start the day with a healthy breakfast'
        }
      }),
      priority: 3,
      createdAt: new Date().toISOString(),
    });
  }

  // Optimize existing schedule
  const busyHours = getBusyHours(events, today);
  if (busyHours.length > 6) {
    suggestions.push({
      id: `optimize-schedule-${Date.now()}`,
      type: 'optimize',
      title: 'Optimize Your Schedule',
      description: 'Your day looks packed! Consider rescheduling some non-critical tasks',
      action: JSON.stringify({
        type: 'optimize_schedule',
        suggestion: 'Move lower priority tasks to less busy time slots'
      }),
      priority: 1,
      createdAt: new Date().toISOString(),
    });
  }

  // Suggest breaks between intensive work
  const intensiveEvents = events.filter(e => 
    (e.category.name === 'Study' || e.category.name === 'Work') && 
    e.date === today
  ).sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (intensiveEvents.length >= 2) {
    for (let i = 0; i < intensiveEvents.length - 1; i++) {
      const current = intensiveEvents[i];
      const next = intensiveEvents[i + 1];
      
      if (getTimeDifference(current.endTime, next.startTime) < 15) {
        suggestions.push({
          id: `break-between-${Date.now()}-${i}`,
          type: 'break',
          title: 'Add Break Time',
          description: `Consider a 15-minute break between "${current.title}" and "${next.title}"`,
          action: JSON.stringify({
            type: 'create_event',
            event: {
              title: 'Break',
              startTime: current.endTime,
              endTime: addMinutesToTime(current.endTime, 15),
              date: current.date,
              category: 'personal',
              priority: 'low',
              description: 'Short break to recharge and refocus'
            }
          }),
          priority: 2,
          createdAt: new Date().toISOString(),
        });
        break; // Only suggest one break at a time
      }
    }
  }

  // Add preference-adaptive suggestions
  if (preferences.aiSuggestions) {
    // Suggest time blocks based on productivity patterns
    const completedEvents = events.filter(e => e.isCompleted);
    if (completedEvents.length > 5) {
      const patterns = analyzeProductivityPatterns(events);
      if (patterns.mostProductiveHours.length > 0) {
        suggestions.push({
          id: `productivity-insight-${Date.now()}`,
          type: 'optimize',
          title: 'Productivity Pattern Insight',
          description: `Your most productive hours are ${patterns.mostProductiveHours.join(', ')}. Consider scheduling important tasks during these times.`,
          action: JSON.stringify({
            type: 'productivity_insight',
            data: patterns
          }),
          priority: 2,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return suggestions.slice(0, 4); // Limit to 4 suggestions
}

// Natural Language Processing for Event Creation
export function parseEventFromMessage(message: string, userPreferences: UserPreferences): Event | null {
  const lowerMessage = message.toLowerCase();
  
  // Check if this is an event creation request
  const eventKeywords = [
    'schedule', 'add', 'create', 'book', 'plan', 'set up', 'arrange',
    'meeting', 'appointment', 'session', 'class', 'workout', 'lunch',
    'dinner', 'break', 'call', 'reminder', 'event'
  ];
  
  const hasEventKeyword = eventKeywords.some(keyword => lowerMessage.includes(keyword));
  if (!hasEventKeyword) return null;

  // Extract event details
  const eventDetails = extractEventDetails(message, userPreferences);
  if (!eventDetails.title) return null;

  return {
    id: `ai_event_${Date.now()}`,
    title: eventDetails.title,
    startTime: eventDetails.startTime,
    endTime: eventDetails.endTime,
    date: eventDetails.date,
    category: eventDetails.category,
    priority: eventDetails.priority,
    description: eventDetails.description,
    isCompleted: false,
    isStatic: false,
    color: eventDetails.category.color,
    isRecurring: eventDetails.isRecurring,
  };
}

function extractEventDetails(message: string, userPreferences: UserPreferences) {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  
  // Default values
  let title = '';
  let startTime = '09:00';
  let endTime = '10:00';
  let date = format(today, 'yyyy-MM-dd');
  let category = eventCategories[2]; // Default to personal
  let priority: 'low' | 'medium' | 'high' = 'medium';
  let description = '';
  let isRecurring = false;

  // Extract title (remove common scheduling words)
  title = message
    .replace(/^(schedule|add|create|book|plan|set up|arrange)\s+/i, '')
    .replace(/\s+(today|tomorrow|at|for|from|to)\s+.*/i, '')
    .replace(/\s+(daily|every day|recurring)\s*/i, '')
    .trim();

  // If title is still empty or too generic, create a default
  if (!title || title.length < 3) {
    if (message.includes('meeting')) title = 'Meeting';
    else if (message.includes('workout') || message.includes('exercise')) title = 'Workout';
    else if (message.includes('lunch')) title = 'Lunch';
    else if (message.includes('dinner')) title = 'Dinner';
    else if (message.includes('break')) title = 'Break';
    else if (message.includes('call')) title = 'Phone Call';
    else if (message.includes('study')) title = 'Study Session';
    else title = 'New Event';
  }

  // Extract time
  const timeRegex = /(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?/i;
  const timeMatch = message.match(timeRegex);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const period = timeMatch[3]?.toLowerCase();

    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  // Extract duration
  const durationRegex = /(?:for\s+)?(\d+)\s*(hour|hours|hr|hrs|minute|minutes|min|mins)/i;
  const durationMatch = message.match(durationRegex);
  if (durationMatch) {
    const value = parseInt(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    
    let durationMinutes = 60; // default 1 hour
    if (unit.includes('hour') || unit.includes('hr')) {
      durationMinutes = value * 60;
    } else if (unit.includes('minute') || unit.includes('min')) {
      durationMinutes = value;
    }
    
    endTime = addMinutesToTime(startTime, durationMinutes);
  } else {
    // Default durations based on event type
    if (title.toLowerCase().includes('meeting')) endTime = addMinutesToTime(startTime, 60);
    else if (title.toLowerCase().includes('workout')) endTime = addMinutesToTime(startTime, 45);
    else if (title.toLowerCase().includes('lunch') || title.toLowerCase().includes('dinner')) endTime = addMinutesToTime(startTime, 30);
    else if (title.toLowerCase().includes('break')) endTime = addMinutesToTime(startTime, 15);
    else endTime = addMinutesToTime(startTime, 60);
  }

  // Extract date
  const dateRegex = /(?:on\s+)?(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;
  const dateMatch = message.match(dateRegex);
  if (dateMatch) {
    const dayString = dateMatch[1].toLowerCase();
    if (dayString === 'today') {
      date = format(today, 'yyyy-MM-dd');
    } else if (dayString === 'tomorrow') {
      date = format(tomorrow, 'yyyy-MM-dd');
    }
    // Could extend for specific days of week
  }

  // Determine category based on keywords
  if (message.includes('workout') || message.includes('exercise') || message.includes('gym')) {
    category = eventCategories.find(c => c.id === 'health') || eventCategories[3];
  } else if (message.includes('study') || message.includes('learn') || message.includes('class')) {
    category = eventCategories.find(c => c.id === 'study') || eventCategories[0];
  } else if (message.includes('work') || message.includes('meeting') || message.includes('project')) {
    category = eventCategories.find(c => c.id === 'work') || eventCategories[1];
  } else if (message.includes('lunch') || message.includes('dinner') || message.includes('breakfast') || message.includes('meal')) {
    category = eventCategories.find(c => c.id === 'meal') || eventCategories[5];
  } else if (message.includes('friend') || message.includes('social') || message.includes('party')) {
    category = eventCategories.find(c => c.id === 'social') || eventCategories[4];
  }

  // Check for recurring
  if (message.includes('daily') || message.includes('every day') || message.includes('recurring')) {
    isRecurring = true;
  }

  // Determine priority
  if (message.includes('important') || message.includes('urgent') || message.includes('critical')) {
    priority = 'high';
  } else if (message.includes('optional') || message.includes('if possible') || message.includes('maybe')) {
    priority = 'low';
  }

  // Create description
  description = `Created by AI assistant from: "${message}"`;

  return {
    title,
    startTime,
    endTime,
    date,
    category,
    priority,
    description,
    isRecurring
  };
}

export function generateAIResponse(message: string, userPreferences: UserPreferences, events: Event[]): string {
  const lowerMessage = message.toLowerCase();
  
  // Check if user is asking about their schedule
  if (lowerMessage.includes('schedule') && (lowerMessage.includes('today') || lowerMessage.includes('what'))) {
    const todayEvents = events.filter(e => e.date === format(new Date(), 'yyyy-MM-dd'));
    if (todayEvents.length === 0) {
      return "You have a free day today! Would you like me to suggest some activities based on your focus areas?";
    } else {
      const eventList = todayEvents.map(e => `${e.startTime} - ${e.title}`).join(', ');
      return `Here's your schedule for today: ${eventList}. Is there anything you'd like to add or change?`;
    }
  }

  // Check if user is asking for suggestions
  if (lowerMessage.includes('suggest') || lowerMessage.includes('recommend') || lowerMessage.includes('what should')) {
    const focusAreas = userPreferences.focusAreas || [];
    if (focusAreas.length > 0) {
      return `Based on your focus areas (${focusAreas.join(', ')}), I can suggest some activities. Would you like me to add a study session, workout, or work block to your calendar?`;
    } else {
      return "I'd be happy to suggest some activities! What are you in the mood for - something productive, relaxing, or health-focused?";
    }
  }

  // Default response for event creation
  return "I understand you'd like to schedule something. I've analyzed your request and will add it to your calendar with the optimal timing based on your preferences!";
}

function getOptimalTimeForActivity(
  activity: string, 
  productivityHours: string[], 
  workingHours: { start: string; end: string }
): string {
  // Default times based on activity type
  const defaultTimes = {
    workout: '07:00',
    exercise: '07:00',
    study: '09:00',
    work: '10:00',
    selfcare: '19:00',
    break: '15:00'
  };

  // If user has productivity hours, try to use them
  if (productivityHours.length > 0) {
    const firstProductiveHour = productivityHours[0];
    if (firstProductiveHour && firstProductiveHour.includes(':')) {
      return firstProductiveHour;
    }
  }

  // Use working hours if available
  if (activity === 'work' || activity === 'study') {
    return workingHours.start || defaultTimes[activity as keyof typeof defaultTimes];
  }

  return defaultTimes[activity as keyof typeof defaultTimes] || '09:00';
}

function addMinutesToTime(time: string, minutes: number): string {
  try {
    const [hours, mins] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, mins + minutes, 0, 0);
    return format(date, 'HH:mm');
  } catch {
    return time;
  }
}

function getBusyHours(events: Event[], date: string): string[] {
  return events
    .filter(e => e.date === date)
    .map(e => e.startTime.split(':')[0])
    .filter((hour, index, arr) => arr.indexOf(hour) === index);
}

function getTimeDifference(time1: string, time2: string): number {
  try {
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    const minutes1 = h1 * 60 + m1;
    const minutes2 = h2 * 60 + m2;
    return Math.abs(minutes2 - minutes1);
  } catch {
    return 0;
  }
}

export function getMotivationalMessage(eventTitle: string, eventCategory: string): string {
  const messages = {
    Study: [
      `🎓 Outstanding work completing "${eventTitle}"! Your dedication is paying off.`,
      `📚 Great job finishing "${eventTitle}"! You're building excellent study habits.`,
      `🌟 Excellent! "${eventTitle}" is done. Your consistency is impressive!`,
    ],
    Work: [
      `💼 Fantastic work on "${eventTitle}"! You're being incredibly productive.`,
      `🚀 Well done completing "${eventTitle}"! Your focus is remarkable.`,
      `⭐ Excellent job with "${eventTitle}"! You're making great progress.`,
    ],
    Health: [
      `💪 Amazing work completing "${eventTitle}"! Your health is your wealth.`,
      `🏃‍♂️ Great job with "${eventTitle}"! You're taking excellent care of yourself.`,
      `🌱 Wonderful! "${eventTitle}" done. Your commitment to health is inspiring.`,
    ],
    Personal: [
      `🎯 Excellent work on "${eventTitle}"! Personal growth takes dedication.`,
      `✨ Well done with "${eventTitle}"! You're investing in yourself wisely.`,
      `🌟 Great job completing "${eventTitle}"! Self-improvement is key to success.`,
    ],
  };

  const categoryMessages = messages[eventCategory as keyof typeof messages] || messages.Personal;
  return categoryMessages[Math.floor(Math.random() * categoryMessages.length)];
}

export function analyzeProductivityPatterns(events: Event[]): {
  mostProductiveHours: string[];
  leastProductiveHours: string[];
  averageTaskDuration: number;
} {
  const completedEvents = events.filter(e => e.isCompleted);
  const hourCounts: { [hour: string]: number } = {};
  let totalDuration = 0;

  completedEvents.forEach(event => {
    const hour = event.startTime.slice(0, 2);
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    
    // Calculate duration
    const [startHour, startMin] = event.startTime.split(':').map(Number);
    const [endHour, endMin] = event.endTime.split(':').map(Number);
    const duration = (endHour * 60 + endMin) - (startHour * 60 + startMin);
    totalDuration += duration;
  });

  const sortedHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
  
  return {
    mostProductiveHours: sortedHours.slice(0, 3).map(([hour]) => `${hour}:00`),
    leastProductiveHours: sortedHours.slice(-3).map(([hour]) => `${hour}:00`),
    averageTaskDuration: completedEvents.length > 0 ? Math.round(totalDuration / completedEvents.length) : 0,
  };
}