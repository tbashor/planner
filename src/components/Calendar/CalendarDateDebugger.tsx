import React, { useEffect, useState } from 'react';
import { AlertTriangle, Calendar, Clock, MapPin } from 'lucide-react';
import { useCalendarDateInvestigation } from '../../hooks/useCalendarDateInvestigation';
import { useApp } from '../../contexts/AppContext';
import { DateTimeDebugger } from '../../utils/dateTimeDebugger';

interface CalendarDateDebuggerProps {
  isVisible: boolean;
  onClose: () => void;
}

export default function CalendarDateDebugger({ isVisible, onClose }: CalendarDateDebuggerProps) {
  const { state } = useApp();
  const investigation = useCalendarDateInvestigation();
  const [eventAnalysis, setEventAnalysis] = useState<any[]>([]);

  useEffect(() => {
    if (isVisible && state.events.length > 0) {
      // Analyze current events for date issues
      const analysis = state.events.map(event => {
        const debugInfo = DateTimeDebugger.debugDateTime(
          `${event.date}T${event.startTime}:00`,
          `Event: ${event.title}`
        );
        
        return {
          event,
          debugInfo,
          hasIssues: debugInfo.potentialIssues.length > 0
        };
      });
      
      setEventAnalysis(analysis);
    }
  }, [isVisible, state.events]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className={`w-full max-w-4xl rounded-xl shadow-2xl ${
          state.isDarkMode ? 'bg-gray-800' : 'bg-white'
        }`}>
          {/* Header */}
          <div className={`p-6 border-b ${
            state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="h-6 w-6 text-red-500" />
                <div>
                  <h2 className={`text-xl font-semibold ${
                    state.isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Calendar Date Investigation
                  </h2>
                  <p className={`text-sm ${
                    state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Debugging June 30, 2025 → June 29, 2025 date misalignment
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className={`p-2 rounded-lg ${
                  state.isDarkMode
                    ? 'text-gray-400 hover:bg-gray-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                ×
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 max-h-96 overflow-y-auto">
            {/* Timezone Info */}
            <div className="mb-6">
              <h3 className={`text-lg font-medium mb-3 ${
                state.isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Environment Information
              </h3>
              <div className={`p-4 rounded-lg ${
                state.isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
              }`}>
                <p className={`text-sm ${
                  state.isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  <strong>User Timezone:</strong> {investigation?.timezone || 'Loading...'}
                </p>
                <p className={`text-sm ${
                  state.isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  <strong>Current Date:</strong> {new Date().toLocaleString()}
                </p>
                <p className={`text-sm ${
                  state.isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  <strong>Timezone Offset:</strong> {new Date().getTimezoneOffset()} minutes
                </p>
              </div>
            </div>

            {/* Date Conversion Tests */}
            {investigation?.dateConversions && (
              <div className="mb-6">
                <h3 className={`text-lg font-medium mb-3 ${
                  state.isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Date Parsing Tests (2025-06-30)
                </h3>
                <div className="space-y-2">
                  {investigation.dateConversions.map((test, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        test.issues.length > 0
                          ? state.isDarkMode
                            ? 'border-red-600 bg-red-900/20'
                            : 'border-red-300 bg-red-50'
                          : state.isDarkMode
                          ? 'border-gray-600 bg-gray-700'
                          : 'border-gray-300 bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className={`font-medium ${
                            state.isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            {test.method}
                          </p>
                          <p className={`text-sm ${
                            state.isDarkMode ? 'text-gray-300' : 'text-gray-600'
                          }`}>
                            Result: {test.output}
                          </p>
                        </div>
                        {test.issues.length > 0 && (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      {test.issues.length > 0 && (
                        <div className="mt-2">
                          {test.issues.map((issue, issueIndex) => (
                            <p
                              key={issueIndex}
                              className={`text-xs ${
                                state.isDarkMode ? 'text-red-400' : 'text-red-600'
                              }`}
                            >
                              ⚠️ {issue}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Potential Causes */}
            {investigation?.potentialCauses && investigation.potentialCauses.length > 0 && (
              <div className="mb-6">
                <h3 className={`text-lg font-medium mb-3 ${
                  state.isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Potential Root Causes
                </h3>
                <div className={`p-4 rounded-lg border-l-4 border-red-500 ${
                  state.isDarkMode ? 'bg-red-900/20' : 'bg-red-50'
                }`}>
                  <ul className="space-y-1">
                    {investigation.potentialCauses.map((cause, index) => (
                      <li
                        key={index}
                        className={`text-sm ${
                          state.isDarkMode ? 'text-red-400' : 'text-red-700'
                        }`}
                      >
                        • {cause}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Current Events Analysis */}
            {eventAnalysis.length > 0 && (
              <div>
                <h3 className={`text-lg font-medium mb-3 ${
                  state.isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Current Events Analysis
                </h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {eventAnalysis.map((analysis, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg ${
                        analysis.hasIssues
                          ? state.isDarkMode
                            ? 'bg-yellow-900/20 border border-yellow-600'
                            : 'bg-yellow-50 border border-yellow-300'
                          : state.isDarkMode
                          ? 'bg-gray-700'
                          : 'bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`font-medium ${
                            state.isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            {analysis.event.title}
                          </p>
                          <p className={`text-sm ${
                            state.isDarkMode ? 'text-gray-300' : 'text-gray-600'
                          }`}>
                            {analysis.event.date} at {analysis.event.startTime}
                          </p>
                        </div>
                        {analysis.hasIssues && (
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        )}
                      </div>
                      {analysis.hasIssues && (
                        <div className="mt-2">
                          {analysis.debugInfo.potentialIssues.map((issue: string, issueIndex: number) => (
                            <p
                              key={issueIndex}
                              className={`text-xs ${
                                state.isDarkMode ? 'text-yellow-400' : 'text-yellow-700'
                              }`}
                            >
                              ⚠️ {issue}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`p-6 border-t ${
            state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <div className="flex justify-between items-center">
              <p className={`text-sm ${
                state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Investigation completed. Check console for detailed logs.
              </p>
              <button
                onClick={onClose}
                className={`px-4 py-2 rounded-lg ${
                  state.isDarkMode
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}