import React, { useState, useEffect } from 'react';
import { Brain, ChevronLeft, ChevronRight, Check, Mail, Shield, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';

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
  const [authStep, setAuthStep] = useState<'idle' | 'popup' | 'polling'>('idle');
  const [authStatus, setAuthStatus] = useState<{
    googleAuthenticated: boolean;
    composioConnected: boolean;
    userEmail?: string;
    userName?: string;
    isSettingUpComposio: boolean;
    isCheckingAuth: boolean;
    hasValidEmail: boolean;
    composioSkipped: boolean;
  }>({
    googleAuthenticated: false,
    composioConnected: false,
    isSettingUpComposio: false,
    isCheckingAuth: true,
    hasValidEmail: false,
    composioSkipped: false,
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



  // Helper function to validate if an email is real (not a fallback)
  const isValidRealEmail = (email: string): boolean => {
    if (!email || typeof email !== 'string') return false;
    
    // Check for common fallback patterns
    const fallbackPatterns = [
      'authenticated.user@gmail.com',
      'user@example.com',
      'test@test.com',
      'demo@demo.com',
      /^user_\d+@temp\.local$/,
      /^temp_user_\d+@/,
      /^anonymous_\d+@/,
    ];

    // Check if email matches any fallback pattern
    for (const pattern of fallbackPatterns) {
      if (typeof pattern === 'string') {
        if (email === pattern) return false;
      } else {
        if (pattern.test(email)) return false;
      }
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return false;

    // Must contain a real domain (not just localhost or temp domains)
    const domain = email.split('@')[1];
    const invalidDomains = ['temp.local', 'localhost', 'example.com', 'test.com', 'demo.com'];
    if (invalidDomains.includes(domain)) return false;

    return true;
  };

  // Check authentication status on mount and when URL changes
  useEffect(() => {
    checkAuthenticationStatus();
  }, []);

  // Also check when the component becomes visible (user returns from OAuth)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('🔍 Page became visible, checking auth status...');
        setTimeout(() => {
          checkAuthenticationStatus();
        }, 1000); // Small delay to allow tokens to be processed
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const checkAuthenticationStatus = async () => {
    console.log('🔍 Checking Composio authentication status...');
    setAuthStatus(prev => ({ ...prev, isCheckingAuth: true }));
    setAuthError(null);
    setAuthStep('idle');

    try {
      // Check if we're returning from Composio OAuth callback
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      
      if (code && state) {
        console.log('🔄 Composio OAuth callback detected, processing...');
        setIsAuthenticating(true);
        
        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Wait for the OAuth callback to be processed by Composio
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Try to find which user this callback belongs to by checking recent connections
        const storedEmail = localStorage.getItem('onboarding_user_email');
        if (storedEmail && isValidRealEmail(storedEmail)) {
          console.log(`🔍 Checking Composio connection for stored email: ${storedEmail}`);
          
          try {
            const testResult = await composioService.testUserConnection(storedEmail);
            if (testResult.success && testResult.testResult) {
              console.log('✅ Composio OAuth completed successfully');
              
              const userName = storedEmail.split('@')[0]
                .replace(/[._]/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase());
              
              setAuthStatus(prev => ({
                ...prev,
                googleAuthenticated: true,
                composioConnected: true,
                userEmail: storedEmail,
                userName,
                isCheckingAuth: false,
                hasValidEmail: true,
                composioSkipped: false,
              }));

              updateData('email', storedEmail);
              updateData('name', userName);
              
              // Clean up stored email
              localStorage.removeItem('onboarding_user_email');
              setIsAuthenticating(false);
              return;
            }
          } catch (testError) {
            console.warn('⚠️ Error testing connection after OAuth callback:', testError);
          }
        }
      }

      // If no active OAuth callback, just check current state
      setAuthStatus(prev => ({
        ...prev,
        isCheckingAuth: false,
      }));
      
    } catch (error) {
      console.error('❌ Error checking Composio authentication status:', error);
      setAuthError(error instanceof Error ? error.message : 'Authentication check failed');
      setAuthStatus(prev => ({
        ...prev,
        isCheckingAuth: false,
        hasValidEmail: false,
        composioSkipped: false,
      }));
    } finally {
      setIsAuthenticating(false);
    }
  };





  const handleStartAuthentication = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    setAuthStep('idle');
    
    try {
      const userEmail = authStatus.userEmail;
      if (!userEmail || !isValidRealEmail(userEmail)) {
        throw new Error('Please provide a valid email address first');
      }
      
      console.log(`🔗 Starting Composio OAuth flow for: ${userEmail}`);
      
      // Store email for retrieval after OAuth callback
      localStorage.setItem('onboarding_user_email', userEmail);
      
      // Use Composio OAuth flow - this will handle Google authentication internally
      const result = await composioService.setupUserConnectionWithOAuth(userEmail);
      
      if (result.success && result.redirectUrl) {
        console.log('🔗 Opening Composio OAuth in popup...');
        setAuthStep('popup');
        
        // Open Composio auth in popup
        const popup = window.open(
          result.redirectUrl,
          'composio-auth',
          'width=600,height=700,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no'
        );

        if (!popup) {
          throw new Error('Failed to open popup window. Please allow popups for this site.');
        }

        // Monitor popup and poll for connection status
        const monitorPopup = () => {
          const checkInterval = setInterval(async () => {
            try {
              if (popup.closed) {
                clearInterval(checkInterval);
                console.log('🪟 Popup closed, verifying connection...');
                setAuthStep('polling');
                
                // Wait a moment then verify connection
                setTimeout(async () => {
                  await pollForConnection(userEmail);
                }, 2000);
              }
            } catch {
              // Ignore cross-origin errors
            }
          }, 1000);

          // Timeout after 5 minutes
          setTimeout(() => {
            if (!popup.closed) {
              popup.close();
              clearInterval(checkInterval);
              setAuthError('Authentication timeout. Please try again.');
              setIsAuthenticating(false);
              setAuthStep('idle');
            }
          }, 5 * 60 * 1000);
        };

        monitorPopup();
      } else if (result.success && result.status === 'active') {
        // Already connected
        console.log('✅ Connection already active');
        setAuthStatus(prev => ({
          ...prev,
          googleAuthenticated: true,
          composioConnected: true,
          isCheckingAuth: false,
          hasValidEmail: true,
        }));
        setIsAuthenticating(false);
        setAuthStep('idle');
      } else {
        throw new Error(result.error || 'Failed to initiate Composio OAuth');
      }
    } catch (error) {
      console.error('❌ Error initiating Composio OAuth:', error);
      setAuthError(error instanceof Error ? error.message : 'Failed to initiate authentication');
      setIsAuthenticating(false);
      setAuthStep('idle');
    }
  };

  const pollForConnection = async (userEmail: string) => {
    console.log('🔍 Polling for connection status...');
    let attempts = 0;
    const maxAttempts = 30; // Poll for up to 30 seconds
    
    const pollInterval = setInterval(async () => {
      attempts++;
      
      try {
        const testResult = await composioService.testUserConnection(userEmail);
        
        if (testResult.success && testResult.testResult) {
          // Connection is active
          clearInterval(pollInterval);
          console.log('✅ Composio OAuth completed successfully');
          
          const userName = userEmail.split('@')[0]
            .replace(/[._]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
          
          setAuthStatus(prev => ({
            ...prev,
            googleAuthenticated: true,
            composioConnected: true,
            userEmail,
            userName,
            isCheckingAuth: false,
            hasValidEmail: true,
          }));

          updateData('email', userEmail);
          updateData('name', userName);
          
          // Clean up stored email
          localStorage.removeItem('onboarding_user_email');
          setIsAuthenticating(false);
          setAuthStep('idle');
          setAuthError(null);
          return;
        }
        
        if (attempts >= maxAttempts) {
          // Timeout - stop polling
          clearInterval(pollInterval);
          console.warn('⚠️ Connection polling timeout');
          setAuthError('Connection setup is taking longer than expected. Please check your Composio dashboard or try again.');
          setIsAuthenticating(false);
          setAuthStep('idle');
        }
      } catch (error) {
        console.warn(`⚠️ Polling attempt ${attempts} failed:`, error);
        
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          setAuthError('Failed to verify connection. Please try again.');
          setIsAuthenticating(false);
          setAuthStep('idle');
        }
      }
    }, 1000); // Poll every second
  };

  const handleRetryAuth = () => {
    setAuthError(null);
    setAuthStep('idle');
    checkAuthenticationStatus();
  };

  const updateData = (field: keyof OnboardingData, value: string | string[]) => {
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
        // Allow proceeding if Composio authentication is complete
        return authStatus.composioConnected && !authStatus.isCheckingAuth;
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
              Set Up Your Smart Calendar
            </h2>
            <p className="text-gray-600 text-center max-w-md mx-auto">
              Let's customize your calendar experience. You can connect to AI features later when you're ready.
            </p>
            
            <div className="max-w-md mx-auto space-y-6">
              {/* Checking Authentication Status */}
              {authStatus.isCheckingAuth && (
                <div className="p-6 border-2 border-blue-200 bg-blue-50 rounded-xl">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto">
                      <Loader2 className="h-8 w-8 text-white animate-spin" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">
                        Checking Authentication Status
                      </h3>
                      <p className="text-sm text-gray-600">
                        Verifying your Google Calendar connection...
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Email Input and Authentication Flow */}
              {!authStatus.isCheckingAuth && !authStatus.googleAuthenticated && (
                <div className="p-6 border-2 border-blue-200 bg-blue-50 rounded-xl">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto">
                      <Calendar className="h-8 w-8 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">
                        Connect Google Calendar + AI
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Enter your email and authenticate via Composio:
                      </p>
                      <ul className="text-sm text-gray-600 text-left space-y-1 mb-4">
                        <li>• Connect your Google Calendar</li>
                        <li>• Set up AI calendar management</li>
                        <li>• Enable natural language commands</li>
                        <li>• Create your personal AI assistant</li>
                      </ul>
                    </div>
                    
                    {/* Email Input */}
                    <div className="space-y-3">
                      <input
                        type="email"
                        value={authStatus.userEmail || ''}
                        onChange={(e) => {
                          const email = e.target.value;
                          setAuthStatus(prev => ({ ...prev, userEmail: email }));
                          updateData('email', email);
                          // Extract name from email for convenience
                          if (email && email.includes('@')) {
                            const name = email.split('@')[0]
                              .replace(/[._]/g, ' ')
                              .replace(/\b\w/g, l => l.toUpperCase());
                            setAuthStatus(prev => ({ ...prev, userName: name }));
                            updateData('name', name);
                          }
                        }}
                        placeholder="Enter your email address"
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                        autoFocus
                      />
                      
                      <button
                        onClick={handleStartAuthentication}
                        disabled={isAuthenticating || !authStatus.userEmail || !isValidRealEmail(authStatus.userEmail)}
                        className={`w-full flex items-center justify-center space-x-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors ${
                          (isAuthenticating || !authStatus.userEmail || !isValidRealEmail(authStatus.userEmail)) 
                            ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {isAuthenticating ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>
                              {authStep === 'popup' ? 'Opening authentication...' :
                               authStep === 'polling' ? 'Verifying connection...' :
                               'Connecting via Composio...'}
                            </span>
                          </>
                        ) : (
                          <>
                            <Shield className="h-5 w-5" />
                            <span>Connect Calendar & AI</span>
                          </>
                        )}
                      </button>
                      
                      {/* Authentication Step Indicator */}
                      {isAuthenticating && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center space-x-2 text-sm text-blue-700">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>
                              {authStep === 'popup' ? 'Complete authentication in the popup window' :
                               authStep === 'polling' ? 'Checking connection status...' :
                               'Preparing authentication...'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Authentication Success State */}
              {!authStatus.isCheckingAuth && authStatus.composioConnected && (
                <div className="space-y-4">
                  {/* Composio Authentication Success */}
                  <div className="p-4 border-2 border-green-200 bg-green-50 rounded-xl">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                        <Check className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-green-900">
                          Calendar & AI Connected
                        </p>
                        <p className="text-sm text-green-700">
                          Connected as {authStatus.userEmail} via Composio
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Success Instructions */}
                  <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-center space-x-3">
                      <Check className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-900">Ready to Continue!</p>
                        <p className="text-sm text-green-700">
                          Your calendar is connected and AI management is ready.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {authError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-red-900">Authentication Error</p>
                      <p className="text-sm text-red-700">{authError}</p>
                      <button
                        onClick={handleRetryAuth}
                        className="text-sm text-red-600 underline hover:no-underline mt-2"
                      >
                        Retry Authentication Check
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="text-xs text-gray-500 text-center space-y-1">
                <p>🔒 Secure OAuth 2.0 authentication</p>
                <p>🤖 AI-powered calendar management (when email verified)</p>
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
                <div className="mt-2 text-sm text-gray-600 text-center">
                  <p>Connected as: {data.email}</p>
                  {authStatus.hasValidEmail && (
                    <p className="text-green-600 text-xs mt-1">✓ Email verified for AI features</p>
                  )}
                  {!authStatus.hasValidEmail && authStatus.composioSkipped && (
                    <p className="text-orange-600 text-xs mt-1">⚠️ AI features limited without email verification</p>
                  )}
                </div>
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
                      <p className="text-xs text-green-600 mt-1">
                        {authStatus.hasValidEmail 
                          ? 'Google Calendar + Composio + OpenAI integration ready'
                          : 'Google Calendar integration ready (AI features limited)'
                        }
                      </p>
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