import { Event, AiSuggestion, UserPreferences } from '../types';

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