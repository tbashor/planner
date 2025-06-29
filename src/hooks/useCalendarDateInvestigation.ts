import { useState, useEffect } from 'react';
import { format, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { DateTimeDebugger } from '../utils/dateTimeDebugger';

/**
 * Hook to investigate calendar date issues
 * Specifically designed to debug the June 30, 2025 -> June 29, 2025 issue
 */
export function useCalendarDateInvestigation() {
  const [investigationResults, setInvestigationResults] = useState<{
    timezone: string;
    dateConversions: Array<{
      input: string;
      output: string;
      method: string;
      issues: string[];
    }>;
    weekCalculations: Array<{
      inputDate: string;
      weekStart: string;
      weekEnd: string;
      weekStartDay: string;
      weekEndDay: string;
    }>;
    potentialCauses: string[];
  } | null>(null);

  useEffect(() => {
    const investigate = () => {
      console.log('🔍 Starting calendar date investigation...');
      
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const dateConversions: any[] = [];
      const weekCalculations: any[] = [];
      const potentialCauses: string[] = [];

      // Test the specific problematic date
      const problematicDate = '2025-06-30';
      
      // Test various date parsing methods
      const testMethods = [
        {
          name: 'new Date(string)',
          fn: (dateStr: string) => new Date(dateStr)
        },
        {
          name: 'parseISO from date-fns',
          fn: (dateStr: string) => parseISO(dateStr)
        },
        {
          name: 'new Date with T00:00:00',
          fn: (dateStr: string) => new Date(dateStr + 'T00:00:00')
        },
        {
          name: 'new Date with explicit timezone',
          fn: (dateStr: string) => new Date(dateStr + 'T00:00:00' + getTimezoneOffset())
        }
      ];

      testMethods.forEach(method => {
        try {
          const result = method.fn(problematicDate);
          const formatted = format(result, 'yyyy-MM-dd');
          const dayName = format(result, 'EEEE');
          
          const issues: string[] = [];
          if (formatted !== problematicDate) {
            issues.push(`Date changed from ${problematicDate} to ${formatted}`);
            potentialCauses.push(`${method.name} causes date shift`);
          }
          
          dateConversions.push({
            input: problematicDate,
            output: `${formatted} (${dayName})`,
            method: method.name,
            issues
          });
          
          console.log(`📅 ${method.name}: ${problematicDate} -> ${formatted} (${dayName})`);
          
        } catch (error) {
          dateConversions.push({
            input: problematicDate,
            output: `ERROR: ${error}`,
            method: method.name,
            issues: ['Parsing failed']
          });
        }
      });

      // Test week calculations (common source of date issues)
      const testDate = new Date('2025-06-30T12:00:00'); // Noon to avoid timezone issues
      const weekStart = startOfWeek(testDate, { weekStartsOn: 0 }); // Sunday start
      const weekEnd = endOfWeek(testDate, { weekStartsOn: 0 });
      
      weekCalculations.push({
        inputDate: format(testDate, 'yyyy-MM-dd EEEE'),
        weekStart: format(weekStart, 'yyyy-MM-dd EEEE'),
        weekEnd: format(weekEnd, 'yyyy-MM-dd EEEE'),
        weekStartDay: format(weekStart, 'EEEE'),
        weekEndDay: format(weekEnd, 'EEEE')
      });

      // Check for common timezone issues
      const timezoneOffset = testDate.getTimezoneOffset();
      if (timezoneOffset !== 0) {
        potentialCauses.push(`Timezone offset: ${timezoneOffset} minutes`);
      }

      // Check if we're in a DST transition period
      const june30 = new Date('2025-06-30T12:00:00');
      const june29 = new Date('2025-06-29T12:00:00');
      if (june30.getTimezoneOffset() !== june29.getTimezoneOffset()) {
        potentialCauses.push('DST transition between June 29-30, 2025');
      }

      setInvestigationResults({
        timezone,
        dateConversions,
        weekCalculations,
        potentialCauses
      });
    };

    investigate();
  }, []);

  return investigationResults;
}

function getTimezoneOffset(): string {
  const offset = new Date().getTimezoneOffset();
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  const sign = offset <= 0 ? '+' : '-';
  return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}