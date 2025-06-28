import { Event, AiSuggestion, UserPreferences } from '../types';
import { format, addDays, addHours, startOfDay, parse } from 'date-fns';
import { eventCategories } from '../data/mockData';
import { detectAndResolveConflicts, findAvailableTimeSlots, getEventDuration } from './conflictDetection';

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

// Enhanced suggestion pool with more variety and personalization
const suggestionTemplates = {
  health: [
    {
      titles: ['Morning Yoga Session', 'Evening Workout', 'Cardio Training', 'Strength Training', 'Pilates Class', 'Swimming Session', 'Running Time', 'Stretching Break', 'Meditation Session', 'Breathing Exercise'],
      descriptions: ['Start your day with energizing movement', 'End your day with physical activity', 'Boost your cardiovascular health', 'Build muscle and strength', 'Improve flexibility and core strength', 'Full-body low-impact exercise', 'Improve endurance and mental clarity', 'Release tension and improve flexibility', 'Practice mindfulness and reduce stress', 'Center yourself with focused breathing'],
      durations: [30, 45, 60, 20, 90],
      times: ['07:00', '07:30', '08:00', '17:00', '17:30', '18:00', '18:30', '19:00']
    }
  ],
  study: [
    {
      titles: ['Deep Learning Session', 'Skill Development Time', 'Research Block', 'Practice Session', 'Review & Consolidation', 'Creative Learning', 'Problem Solving Time', 'Knowledge Building', 'Focused Study Block', 'Learning Sprint'],
      descriptions: ['Dive deep into complex topics', 'Develop new skills and abilities', 'Explore and gather information', 'Apply what you\'ve learned', 'Reinforce and organize knowledge', 'Learn through creative methods', 'Tackle challenging problems', 'Build foundational knowledge', 'Concentrated learning time', 'Intensive learning session'],
      durations: [60, 90, 120, 45, 75],
      times: ['09:00', '09:30', '10:00', '10:30', '14:00', '14:30', '15:00', '20:00']
    }
  ],
  work: [
    {
      titles: ['Strategic Planning', 'Project Development', 'Skill Enhancement', 'Network Building', 'Goal Setting Session', 'Career Planning', 'Professional Development', 'Innovation Time', 'Process Improvement', 'Leadership Development'],
      descriptions: ['Plan your long-term career strategy', 'Work on important projects', 'Develop professional skills', 'Build valuable connections', 'Set and review career goals', 'Plan your career trajectory', 'Invest in professional growth', 'Explore new ideas and solutions', 'Optimize your workflows', 'Develop leadership capabilities'],
      durations: [60, 90, 45, 30, 120],
      times: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']
    }
  ],
  personal: [
    {
      titles: ['Self-Care Time', 'Personal Reflection', 'Hobby Time', 'Creative Expression', 'Personal Organization', 'Life Planning', 'Mindfulness Practice', 'Personal Growth', 'Relaxation Time', 'Digital Detox'],
      descriptions: ['Take care of your well-being', 'Reflect on your journey and goals', 'Engage in activities you love', 'Express yourself creatively', 'Organize your personal space', 'Plan your personal life', 'Practice being present', 'Work on personal development', 'Unwind and recharge', 'Disconnect from technology'],
      durations: [30, 45, 60, 90, 20],
      times: ['19:00', '19:30', '20:00', '20:30', '21:00', '08:00', '08:30']
    }
  ],
  social: [
    {
      titles: ['Social Connection Time', 'Community Engagement', 'Relationship Building', 'Social Activity', 'Group Learning', 'Collaborative Project', 'Social Support', 'Networking Event', 'Social Wellness', 'Team Building'],
      descriptions: ['Connect with friends and family', 'Engage with your community', 'Strengthen relationships', 'Participate in social activities', 'Learn with others', 'Work on shared goals', 'Give and receive support', 'Meet new people professionally', 'Maintain social well-being', 'Build team connections'],
      durations: [60, 90, 120, 45, 30],
      times: ['12:00', '17:00', '18:00', '19:00', '20:00']
    }
  ],
  meal: [
    {
      titles: ['Mindful Breakfast', 'Nutritious Lunch', 'Healthy Dinner', 'Meal Prep Session', 'Cooking Time', 'Nutrition Planning', 'Hydration Break', 'Snack Time', 'Family Meal', 'Cooking Practice'],
      descriptions: ['Start your day with proper nutrition', 'Fuel your afternoon with healthy food', 'End your day with a balanced meal', 'Prepare meals for the week', 'Practice culinary skills', 'Plan your nutritional needs', 'Stay properly hydrated', 'Healthy snacking time', 'Connect over food', 'Improve cooking abilities'],
      durations: [30, 45, 60, 90, 15],
      times: ['08:00', '12:00', '18:00', '19:00', '10:00', '15:00']
    }
  ]
};

