/**
 * Date/Time Debugging Utility for Calendar Investigation
 * Helps identify timezone and date conversion issues
 */

export interface DateTimeDebugInfo {
  originalInput: string;
  parsedDate: Date;
  userTimezone: string;
  utcString: string;
  localString: string;
  isoString: string;
  formatResults: {
    'yyyy-MM-dd': string;
    'HH:mm': string;
    'EEEE': string; // Day name
  };
  potentialIssues: string[];
}

export class DateTimeDebugger {
  static debugDateTime(input: string | Date, context: string = ''): DateTimeDebugInfo {
    console.log(`🔍 [DateTimeDebugger] Analyzing ${context}:`, input);
    
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const potentialIssues: string[] = [];
    
    let parsedDate: Date;
    
    if (typeof input === 'string') {
      // Check for common problematic patterns
      if (input.includes('T') && !input.includes('Z') && !input.includes('+') && !input.includes('-')) {
        potentialIssues.push('ISO string without timezone - may cause UTC interpretation');
      }
      
      if (input.match(/^\d{4}-\d{2}-\d{2}$/)) {
        potentialIssues.push('Date-only string - may cause timezone shifts');
      }
      
      parsedDate = new Date(input);
    } else {
      parsedDate = input;
    }
    
    // Check if date is valid
    if (isNaN(parsedDate.getTime())) {
      potentialIssues.push('INVALID DATE - parsing failed');
    }
    
    // Check for timezone offset issues
    const timezoneOffset = parsedDate.getTimezoneOffset();
    if (Math.abs(timezoneOffset) > 0) {
      potentialIssues.push(`Timezone offset detected: ${timezoneOffset} minutes`);
    }
    
    const debugInfo: DateTimeDebugInfo = {
      originalInput: input.toString(),
      parsedDate,
      userTimezone,
      utcString: parsedDate.toUTCString(),
      localString: parsedDate.toLocaleString(),
      isoString: parsedDate.toISOString(),
      formatResults: {
        'yyyy-MM-dd': this.formatSafely(parsedDate, 'yyyy-MM-dd'),
        'HH:mm': this.formatSafely(parsedDate, 'HH:mm'),
        'EEEE': this.formatSafely(parsedDate, 'EEEE'),
      },
      potentialIssues
    };
    
    console.log(`📊 [DateTimeDebugger] Results for ${context}:`, debugInfo);
    return debugInfo;
  }
  
  private static formatSafely(date: Date, formatString: string): string {
    try {
      // Using basic formatting to avoid date-fns dependency issues
      switch (formatString) {
        case 'yyyy-MM-dd':
          return date.getFullYear() + '-' + 
                 String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                 String(date.getDate()).padStart(2, '0');
        case 'HH:mm':
          return String(date.getHours()).padStart(2, '0') + ':' + 
                 String(date.getMinutes()).padStart(2, '0');
        case 'EEEE':
          return date.toLocaleDateString('en-US', { weekday: 'long' });
        default:
          return date.toString();
      }
    } catch (error) {
      return `ERROR: ${error}`;
    }
  }
  
  static compareEventDates(
    scheduledDate: string,
    displayDate: string,
    eventTitle: string = 'Unknown Event'
  ): void {
    console.log(`🔍 [DateTimeDebugger] Comparing dates for event: ${eventTitle}`);
    
    const scheduledDebug = this.debugDateTime(scheduledDate, 'Scheduled Date');
    const displayDebug = this.debugDateTime(displayDate, 'Display Date');
    
    const dayDifference = Math.abs(
      new Date(scheduledDate).getDate() - new Date(displayDate).getDate()
    );
    
    if (dayDifference > 0) {
      console.error(`❌ [DateTimeDebugger] DATE MISMATCH DETECTED for ${eventTitle}:`);
      console.error(`   Scheduled: ${scheduledDate} (${scheduledDebug.formatResults.EEEE})`);
      console.error(`   Displayed: ${displayDate} (${displayDebug.formatResults.EEEE})`);
      console.error(`   Day difference: ${dayDifference} day(s)`);
      
      // Analyze potential causes
      const allIssues = [...scheduledDebug.potentialIssues, ...displayDebug.potentialIssues];
      if (allIssues.length > 0) {
        console.error(`   Potential causes:`, allIssues);
      }
    } else {
      console.log(`✅ [DateTimeDebugger] Dates match correctly for ${eventTitle}`);
    }
  }
  
  static testSpecificDate(): void {
    console.log(`🧪 [DateTimeDebugger] Testing Monday, June 30, 2025 issue...`);
    
    const testCases = [
      '2025-06-30',
      '2025-06-30T00:00:00',
      '2025-06-30T09:00:00',
      '2025-06-30T09:00:00Z',
      '2025-06-30T09:00:00-07:00',
      new Date(2025, 5, 30), // Note: month is 0-indexed
      new Date('2025-06-30'),
    ];
    
    testCases.forEach((testCase, index) => {
      this.debugDateTime(testCase, `Test Case ${index + 1}`);
    });
  }
}

// Auto-run test for the specific issue
if (typeof window !== 'undefined') {
  // Only run in browser environment
  setTimeout(() => {
    DateTimeDebugger.testSpecificDate();
  }, 1000);
}