import React, { useState, useEffect } from 'react';
import { Brain, ChevronLeft, ChevronRight, Check, Mail, Shield, ExternalLink, RefreshCw } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import composioService from '../../services/composioService';

interface OnboardingData {
  name: string;
  email: string; // Real authenticated email from Composio
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
  const [isSettingUpConnection, setIsSettingUpConnection] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [connectionData, setConnectionData] = useState<any>(null);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    name: '',
    email: '', // Will be set from Composio authentication
    workSchedule: '',
    productiveHours: [],
    focusAreas: [],
    dailyRoutines: [],
    aiPreferences: [],
    goals: '',
  });

  const totalSteps = 8; // Added authentication step

  // Check if we're returning from Composio authentication
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const composioCallback = urlParams.get('composio_callback');
    const userEmail = urlParams.get('user_email');
    
    if (composioCallback === 'success' && userEmail) {
      console.log('🎉 Returned from Composio authentication for:', userEmail);
      setConnectionData({ status: 'active', userEmail });
      updateData('email', userEmail);
      
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

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

  const handleSetupComposioConnection = async () => {
    // Generate a temporary user email for initial setup
    const tempEmail = `user_${Date.now()}@temp.local`;
    
    setIsSettingUpConnection(true);
    setAuthError(null);

    try {
      console.log('🔗 Setting up Composio connection for temporary user:', tempEmail);
      
      const result = await composioService.setupUserConnection(tempEmail);
      
      if (result.success && result.redirectUrl) {
        console.log('🔗 Composio connection setup successful, redirecting to:', result.redirectUrl);
        
        // Add callback parameters to the redirect URL
        const callbackUrl = new URL(result.redirectUrl);
        const currentUrl = new URL(window.location.href);
        
        // Set up return URL with callback parameters
        const returnUrl = `${currentUrl.origin}${currentUrl.pathname}?composio_callback=success&user_email=${tempEmail}`;
        
        // Store connection data
        setConnectionData({
          entityId: result.entityId,
          connectionId: result.connectionId,
          status: 'pending',
          userEmail: tempEmail
        });
        
        console.log('🔄 Redirecting to Composio authentication...');
        
        // Redirect to Composio authentication (no popup)
        window.location.href = result.redirectUrl;
      } else {
        throw new Error(result.error || 'Failed to setup Composio connection');
      }
    } catch (error) {
      console.error('❌ Error setting up Composio connection:', error);
      setAuthError(error instanceof Error ? error.message : 'Failed to setup connection');
      setIsSettingUpConnection(false);
    }
  };

  const handleCheckConnection = async () => {
    if (!connectionData?.userEmail) return;

    setIsCheckingConnection(true);
    setAuthError(null);

    try {
      console.log('🔍 Checking connection status for:', connectionData.userEmail);
      
      const testResult = await composioService.testUserConnection(connectionData.userEmail);
      
      if (testResult.success && testResult.testResult) {
        console.log('✅ Connection verified for:', connectionData.userEmail);
        
        // Update connection data with verified status
        setConnectionData(prev => ({
          ...prev,
          status: 'active',
          verified: true
        }));
        
        // Update the email in our data
        updateData('email', connectionData.userEmail);
        
        setAuthError(null);
      } else {
        console.warn('❌ Connection verification failed:', testResult.error);
        setAuthError(testResult.error || 'Connection verification failed');
      }
    } catch (error) {
      console.error('❌ Error checking connection:', error);
      setAuthError(error instanceof Error ? error.message : 'Failed to check connection');
    } finally {
      setIsCheckingConnection(false);
    }
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
        return connectionData?.status === 'active' && data.email; // Must have active Composio connection
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
              Connect Your Google Calendar
            </h2>
            <p className="text-gray-600 text-center max-w-md mx-auto">
              To provide personalized AI calendar management, we'll connect to your Google Calendar through Composio.
            </p>
            
            {connectionData?.status === 'active' ? (
              <div className="max-w-md mx-auto">
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                      <Check className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-green-900">Successfully Connected!</p>
                      <p className="text-sm text-green-700">Composio Entity: {connectionData.userEmail}</p>
                      <p className="text-xs text-green-600 mt-1">Your Google Calendar is now connected via Composio</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : connectionData?.status === 'pending' ? (
              <div className="max-w-md mx-auto space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                      <RefreshCw className="h-6 w-6 text-white animate-spin" />
                    </div>
                    <div>
                      <p className="font-medium text-blue-900">Connection Pending</p>
                      <p className="text-sm text-blue-700">Please complete Google Calendar authentication</p>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={handleCheckConnection}
                  disabled={isCheckingConnection}
                  className={`w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors ${
                    isCheckingConnection ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <RefreshCw className={`h-4 w-4 ${isCheckingConnection ? 'animate-spin' : ''}`} />
                  <span>{isCheckingConnection ? 'Checking...' : 'Check Connection Status'}</span>
                </button>
              </div>
            ) : (
              <div className="max-w-md mx-auto space-y-4">
                {authError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-white text-sm">!</span>
                      </div>
                      <div>
                        <p className="font-medium text-red-900">Connection Error</p>
                        <p className="text-sm text-red-700">{authError}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                <button
                  onClick={handleSetupComposioConnection}
                  disabled={isSettingUpConnection}
                  className={`w-full flex items-center justify-center space-x-3 px-6 py-4 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all ${
                    isSettingUpConnection ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    {isSettingUpConnection ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Shield className="h-4 w-4 text-white" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900">
                      {isSettingUpConnection ? 'Setting up...' : 'Connect via Composio'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {isSettingUpConnection ? 'Preparing your connection...' : 'Secure Google Calendar integration'}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-gray-400" />
                </button>
                
                <div className="text-xs text-gray-500 text-center space-y-1">
                  <p>🔒 Powered by Composio for secure Google Calendar access</p>
                  <p>🤖 Enables AI-powered calendar management with OpenAI</p>
                  <p>👤 Each user gets their own isolated Composio entity</p>
                </div>
              </div>
            )}
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
                  Connected via Composio: {data.email}
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
                      <p className="text-xs text-green-600 mt-1">Powered by Composio + OpenAI integration</p>
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