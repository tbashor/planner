import React, { useState, useEffect } from 'react';
import { Brain, ChevronLeft, ChevronRight, Check, Mail, Shield, ExternalLink, RefreshCw, Calendar, User, AlertCircle } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { googleCalendarService } from '../../services/googleCalendarService';
import composioService from '../../services/composioService';

interface OnboardingData {
  name: string;
  email: string; // Real authenticated email from Google OAuth
  workSchedule: string;
  productiveHours: string[];
  focusAreas: string[];
  dailyRoutines: string[];
  aiPreferences: string[];
  goals: string;
}

interface OnboardingWizardProps {
  onComplete: (data: OnboardingData) => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { state } = useApp();
  const [currentStep, setCurrentStep] = useState(1);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleAuthData, setGoogleAuthData] = useState<{
    isAuthenticated: boolean;
    userEmail?: string;
    userName?: string;
  }>({
    isAuthenticated: false,
  });
  const [composioStatus, setComposioStatus] = useState<{
    isConnected: boolean;
    isConnecting: boolean;
    error?: string;
    popupWindow?: Window | null;
  }>({
    isConnected: false,
    isConnecting: false,
  });
  
  const [data, setData] = useState<OnboardingData>({
    name: '',
    email: '',
    workSchedule: '',
    productiveHours: [],
    focusAreas: [],
    dailyRoutines: [],
    aiPreferences: [],
    goals: '',
  });

  const totalSteps = 8;

  // Check for OAuth callback on component mount
  useEffect(() => {
    checkForOAuthCallback();
  }, []);

  // Check Google authentication status
  useEffect(() => {
    const isGoogleAuthenticated = googleCalendarService.isAuthenticated();
    if (isGoogleAuthenticated) {
      loadGoogleUserInfo();
    }
  }, []);

  // Cleanup popup window on unmount
  useEffect(() => {
    return () => {
      if (composioStatus.popupWindow && !composioStatus.popupWindow.closed) {
        composioStatus.popupWindow.close();
      }
    };
  }, [composioStatus.popupWindow]);

  const checkForOAuthCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    if (code && state) {
      console.log('🔍 OAuth callback detected, processing...');
      setIsAuthenticating(true);
      
      try {
        // This will be handled by the OAuthCallback component
        // But we can check if we're now authenticated
        setTimeout(() => {
          const isAuthenticated = googleCalendarService.isAuthenticated();
          if (isAuthenticated) {
            loadGoogleUserInfo();
          }
          setIsAuthenticating(false);
        }, 2000);
      } catch (error) {
        console.error('❌ Error processing OAuth callback:', error);
        setAuthError('Failed to process authentication');
        setIsAuthenticating(false);
      }
    }
  };

  const loadGoogleUserInfo = async () => {
    try {
      const userEmail = await googleCalendarService.getAuthenticatedUserEmail();
      if (userEmail) {
        console.log('✅ Google user authenticated:', userEmail);
        
        // Extract name from email (simple approach)
        const userName = userEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        setGoogleAuthData({
          isAuthenticated: true,
          userEmail,
          userName,
        });
        
        // Update form data
        updateData('email', userEmail);
        updateData('name', userName);
      }
    } catch (error) {
      console.error('❌ Error loading Google user info:', error);
      setAuthError('Failed to load user information');
    }
  };

  const handleGoogleSignIn = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    
    try {
      const authUrl = await googleCalendarService.getAuthUrl();
      console.log('🔗 Redirecting to Google OAuth...');
      window.location.href = authUrl;
    } catch (error) {
      console.error('❌ Error initiating Google sign-in:', error);
      setAuthError('Failed to initiate Google sign-in');
      setIsAuthenticating(false);
    }
  };

  const handleComposioConnection = async () => {
    if (!googleAuthData.userEmail) {
      setAuthError('Please authenticate with Google first');
      return;
    }

    setComposioStatus(prev => ({ ...prev, isConnecting: true, error: undefined }));
    setAuthError(null);

    try {
      console.log('🔗 Setting up Composio connection for:', googleAuthData.userEmail);
      
      const result = await composioService.setupUserConnection(googleAuthData.userEmail);
      
      if (result.success && result.redirectUrl) {
        console.log('🪟 Opening Composio authentication in popup...');
        
        // Open popup window
        const popup = window.open(
          result.redirectUrl,
          'composio-auth',
          'width=600,height=700,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no'
        );

        if (!popup) {
          throw new Error('Failed to open popup window. Please allow popups for this site.');
        }

        setComposioStatus(prev => ({ 
          ...prev, 
          popupWindow: popup,
          isConnecting: true 
        }));

        // Monitor popup window
        const checkPopup = setInterval(async () => {
          try {
            // Check if popup is closed
            if (popup.closed) {
              clearInterval(checkPopup);
              console.log('🪟 Popup window closed, checking connection status...');
              
              // Wait a moment for any background processing
              setTimeout(async () => {
                await checkComposioConnectionStatus();
              }, 2000);
            }
          } catch (error) {
            // Popup might be on different domain, ignore cross-origin errors
            console.log('Popup monitoring error (expected):', error);
          }
        }, 1000);

        // Timeout after 5 minutes
        setTimeout(() => {
          if (!popup.closed) {
            popup.close();
            clearInterval(checkPopup);
            setComposioStatus(prev => ({ 
              ...prev, 
              isConnecting: false,
              error: 'Authentication timeout. Please try again.',
              popupWindow: null
            }));
          }
        }, 5 * 60 * 1000);

      } else if (result.success && !result.redirectUrl) {
        // Connection already exists
        console.log('✅ Composio connection already active');
        setComposioStatus({ isConnected: true, isConnecting: false });
      } else {
        throw new Error(result.error || 'Failed to setup Composio connection');
      }
    } catch (error) {
      console.error('❌ Error setting up Composio connection:', error);
      setComposioStatus({ 
        isConnected: false, 
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      });
    }
  };

  const checkComposioConnectionStatus = async () => {
    if (!googleAuthData.userEmail) return;

    try {
      console.log('🔍 Checking Composio connection status...');
      
      const testResult = await composioService.testUserConnection(googleAuthData.userEmail);
      
      if (testResult.success && testResult.testResult) {
        console.log('✅ Composio connection verified!');
        setComposioStatus({ 
          isConnected: true, 
          isConnecting: false,
          popupWindow: null
        });
        setAuthError(null);
      } else {
        console.warn('❌ Composio connection not ready:', testResult.error);
        setComposioStatus({ 
          isConnected: false, 
          isConnecting: false,
          error: 'Connection not completed. Please try again.',
          popupWindow: null
        });
      }
    } catch (error) {
      console.error('❌ Error checking Composio connection:', error);
      setComposioStatus({ 
        isConnected: false, 
        isConnecting: false,
        error: 'Failed to verify connection',
        popupWindow: null
      });
    }
  };

  const updateData = (field: keyof OnboardingData, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const toggleArrayItem = (field: keyof OnboardingData, value: string) => {
    const currentArray = data[field] as string[];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    updateData(field, newArray);
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete(data);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return googleAuthData.isAuthenticated && composioStatus.isConnected;
      case 2:
        return data.name.trim().length > 0;
      case 3:
        return data.workSchedule.length > 0;
      case 4:
        return data.productiveHours.length > 0;
      case 5:
        return data.focusAreas.length > 0;
      case 6:
        return true; // Optional step
      case 7:
        return data.aiPreferences.length > 0;
      case 8:
        return true; // Optional step
      default:
        return true;
    }
  };

  const getProgressWidth = () => {
    return (currentStep / totalSteps) * 100;
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-8">
            <h2 className="text-3xl font-bold text-gray-900 text-center">
              Connect Your Accounts
            </h2>
            <p className="text-gray-600 text-center max-w-md mx-auto">
              First, we'll connect your Google Calendar, then set up AI-powered calendar management through Composio.
            </p>
            
            <div className="max-w-md mx-auto space-y-6">
              {/* Google Authentication */}
              <div className={`p-4 border-2 rounded-xl transition-all ${
                googleAuthData.isAuthenticated 
                  ? 'border-green-200 bg-green-50' 
                  : 'border-gray-200 bg-white'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    googleAuthData.isAuthenticated 
                      ? 'bg-green-500' 
                      : 'bg-blue-500'
                  }`}>
                    {googleAuthData.isAuthenticated ? (
                      <Check className="h-6 w-6 text-white" />
                    ) : (
                      <Calendar className="h-6 w-6 text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {googleAuthData.isAuthenticated ? 'Google Calendar Connected' : 'Connect Google Calendar'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {googleAuthData.isAuthenticated 
                        ? `Connected as ${googleAuthData.userEmail}`
                        : 'Required for calendar access'
                      }
                    </p>
                  </div>
                  {!googleAuthData.isAuthenticated && (
                    <button
                      onClick={handleGoogleSignIn}
                      disabled={isAuthenticating}
                      className={`px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors ${
                        isAuthenticating ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {isAuthenticating ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>

              {/* Composio Authentication */}
              <div className={`p-4 border-2 rounded-xl transition-all ${
                composioStatus.isConnected 
                  ? 'border-green-200 bg-green-50' 
                  : googleAuthData.isAuthenticated
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-gray-50 opacity-50'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    composioStatus.isConnected 
                      ? 'bg-green-500' 
                      : composioStatus.isConnecting
                        ? 'bg-blue-500'
                        : 'bg-gray-400'
                  }`}>
                    {composioStatus.isConnected ? (
                      <Check className="h-6 w-6 text-white" />
                    ) : composioStatus.isConnecting ? (
                      <RefreshCw className="h-6 w-6 text-white animate-spin" />
                    ) : (
                      <Brain className="h-6 w-6 text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {composioStatus.isConnected 
                        ? 'AI Calendar Management Ready' 
                        : 'Connect AI Calendar Management'
                      }
                    </p>
                    <p className="text-sm text-gray-600">
                      {composioStatus.isConnected 
                        ? 'Composio + OpenAI integration active'
                        : composioStatus.isConnecting
                          ? 'Setting up AI integration...'
                          : 'Enables AI-powered calendar operations'
                      }
                    </p>
                  </div>
                  {googleAuthData.isAuthenticated && !composioStatus.isConnected && (
                    <button
                      onClick={handleComposioConnection}
                      disabled={composioStatus.isConnecting}
                      className={`px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors ${
                        composioStatus.isConnecting ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {composioStatus.isConnecting ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>

              {/* Error Display */}
              {(authError || composioStatus.error) && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-red-900">Connection Error</p>
                      <p className="text-sm text-red-700">
                        {authError || composioStatus.error}
                      </p>
                      {composioStatus.error && (
                        <button
                          onClick={() => setComposioStatus(prev => ({ ...prev, error: undefined }))}
                          className="text-sm text-red-600 underline hover:no-underline mt-1"
                        >
                          Try again
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Success State */}
              {googleAuthData.isAuthenticated && composioStatus.isConnected && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <Check className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900">All Set!</p>
                      <p className="text-sm text-green-700">
                        Your accounts are connected and AI calendar management is ready.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="text-xs text-gray-500 text-center space-y-1">
                <p>🔒 Secure OAuth 2.0 authentication with Google</p>
                <p>🤖 AI-powered calendar management via Composio + OpenAI</p>
                <p>👤 Personal AI assistant with isolated data</p>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-8">
            <h2 className="text-3xl font-bold text-gray-900 text-center">
              What should I call you?
            </h2>
            <div className="max-w-md mx-auto">
              <input
                type="text"
                value={data.name}
                onChange={(e) => updateData('name', e.target.value)}
                placeholder="Enter your name"
                className="w-full px-6 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                autoFocus
              />
              {data.email && (
                <p className="mt-2 text-sm text-gray-600 text-center">
                  Connected as: {data.email}
                </p>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-8">
            <h2 className="text-3xl font-bold text-gray-900 text-center">
              When do you typically work or study?
            </h2>
            <div className="space-y-4 max-w-lg mx-auto">
              {[
                { id: 'morning', label: 'Morning person (6AM - 12PM)' },
                { id: 'afternoon', label: 'Afternoon focus (12PM - 6PM)' },
                { id: 'evening', label: 'Evening warrior (6PM - 12AM)' },
                { id: 'flexible', label: 'Flexible schedule' },
              ].map((option) => (
                <label
                  key={option.id}
                  className={`flex items-center space-x-4 p-4 border-2 rounded-xl cursor-pointer transition-all hover:bg-gray-50 ${
                    data.workSchedule === option.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    data.workSchedule === option.id
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}>
                    {data.workSchedule === option.id && (
                      <div className="w-3 h-3 bg-white rounded-full" />
                    )}
                  </div>
                  <span className="text-lg text-gray-900">{option.label}</span>
                  <input
                    type="radio"
                    name="workSchedule"
                    value={option.id}
                    checked={data.workSchedule === option.id}
                    onChange={(e) => updateData('workSchedule', e.target.value)}
                    className="sr-only"
                  />
                </label>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-8">
            <h2 className="text-3xl font-bold text-gray-900 text-center">
              When do you feel most productive?
            </h2>
            <p className="text-gray-600 text-center">Select all that apply</p>
            <div className="space-y-4 max-w-lg mx-auto">
              {[
                { id: 'early-morning', label: 'Early morning (6-9 AM)' },
                { id: 'mid-morning', label: 'Mid morning (9-12 PM)' },
                { id: 'afternoon', label: 'Afternoon (12-3 PM)' },
                { id: 'late-afternoon', label: 'Late afternoon (3-6 PM)' },
                { id: 'evening', label: 'Evening (6-9 PM)' },
              ].map((option) => (
                <label
                  key={option.id}
                  className={`flex items-center space-x-4 p-4 border-2 rounded-xl cursor-pointer transition-all hover:bg-gray-50 ${
                    data.productiveHours.includes(option.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                    data.productiveHours.includes(option.id)
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}>
                    {data.productiveHours.includes(option.id) && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <span className="text-lg text-gray-900">{option.label}</span>
                  <input
                    type="checkbox"
                    checked={data.productiveHours.includes(option.id)}
                    onChange={() => toggleArrayItem('productiveHours', option.id)}
                    className="sr-only"
                  />
                </label>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-8">
            <h2 className="text-3xl font-bold text-gray-900 text-center">
              What are your main focus areas?
            </h2>
            <p className="text-gray-600 text-center">Select all that apply</p>
            <div className="space-y-4 max-w-lg mx-auto">
              {[
                { id: 'work-career', label: 'Work/Career' },
                { id: 'learning-education', label: 'Learning/Education' },
                { id: 'health-fitness', label: 'Health & Fitness' },
                { id: 'relationships', label: 'Relationships' },
                { id: 'hobbies-interests', label: 'Hobbies & Interests' },
                { id: 'self-care', label: 'Self-care' },
              ].map((option) => (
                <label
                  key={option.id}
                  className={`flex items-center space-x-4 p-4 border-2 rounded-xl cursor-pointer transition-all hover:bg-gray-50 ${
                    data.focusAreas.includes(option.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                    data.focusAreas.includes(option.id)
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}>
                    {data.focusAreas.includes(option.id) && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <span className="text-lg text-gray-900">{option.label}</span>
                  <input
                    type="checkbox"
                    checked={data.focusAreas.includes(option.id)}
                    onChange={() => toggleArrayItem('focusAreas', option.id)}
                    className="sr-only"
                  />
                </label>
              ))}
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-8">
            <h2 className="text-3xl font-bold text-gray-900 text-center">
              Do you have regular daily routines?
            </h2>
            <p className="text-gray-600 text-center">Select all that apply</p>
            <div className="space-y-4 max-w-lg mx-auto">
              {[
                { id: 'breakfast', label: 'Breakfast (fixed time)' },
                { id: 'lunch', label: 'Lunch (fixed time)' },
                { id: 'dinner', label: 'Dinner (fixed time)' },
                { id: 'exercise', label: 'Exercise routine' },
                { id: 'commute', label: 'Commute times' },
              ].map((option) => (
                <label
                  key={option.id}
                  className={`flex items-center space-x-4 p-4 border-2 rounded-xl cursor-pointer transition-all hover:bg-gray-50 ${
                    data.dailyRoutines.includes(option.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                    data.dailyRoutines.includes(option.id)
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}>
                    {data.dailyRoutines.includes(option.id) && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <span className="text-lg text-gray-900">{option.label}</span>
                  <input
                    type="checkbox"
                    checked={data.dailyRoutines.includes(option.id)}
                    onChange={() => toggleArrayItem('dailyRoutines', option.id)}
                    className="sr-only"
                  />
                </label>
              ))}
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-8">
            <h2 className="text-3xl font-bold text-gray-900 text-center">
              How would you like AI to help you?
            </h2>
            <p className="text-gray-600 text-center">Select all that apply</p>
            <div className="space-y-4 max-w-lg mx-auto">
              {[
                { id: 'smart-scheduling', label: 'Smart scheduling suggestions' },
                { id: 'intelligent-reminders', label: 'Intelligent reminders' },
                { id: 'motivational-feedback', label: 'Motivational feedback' },
                { id: 'schedule-optimization', label: 'Schedule optimization' },
              ].map((option) => (
                <label
                  key={option.id}
                  className={`flex items-center space-x-4 p-4 border-2 rounded-xl cursor-pointer transition-all hover:bg-gray-50 ${
                    data.aiPreferences.includes(option.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                    data.aiPreferences.includes(option.id)
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}>
                    {data.aiPreferences.includes(option.id) && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <span className="text-lg text-gray-900">{option.label}</span>
                  <input
                    type="checkbox"
                    checked={data.aiPreferences.includes(option.id)}
                    onChange={() => toggleArrayItem('aiPreferences', option.id)}
                    className="sr-only"
                  />
                </label>
              ))}
            </div>
          </div>
        );

      case 8:
        return (
          <div className="space-y-8">
            <h2 className="text-3xl font-bold text-gray-900 text-center">
              What are your main goals?
            </h2>
            <p className="text-gray-600 text-center">Tell me what you'd like to achieve (optional)</p>
            <div className="max-w-lg mx-auto">
              <textarea
                value={data.goals}
                onChange={(e) => updateData('goals', e.target.value)}
                placeholder="e.g., Improve work-life balance, learn new skills, stay consistent with exercise..."
                rows={4}
                className="w-full px-6 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors resize-none"
              />
              {data.email && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <Mail className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900">Ready to get started!</p>
                      <p className="text-sm text-green-700">Your AI assistant will be personalized for {data.email}</p>
                      <p className="text-xs text-green-600 mt-1">Google Calendar + Composio + OpenAI integration ready</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${
      state.isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      <div className={`w-full max-w-2xl rounded-2xl shadow-xl p-8 ${
        state.isDarkMode ? 'bg-gray-800' : 'bg-white'
      }`}>
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Brain className="w-10 h-10 text-white" />
          </div>
          <h1 className={`text-4xl font-bold mb-4 ${
            state.isDarkMode ? 'text-white' : 'text-blue-600'
          }`}>
            Let's personalize your experience
          </h1>
          <p className={`text-lg ${
            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            Step {currentStep} of {totalSteps}
          </p>
        </div>

        {/* Progress Bar */}
        <div className={`w-full h-3 rounded-full mb-12 ${
          state.isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
        }`}>
          <div
            className="h-full bg-gradient-to-r from-green-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${getProgressWidth()}%` }}
          />
        </div>

        {/* Step Content */}
        <div className="mb-12">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <button
            onClick={prevStep}
            disabled={currentStep === 1}
            className={`flex items-center space-x-2 px-6 py-3 rounded-xl font-medium transition-all ${
              currentStep === 1
                ? 'opacity-50 cursor-not-allowed'
                : state.isDarkMode
                ? 'text-gray-300 hover:bg-gray-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Previous</span>
          </button>

          <button
            onClick={nextStep}
            disabled={!canProceed()}
            className={`flex items-center space-x-2 px-8 py-3 rounded-xl font-medium transition-all ${
              canProceed()
                ? 'bg-gradient-to-r from-green-500 to-blue-600 text-white hover:from-green-600 hover:to-blue-700 shadow-lg'
                : 'opacity-50 cursor-not-allowed bg-gray-300 text-gray-500'
            }`}
          >
            <span>{currentStep === totalSteps ? 'Complete' : 'Next'}</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}