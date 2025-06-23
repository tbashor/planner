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

// Enhanced suggestion pool with more variety
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

// Motivational and productivity insights
const productivityInsights = [
  'Your most productive hours are showing a pattern - let\'s optimize around them',
  'I notice you complete more tasks when you schedule breaks - shall we add some?',
  'Your energy levels seem highest in the morning - perfect for important work',
  'You\'ve been consistent with your routines - time to level up with new challenges',
  'Your focus areas are well-balanced - let\'s maintain this momentum',
  'I see opportunities to batch similar tasks for better efficiency',
  'Your schedule has good variety - this promotes sustained motivation',
  'You\'re building excellent habits - let\'s reinforce them with strategic timing'
];

const optimizationSuggestions = [
  'Consider time-blocking similar activities for better focus',
  'Your schedule could benefit from strategic buffer time',
  'Grouping related tasks can improve your workflow efficiency',
  'Adding transition time between different types of activities helps mental switching',
  'Your peak energy hours deserve your most important tasks',
  'Regular review sessions can help you stay on track with goals',
  'Scheduling preparation time before important events reduces stress',
  'Building in flexibility helps you adapt to unexpected changes'
];

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

  // Helper function to get random time that doesn't conflict with existing events
  const getAvailableTime = (preferredTimes: string[], targetDate: string) => {
    const dayEvents = events.filter(e => e.date === targetDate);
    const busyTimes = dayEvents.map(e => e.startTime);
    
    const availableTimes = preferredTimes.filter(time => 
      !busyTimes.some(busyTime => Math.abs(
        parseInt(time.split(':')[0]) - parseInt(busyTime.split(':')[0])
      ) < 1)
    );
    
    return availableTimes.length > 0 
      ? getRandomItem(availableTimes, Math.floor(Math.random() * 100))
      : getRandomItem(preferredTimes, Math.floor(Math.random() * 100));
  };

  // Generate suggestions based on focus areas with more variety
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
      const startTime = getAvailableTime(template.times, tomorrow);
      const endTime = addMinutesToTime(startTime, duration);

      // Vary the target date
      const targetDates = [tomorrow, dayAfterTomorrow];
      const targetDate = getRandomItem(targetDates, index);

      suggestions.push({
        id: `${categoryKey}-${sessionId}-${index}`,
        type: 'schedule',
        title: title,
        description: `${description} - Perfect for your ${area.replace('-', ' & ')} goals`,
        action: JSON.stringify({
          type: 'create_event',
          event: {
            title: title,
            startTime: startTime,
            endTime: endTime,
            date: targetDate,
            category: categoryId,
            priority: getRandomItem(['medium', 'high'], index),
            description: `${description}. Suggested by AI based on your focus on ${area.replace('-', ' & ')}.`
          }
        }),
        priority: 1,
        createdAt: new Date().toISOString(),
      });
    }
  });

  // Add routine-based suggestions with variety
  if (dailyRoutines.includes('exercise')) {
    const healthTemplate = suggestionTemplates.health[0];
    const exerciseTitle = getRandomItem(healthTemplate.titles, sessionId % 7);
    const exerciseDescription = getRandomItem(healthTemplate.descriptions, sessionId % 7);
    const exerciseDuration = getRandomItem(healthTemplate.durations, sessionId % 5);
    const exerciseTime = getAvailableTime(healthTemplate.times, tomorrow);

    suggestions.push({
      id: `routine-exercise-${sessionId}`,
      type: 'schedule',
      title: `Daily ${exerciseTitle}`,
      description: `${exerciseDescription} - Part of your daily routine`,
      action: JSON.stringify({
        type: 'create_event',
        event: {
          title: exerciseTitle,
          startTime: exerciseTime,
          endTime: addMinutesToTime(exerciseTime, exerciseDuration),
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

  // Add productivity insights
  const completedEvents = events.filter(e => e.isCompleted);
  if (completedEvents.length > 3) {
    const insight = getRandomItem(productivityInsights, sessionId % 10);
    suggestions.push({
      id: `productivity-insight-${sessionId}`,
      type: 'optimize',
      title: 'Productivity Insight',
      description: insight,
      action: JSON.stringify({
        type: 'productivity_insight',
        data: analyzeProductivityPatterns(events)
      }),
      priority: 2,
      createdAt: new Date().toISOString(),
    });
  }

  // Add optimization suggestions
  const busyHours = getBusyHours(events, today);
  if (busyHours.length > 4) {
    const optimization = getRandomItem(optimizationSuggestions, sessionId % 8);
    suggestions.push({
      id: `optimize-schedule-${sessionId}`,
      type: 'optimize',
      title: 'Schedule Optimization',
      description: optimization,
      action: JSON.stringify({
        type: 'optimize_schedule',
        suggestion: optimization
      }),
      priority: 1,
      createdAt: new Date().toISOString(),
    });
  }

  // Add break suggestions with variety
  const intensiveEvents = events.filter(e => 
    (e.category.name === 'Study' || e.category.name === 'Work') && 
    e.date === today
  ).sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (intensiveEvents.length >= 2) {
    const breakActivities = [
      'Mindful Break', 'Stretch Break', 'Fresh Air Break', 'Hydration Break', 
      'Eye Rest Break', 'Movement Break', 'Breathing Break', 'Mental Reset'
    ];
    const breakDescriptions = [
      'Take a moment for mindfulness', 'Stretch and release tension', 
      'Step outside for fresh air', 'Stay hydrated and refreshed',
      'Rest your eyes and mind', 'Get your body moving', 
      'Practice deep breathing', 'Clear your mind and refocus'
    ];

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
          description: `${breakDescription} between "${current.title}" and "${next.title}"`,
          action: JSON.stringify({
            type: 'create_event',
            event: {
              title: breakTitle,
              startTime: current.endTime,
              endTime: addMinutesToTime(current.endTime, 15),
              date: current.date,
              category: 'personal',
              priority: 'low',
              description: `${breakDescription}. Suggested break by AI.`
            }
          }),
          priority: 2,
          createdAt: new Date().toISOString(),
        });
        break; // Only suggest one break at a time
      }
    }
  }

  // Add meal suggestions if user has meal routines
  if (dailyRoutines.includes('breakfast') || dailyRoutines.includes('lunch') || dailyRoutines.includes('dinner')) {
    const mealTemplate = suggestionTemplates.meal[0];
    const mealTitle = getRandomItem(mealTemplate.titles, sessionId % 10);
    const mealDescription = getRandomItem(mealTemplate.descriptions, sessionId % 10);
    const mealTime = getRandomItem(['08:00', '12:30', '18:30'], sessionId % 3);
    
    suggestions.push({
      id: `meal-suggestion-${sessionId}`,
      type: 'schedule',
      title: mealTitle,
      description: `${mealDescription} - Supporting your nutrition routine`,
      action: JSON.stringify({
        type: 'create_event',
        event: {
          title: mealTitle,
          startTime: mealTime,
          endTime: addMinutesToTime(mealTime, 30),
          date: tomorrow,
          category: 'meal',
          priority: 'medium',
          description: `${mealDescription}. Meal routine suggested by AI.`
        }
      }),
      priority: 3,
      createdAt: new Date().toISOString(),
    });
  }

  // Add creative/variety suggestions
  const creativeSuggestions = [
    {
      title: 'Creative Exploration',
      description: 'Try something new and creative today',
      category: 'personal',
      duration: 45
    },
    {
      title: 'Learning Adventure',
      description: 'Explore a topic that interests you',
      category: 'study',
      duration: 60
    },
    {
      title: 'Social Connection',
      description: 'Reach out to someone important to you',
      category: 'social',
      duration: 30
    },
    {
      title: 'Wellness Check',
      description: 'Take time to assess and improve your well-being',
      category: 'health',
      duration: 30
    }
  ];

  const creativeSuggestion = getRandomItem(creativeSuggestions, sessionId % 4);
  const creativeTime = getAvailableTime(['10:00', '14:00', '16:00', '19:00'], tomorrow);
  
  suggestions.push({
    id: `creative-${sessionId}`,
    type: 'schedule',
    title: creativeSuggestion.title,
    description: creativeSuggestion.description,
    action: JSON.stringify({
      type: 'create_event',
      event: {
        title: creativeSuggestion.title,
        startTime: creativeTime,
        endTime: addMinutesToTime(creativeTime, creativeSuggestion.duration),
        date: tomorrow,
        category: creativeSuggestion.category,
        priority: 'medium',
        description: `${creativeSuggestion.description}. Creative suggestion by AI.`
      }
    }),
    priority: 3,
    createdAt: new Date().toISOString(),
  });

  // Shuffle and return limited suggestions to ensure variety
  const shuffledSuggestions = suggestions.sort(() => Math.random() - 0.5);
  return shuffledSuggestions.slice(0, 4);
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