// Enhanced motivational and productivity insights based on user preferences
const getPersonalizedProductivityInsights = (preferences: UserPreferences): string[] => {
  const insights = [];
  
  if (preferences.productivityHours && preferences.productivityHours.length > 0) {
    insights.push(`Your peak productivity hours (${preferences.productivityHours.join(', ')}) are perfect for your most important tasks`);
  }
  
  if (preferences.focusAreas && preferences.focusAreas.includes('learning-education')) {
    insights.push('Your focus on learning is building valuable skills - let\'s schedule consistent study blocks');
  }
  
  if (preferences.focusAreas && preferences.focusAreas.includes('health-fitness')) {
    insights.push('Your commitment to health is excellent - regular exercise boosts both physical and mental performance');
  }
  
  if (preferences.dailyRoutines && preferences.dailyRoutines.length > 0) {
    insights.push(`Your daily routines (${preferences.dailyRoutines.join(', ')}) create structure and consistency`);
  }
  
  if (preferences.workingHours) {
    insights.push(`Your ${preferences.workingHours.start}-${preferences.workingHours.end} work schedule allows for good work-life balance`);
  }
  
  if (preferences.goals && preferences.goals.trim()) {
    insights.push('Your clear goals provide direction - let\'s align your schedule to achieve them');
  }
  
  // Add generic insights if no specific preferences
  if (insights.length === 0) {
    insights.push(
      'Building consistent habits leads to long-term success',
      'Time-blocking helps maintain focus and reduces decision fatigue',
      'Regular breaks improve overall productivity and well-being'
    );
  }
  
  return insights;
};

const getPersonalizedOptimizationSuggestions = (preferences: UserPreferences): string[] => {
  const suggestions = [];
  
  if (preferences.productivityHours && preferences.productivityHours.length > 0) {
    suggestions.push(`Schedule your most important tasks during ${preferences.productivityHours.join(' or ')} for maximum efficiency`);
  }
  
  if (preferences.focusAreas && preferences.focusAreas.includes('work-career')) {
    suggestions.push('Group similar work tasks together to minimize context switching');
  }
  
  if (preferences.focusAreas && preferences.focusAreas.includes('learning-education')) {
    suggestions.push('Schedule study sessions when your energy is highest for better retention');
  }
  
  if (preferences.dailyRoutines && preferences.dailyRoutines.includes('exercise')) {
    suggestions.push('Plan workouts at consistent times to build a sustainable fitness habit');
  }
  
  if (preferences.timeBlockSize && preferences.timeBlockSize < 60) {
    suggestions.push('Consider longer time blocks for deep work to avoid frequent interruptions');
  }
  
  // Add generic suggestions if no specific preferences
  if (suggestions.length === 0) {
    suggestions.push(
      'Consider time-blocking similar activities for better focus',
      'Add buffer time between different types of activities',
      'Schedule preparation time before important events'
    );
  }
  
  return suggestions;
};

export function generatePersonalizedSuggestions(
  events: Event[],
  preferences: UserPreferences,
  currentDate: Date
): AiSuggestion[] {
  const suggestions: AiSuggestion[] = [];
  const today = format(currentDate, 'yyyy-MM-dd');
  const tomorrow = format(addDays(currentDate, 1), 'yyyy-MM-dd');
  const dayAfterTomorrow = format(addDays(currentDate, 2), 'yyyy-MM-dd');

  // Get user's focus areas and daily routines
  const focusAreas = preferences.focusAreas || [];
  const dailyRoutines = preferences.dailyRoutines || [];
  const productivityHours = preferences.productivityHours || [];

  // Generate unique timestamp for this session
  const sessionId = Date.now();
  const randomSeed = Math.floor(Math.random() * 1000);

  // Helper function to get random item from array
  const getRandomItem = (array: any[], index: number = 0) => {
    const randomIndex = (sessionId + randomSeed + index) % array.length;
    return array[randomIndex];
  };

  // Enhanced helper function to get available time that doesn't conflict with existing events
  const getAvailableTime = (preferredTimes: string[], targetDate: string, duration: number = 60) => {
    const workingHours = preferences.workingHours || { start: '08:00', end: '22:00' };
    
    // Find all available slots for the given duration
    const availableSlots = findAvailableTimeSlots(
      targetDate,
      duration,
      events,
      workingHours
    );

    if (availableSlots.length === 0) {
      // If no slots available, return a preferred time anyway (conflict will be handled later)
      return getRandomItem(preferredTimes, Math.floor(Math.random() * 100));
    }

    // If user has productivity hours, prefer those times
    const userPreferredTimes = productivityHours.length > 0 
      ? productivityHours.filter(hour => preferredTimes.includes(hour))
      : preferredTimes;
    
    const timesToCheck = userPreferredTimes.length > 0 ? userPreferredTimes : preferredTimes;
    
    // Find available slots that match preferred times
    const preferredAvailableSlots = availableSlots.filter(slot => 
      timesToCheck.some(time => slot.startTime === time)
    );
    
    if (preferredAvailableSlots.length > 0) {
      const chosenSlot = getRandomItem(preferredAvailableSlots, Math.floor(Math.random() * 100));
      return chosenSlot.startTime;
    }
    
    // If no preferred slots, use any available slot
    const chosenSlot = getRandomItem(availableSlots, Math.floor(Math.random() * 100));
    return chosenSlot.startTime;
  };

  // Generate suggestions based on focus areas with conflict detection
  focusAreas.forEach((area, index) => {
    let categoryKey = '';
    let categoryId = '';
    
    switch (area) {
      case 'health-fitness':
        categoryKey = 'health';
        categoryId = 'health';
        break;
      case 'learning-education':
        categoryKey = 'study';
        categoryId = 'study';
        break;
      case 'work-career':
        categoryKey = 'work';
        categoryId = 'work';
        break;
      case 'self-care':
        categoryKey = 'personal';
        categoryId = 'personal';
        break;
      case 'relationships':
        categoryKey = 'social';
        categoryId = 'social';
        break;
      case 'hobbies-interests':
        categoryKey = 'personal';
        categoryId = 'personal';
        break;
    }

    if (categoryKey && suggestionTemplates[categoryKey as keyof typeof suggestionTemplates]) {
      const template = suggestionTemplates[categoryKey as keyof typeof suggestionTemplates][0];
      const title = getRandomItem(template.titles, index);
      const description = getRandomItem(template.descriptions, index);
      const duration = getRandomItem(template.durations, index);
      
      // Use user's productivity hours if available and relevant
      const preferredTimes = (categoryKey === 'study' || categoryKey === 'work') && productivityHours.length > 0
        ? productivityHours
        : template.times;
      
      // Vary the target date
      const targetDates = [tomorrow, dayAfterTomorrow];
      const targetDate = getRandomItem(targetDates, index);
      
      const startTime = getAvailableTime(preferredTimes, targetDate, duration);
      const endTime = addMinutesToTime(startTime, duration);

      // Create the event suggestion with conflict detection built-in
      const eventSuggestion = {
        title: title,
        startTime: startTime,
        endTime: endTime,
        date: targetDate,
        category: categoryId,
        priority: getRandomItem(['medium', 'high'], index),
        description: `${description}. Suggested by AI based on your focus on ${area.replace('-', ' & ')}.`
      };

      suggestions.push({
        id: `${categoryKey}-${sessionId}-${index}`,
        type: 'schedule',
        title: title,
        description: `${description} - Aligned with your ${area.replace('-', ' & ')} focus area${productivityHours.length > 0 && (categoryKey === 'study' || categoryKey === 'work') ? ' during optimal hours' : ''}`,
        action: JSON.stringify({
          type: 'create_event_with_conflict_detection',
          event: eventSuggestion
        }),
        priority: 1,
        createdAt: new Date().toISOString(),
      });
    }
  });

  // Enhanced routine-based suggestions with conflict detection
  dailyRoutines.forEach((routine, index) => {
    const routineTime = getCurrentTimeForRoutine(routine, preferences);
    const routineDuration = getDurationForRoutine(routine);
    
    if (routine === 'exercise') {
      const healthTemplate = suggestionTemplates.health[0];
      const exerciseTitle = getRandomItem(healthTemplate.titles, sessionId % 7);
      const exerciseDescription = getRandomItem(healthTemplate.descriptions, sessionId % 7);
      
      const finalTime = routineTime || getAvailableTime(['07:00', '07:30', '18:00', '18:30'], tomorrow, routineDuration);
      
      suggestions.push({
        id: `routine-exercise-${sessionId}`,
        type: 'schedule',
        title: `Daily ${exerciseTitle}`,
        description: `${exerciseDescription} - Part of your daily routine${routineTime ? ` at ${routineTime}` : ' at an optimal time'}`,
        action: JSON.stringify({
          type: 'create_event_with_conflict_detection',
          event: {
            title: exerciseTitle,
            startTime: finalTime,
            endTime: addMinutesToTime(finalTime, routineDuration),
            date: tomorrow,
            category: 'health',
            priority: 'medium',
            description: `${exerciseDescription}. Daily routine suggested by AI.`
          }
        }),
        priority: 2,
        createdAt: new Date().toISOString(),
      });
    }
    
    if (routine === 'breakfast') {
      const breakfastTime = getAvailableTime(['08:00', '08:30', '09:00'], tomorrow, 30);
      
      suggestions.push({
        id: `routine-breakfast-${sessionId}`,
        type: 'schedule',
        title: 'Mindful Breakfast',
        description: 'Start your day with proper nutrition - part of your daily routine',
        action: JSON.stringify({
          type: 'create_event_with_conflict_detection',
          event: {
            title: 'Breakfast',
            startTime: breakfastTime,
            endTime: addMinutesToTime(breakfastTime, 30),
            date: tomorrow,
            category: 'meal',
            priority: 'medium',
            description: 'Daily breakfast routine suggested by AI.'
          }
        }),
        priority: 2,
        createdAt: new Date().toISOString(),
      });
    }
    
    if (routine === 'lunch') {
      const lunchTime = getAvailableTime(['12:00', '12:30', '13:00'], tomorrow, 30);
      
      suggestions.push({
        id: `routine-lunch-${sessionId}`,
        type: 'schedule',
        title: 'Lunch Break',
        description: 'Fuel your afternoon with healthy food - part of your daily routine',
        action: JSON.stringify({
          type: 'create_event_with_conflict_detection',
          event: {
            title: 'Lunch',
            startTime: lunchTime,
            endTime: addMinutesToTime(lunchTime, 30),
            date: tomorrow,
            category: 'meal',
            priority: 'medium',
            description: 'Daily lunch routine suggested by AI.'
          }
        }),
        priority: 2,
        createdAt: new Date().toISOString(),
      });
    }
  });

  // Add personalized productivity insights
  const completedEvents = events.filter(e => e.isCompleted);
  if (completedEvents.length > 3) {
    const personalizedInsights = getPersonalizedProductivityInsights(preferences);
    const insight = getRandomItem(personalizedInsights, sessionId % 10);
    
    suggestions.push({
      id: `productivity-insight-${sessionId}`,
      type: 'optimize',
      title: 'Personalized Productivity Insight',
      description: insight,
      action: JSON.stringify({
        type: 'productivity_insight',
        data: analyzeProductivityPatterns(events, preferences)
      }),
      priority: 2,
      createdAt: new Date().toISOString(),
    });
  }

  // Add personalized optimization suggestions
  const busyHours = getBusyHours(events, today);
  if (busyHours.length > 4) {
    const personalizedOptimizations = getPersonalizedOptimizationSuggestions(preferences);
    const optimization = getRandomItem(personalizedOptimizations, sessionId % 8);
    
    suggestions.push({
      id: `optimize-schedule-${sessionId}`,
      type: 'optimize',
      title: 'Personalized Schedule Optimization',
      description: optimization,
      action: JSON.stringify({
        type: 'optimize_schedule',
        suggestion: optimization,
        userPreferences: preferences
      }),
      priority: 1,
      createdAt: new Date().toISOString(),
    });
  }

  // Enhanced break suggestions based on user preferences with conflict detection
  const intensiveEvents = events.filter(e => 
    (e.category.name === 'Study' || e.category.name === 'Work') && 
    e.date === today
  ).sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (intensiveEvents.length >= 2) {
    const breakActivities = preferences.focusAreas?.includes('health-fitness')
      ? ['Movement Break', 'Stretch Break', 'Breathing Break', 'Eye Rest Break']
      : ['Mindful Break', 'Fresh Air Break', 'Hydration Break', 'Mental Reset'];
      
    const breakDescriptions = preferences.focusAreas?.includes('health-fitness')
      ? ['Get your body moving', 'Stretch and release tension', 'Practice deep breathing', 'Rest your eyes and mind']
      : ['Take a moment for mindfulness', 'Step outside for fresh air', 'Stay hydrated and refreshed', 'Clear your mind and refocus'];

    for (let i = 0; i < Math.min(intensiveEvents.length - 1, 2); i++) {
      const current = intensiveEvents[i];
      const next = intensiveEvents[i + 1];
      
      if (getTimeDifference(current.endTime, next.startTime) < 30) {
        const breakTitle = getRandomItem(breakActivities, sessionId + i);
        const breakDescription = getRandomItem(breakDescriptions, sessionId + i);
        
        suggestions.push({
          id: `break-between-${sessionId}-${i}`,
          type: 'break',
          title: `Add ${breakTitle}`,
          description: `${breakDescription} between "${current.title}" and "${next.title}"${preferences.focusAreas?.includes('health-fitness') ? ' - supports your health focus' : ''}`,
          action: JSON.stringify({
            type: 'create_event_with_conflict_detection',
            event: {
              title: breakTitle,
              startTime: current.endTime,
              endTime: addMinutesToTime(current.endTime, 15),
              date: current.date,
              category: 'personal',
              priority: 'low',
              description: `${breakDescription}. Suggested break by AI based on your preferences.`
            }
          }),
          priority: 2,
          createdAt: new Date().toISOString(),
        });
        break; // Only suggest one break at a time
      }
    }
  }

  // Goals-based suggestions with conflict detection
  if (preferences.goals && preferences.goals.trim()) {
    const goalKeywords = preferences.goals.toLowerCase();
    let goalSuggestion = null;
    
    if (goalKeywords.includes('learn') || goalKeywords.includes('skill') || goalKeywords.includes('study')) {
      goalSuggestion = {
        title: 'Goal-Focused Learning Session',
        description: 'Work towards your learning goals with dedicated study time',
        category: 'study',
        duration: 90
      };
    } else if (goalKeywords.includes('health') || goalKeywords.includes('fit') || goalKeywords.includes('exercise')) {
      goalSuggestion = {
        title: 'Goal-Focused Wellness Time',
        description: 'Take action towards your health and fitness goals',
        category: 'health',
        duration: 45
      };
    } else if (goalKeywords.includes('work') || goalKeywords.includes('career') || goalKeywords.includes('professional')) {
      goalSuggestion = {
        title: 'Goal-Focused Career Development',
        description: 'Advance your professional goals with focused work time',
        category: 'work',
        duration: 60
      };
    }
    
    if (goalSuggestion) {
      const goalTime = getAvailableTime(
        productivityHours.length > 0 ? productivityHours : ['10:00', '14:00', '16:00'], 
        tomorrow, 
        goalSuggestion.duration
      );
      
      suggestions.push({
        id: `goal-focused-${sessionId}`,
        type: 'schedule',
        title: goalSuggestion.title,
        description: `${goalSuggestion.description} - aligned with your goals: "${preferences.goals.substring(0, 50)}${preferences.goals.length > 50 ? '...' : ''}"`,
        action: JSON.stringify({
          type: 'create_event_with_conflict_detection',
          event: {
            title: goalSuggestion.title,
            startTime: goalTime,
            endTime: addMinutesToTime(goalTime, goalSuggestion.duration),
            date: tomorrow,
            category: goalSuggestion.category,
            priority: 'high',
            description: `${goalSuggestion.description}. Goal-focused suggestion by AI.`
          }
        }),
        priority: 1,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Shuffle and return limited suggestions to ensure variety
  const shuffledSuggestions = suggestions.sort(() => Math.random() - 0.5);
  return shuffledSuggestions.slice(0, 4);
}

// Helper functions for routine timing
function getCurrentTimeForRoutine(routine: string, preferences: UserPreferences): string | null {
  // Use working hours if available for work-related routines
  if (routine === 'commute' && preferences.workingHours) {
    return preferences.workingHours.start;
  }
  
  // Use productivity hours for exercise if user prefers morning workouts
  if (routine === 'exercise' && preferences.productivityHours?.includes('early-morning')) {
    return '07:00';
  }
  
  return null; // Let the system choose optimal time
}

function getDurationForRoutine(routine: string): number {
  const durations: { [key: string]: number } = {
    'breakfast': 30,
    'lunch': 30,
    'dinner': 45,
    'exercise': 45,
    'commute': 30
  };
  
  return durations[routine] || 30;
}

// Natural Language Processing for Event Creation with enhanced personalization and conflict detection
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

  // Extract event details with user preferences
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
  
  // Default values based on user preferences
  let title = '';
  let startTime = userPreferences.productivityHours?.[0] || '09:00';
  let endTime = addMinutesToTime(startTime, 60);
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

  // If title is still empty or too generic, create a default based on user preferences
  if (!title || title.length < 3) {
    if (message.includes('meeting')) title = 'Meeting';
    else if (message.includes('workout') || message.includes('exercise')) {
      title = userPreferences.focusAreas?.includes('health-fitness') ? 'Fitness Session' : 'Workout';
    }
    else if (message.includes('lunch')) title = 'Lunch Break';
    else if (message.includes('dinner')) title = 'Dinner';
    else if (message.includes('break')) title = 'Break';
    else if (message.includes('call')) title = 'Phone Call';
    else if (message.includes('study')) {
      title = userPreferences.focusAreas?.includes('learning-education') ? 'Learning Session' : 'Study Session';
    }
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
  } else {
    // Use user's productivity hours for work/study events
    if ((message.includes('work') || message.includes('study')) && userPreferences.productivityHours?.length > 0) {
      startTime = userPreferences.productivityHours[0];
    }
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
    // Default durations based on event type and user preferences
    if (title.toLowerCase().includes('meeting')) endTime = addMinutesToTime(startTime, 60);
    else if (title.toLowerCase().includes('workout')) {
      const duration = userPreferences.focusAreas?.includes('health-fitness') ? 60 : 45;
      endTime = addMinutesToTime(startTime, duration);
    }
    else if (title.toLowerCase().includes('lunch') || title.toLowerCase().includes('dinner')) {
      endTime = addMinutesToTime(startTime, 30);
    }
    else if (title.toLowerCase().includes('break')) endTime = addMinutesToTime(startTime, 15);
    else if (title.toLowerCase().includes('study')) {
      const duration = userPreferences.focusAreas?.includes('learning-education') ? 90 : 60;
      endTime = addMinutesToTime(startTime, duration);
    }
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

  // Determine category based on keywords and user preferences
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

  // Determine priority based on user preferences and keywords
  if (message.includes('important') || message.includes('urgent') || message.includes('critical')) {
    priority = 'high';
  } else if (message.includes('optional') || message.includes('if possible') || message.includes('maybe')) {
    priority = 'low';
  } else {
    // Set priority based on user's focus areas
    if (userPreferences.focusAreas?.includes(category.id.replace('health', 'health-fitness').replace('study', 'learning-education').replace('work', 'work-career'))) {
      priority = 'high';
    }
  }

  // Create personalized description
  description = `Created by AI assistant from: "${message}"`;
  if (userPreferences.focusAreas?.length > 0) {
    description += ` - Aligned with your focus areas: ${userPreferences.focusAreas.join(', ')}`;
  }

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
      const suggestions = [];
      if (userPreferences.dailyRoutines?.includes('exercise')) {
        suggestions.push('a workout session');
      }
      if (userPreferences.focusAreas?.includes('learning-education')) {
        suggestions.push('some study time');
      }
      if (userPreferences.focusAreas?.includes('work-career')) {
        suggestions.push('focused work time');
      }
      
      const suggestionText = suggestions.length > 0 
        ? ` Would you like me to suggest ${suggestions.slice(0, 2).join(' or ')} based on your preferences?`
        : ' Would you like me to suggest some activities based on your focus areas?';
        
      return `You have a free day today!${suggestionText}`;
    } else {
      const eventList = todayEvents.map(e => `${e.startTime} - ${e.title}`).join(', ');
      return `Here's your schedule for today: ${eventList}. Is there anything you'd like to add or change?`;
    }
  }

  // Check if user is asking for suggestions
  if (lowerMessage.includes('suggest') || lowerMessage.includes('recommend') || lowerMessage.includes('what should')) {
    const focusAreas = userPreferences.focusAreas || [];
    const dailyRoutines = userPreferences.dailyRoutines || [];
    
    if (focusAreas.length > 0 || dailyRoutines.length > 0) {
      const suggestions = [];
      
      if (focusAreas.includes('learning-education')) suggestions.push('a study session');
      if (focusAreas.includes('health-fitness') || dailyRoutines.includes('exercise')) suggestions.push('a workout');
      if (focusAreas.includes('work-career')) suggestions.push('focused work time');
      if (dailyRoutines.includes('lunch')) suggestions.push('your lunch break');
      
      const suggestionText = suggestions.length > 0 
        ? suggestions.slice(0, 3).join(', ')
        : 'some activities';
        
      return `Based on your preferences (${[...focusAreas, ...dailyRoutines].join(', ')}), I can suggest ${suggestionText}. What would you like me to schedule?`;
    } else {
      return "I'd be happy to suggest some activities! What are you in the mood for - something productive, relaxing, or health-focused?";
    }
  }

  // Default response for event creation with personalization
  const personalizedResponse = userPreferences.focusAreas?.length > 0 
    ? ` I'll optimize the timing based on your focus areas (${userPreferences.focusAreas.slice(0, 2).join(', ')}) and preferences, and automatically handle any scheduling conflicts!`
    : ' I\'ll find the optimal timing based on your preferences and handle any conflicts automatically!';
    
  return `I understand you'd like to schedule something. I've analyzed your request and will add it to your calendar with${personalizedResponse}`;
}

function getOptimalTimeForActivity(
  activity: string, 
  productivityHours: string[], 
  workingHours: { start: string; end: string },
  userPreferences: UserPreferences
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

  // If user has productivity hours, try to use them for work/study activities
  if (productivityHours.length > 0 && (activity === 'work' || activity === 'study')) {
    return productivityHours[0];
  }

  // Use working hours if available for work activities
  if (activity === 'work' && workingHours.start) {
    return workingHours.start;
  }

  // Consider user's daily routines for timing
  if (activity === 'exercise' && userPreferences.dailyRoutines?.includes('exercise')) {
    // If user has exercise routine, suggest morning time
    return '07:00';
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

export function getMotivationalMessage(eventTitle: string, eventCategory: string, userPreferences?: UserPreferences): string {
  const messages = {
    Study: [
      `🎓 Outstanding work completing "${eventTitle}"! Your dedication to learning is paying off.`,
      `📚 Great job finishing "${eventTitle}"! You're building excellent study habits.`,
      `🌟 Excellent! "${eventTitle}" is done. Your consistency in learning is impressive!`,
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
  let message = categoryMessages[Math.floor(Math.random() * categoryMessages.length)];
  
  // Add personalized encouragement based on user preferences
  if (userPreferences?.focusAreas?.includes('health-fitness') && eventCategory === 'Health') {
    message += ' Your focus on health and fitness is really showing!';
  } else if (userPreferences?.focusAreas?.includes('learning-education') && eventCategory === 'Study') {
    message += ' Your commitment to learning aligns perfectly with your goals!';
  } else if (userPreferences?.focusAreas?.includes('work-career') && eventCategory === 'Work') {
    message += ' This dedication to your career will pay dividends!';
  }
  
  return message;
}

export function analyzeProductivityPatterns(events: Event[], userPreferences?: UserPreferences): {
  mostProductiveHours: string[];
  leastProductiveHours: string[];
  averageTaskDuration: number;
  alignmentWithPreferences: number;
} {
  const completedEvents = events.filter(e => e.isCompleted);
  const hourCounts: { [hour: string]: number } = {};
  let totalDuration = 0;
  let alignmentScore = 0;

  completedEvents.forEach(event => {
    const hour = event.startTime.slice(0, 2);
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    
    // Calculate duration
    const [startHour, startMin] = event.startTime.split(':').map(Number);
    const [endHour, endMin] = event.endTime.split(':').map(Number);
    const duration = (endHour * 60 + endMin) - (startHour * 60 + startMin);
    totalDuration += duration;
    
    // Calculate alignment with user preferences
    if (userPreferences) {
      if (userPreferences.productivityHours?.includes(`${hour}:00`)) {
        alignmentScore += 2; // High alignment
      }
      if (userPreferences.focusAreas?.some(area => {
        const categoryMap: { [key: string]: string } = {
          'health-fitness': 'health',
          'learning-education': 'study',
          'work-career': 'work'
        };
        return categoryMap[area] === event.category.id;
      })) {
        alignmentScore += 1; // Focus area alignment
      }
    }
  });

  const sortedHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
  const maxAlignment = completedEvents.length * 3; // Maximum possible alignment score
  
  return {
    mostProductiveHours: sortedHours.slice(0, 3).map(([hour]) => `${hour}:00`),
    leastProductiveHours: sortedHours.slice(-3).map(([hour]) => `${hour}:00`),
    averageTaskDuration: completedEvents.length > 0 ? Math.round(totalDuration / completedEvents.length) : 0,
    alignmentWithPreferences: maxAlignment > 0 ? Math.round((alignmentScore / maxAlignment) * 100) : 0,
  };
}

/**
 * Enhanced event creation with conflict detection and resolution
 */
export function createEventWithConflictDetection(
  newEvent: Omit<Event, 'id'>,
  existingEvents: Event[],
  userPreferences?: UserPreferences
): {
  event: Event;
  conflictResolution?: {
    hasConflict: boolean;
    message: string;
    rearrangedEvents: Event[];
  };
} {
  const eventWithId = {
    ...newEvent,
    id: `ai_event_${Date.now()}`
  };

  // Detect and resolve conflicts
  const conflictResult = detectAndResolveConflicts(newEvent, existingEvents, userPreferences);

  if (!conflictResult.hasConflict) {
    return { event: eventWithId };
  }

  if (conflictResult.suggestedResolution) {
    const { newEventSlot, rearrangedEvents, message } = conflictResult.suggestedResolution;
    
    // Update the new event with the suggested time slot
    const finalEvent = {
      ...eventWithId,
      startTime: newEventSlot.startTime,
      endTime: newEventSlot.endTime,
      date: newEventSlot.date
    };

    return {
      event: finalEvent,
      conflictResolution: {
        hasConflict: true,
        message,
        rearrangedEvents
      }
    };
  }

  // If no resolution possible, return the event as-is with conflict warning
  return {
    event: eventWithId,
    conflictResolution: {
      hasConflict: true,
      message: `Warning: "${newEvent.title}" conflicts with existing events but couldn't be automatically resolved. Please check your schedule.`,
      rearrangedEvents: []
    }
  };
}