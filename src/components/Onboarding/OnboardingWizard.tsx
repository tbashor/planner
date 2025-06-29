import React, { useState, useEffect } from 'react';
import { Brain, ChevronLeft, ChevronRight, Check, Mail, Shield, Calendar, AlertCircle, Loader2, Server } from 'lucide-react';
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
  const [serverStatus, setServerStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
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

  // Check server availability on mount
  useEffect(() => {
    checkServerAvailability();
  }, []);

  // Check authentication status on mount and when URL changes
  useEffect(() => {
    if (serverStatus === 'available') {
      checkAuthenticationStatus();
    }
  }, [serverStatus]);

  // Check for Composio OAuth callback on mount
  useEffect(() => {
    checkForComposioCallback();
  }, []);

  // Also check when the component becomes visible (user returns from OAuth)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && serverStatus === 'available') {
        console.log('🔍 Page became visible, checking auth status...');
        setTimeout(() => {
          checkAuthenticationStatus();
        }, 1000); // Small delay to allow tokens to be processed
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [serverStatus]);

  const checkServerAvailability = async () => {
    console.log('🔍 Checking server availability...');
    setServerStatus('checking');
    
    try {
      const isAvailable = await composioService.isServerAvailable();
      setServerStatus(isAvailable ? 'available' : 'unavailable');
      
      if (!isAvailable) {
        setAuthError('Backend server is not running. Please start the server with "npm run dev" to enable AI features.');
      }
    } catch (error) {
      console.error('❌ Error checking server availability:', error);
      setServerStatus('unavailable');
      setAuthError('Cannot connect to backend server. Please ensure the server is running on port 3001.');
    }
  };

  const checkForComposioCallback = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const composioSuccess = urlParams.get('composio_success');
    const composioError = urlParams.get('composio_error');
    const userEmail = urlParams.get('user');

    // Check for Composio OAuth callback
    if (composioSuccess === 'true' && userEmail) {
      console.log('✅ Composio OAuth callback detected for:', userEmail);
      handleComposioOAuthSuccess(userEmail);
      return;
    }

    if (composioError) {
      console.error('❌ Composio OAuth error:', composioError);
      setAuthError(`Authentication failed: ${composioError}`);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    // Check for generic OAuth callback (might be Composio)
    if (code && state) {
      console.log('🔄 OAuth callback detected, checking if it\'s Composio...');
      const storedEmail = localStorage.getItem('onboarding_user_email');
      if (storedEmail) {
        console.log('📧 Found stored email for OAuth callback:', storedEmail);
        // Wait a moment for the server to process the callback
        setTimeout(() => {
          checkAuthenticationStatus();
        }, 2000);
      }
    }
  };

  const handleComposioOAuthSuccess = async (userEmail: string) => {
    console.log('🎉 Processing Composio OAuth success for:', userEmail);
    setIsAuthenticating(true);
    
    try {
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Generate user name from email
      const userName = userEmail.split('@')[0]
        .replace(/[._]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
      
      // Update auth status
      setAuthStatus(prev => ({
        ...prev,
        googleAuthenticated: true,
        composioConnected: true,
        userEmail,
        userName,
        isCheckingAuth: false,
        hasValidEmail: true,
        composioSkipped: false,
      }));

      // Update form data
      updateData('email', userEmail);
      updateData('name', userName);
      
      // Clean up stored email
      localStorage.removeItem('onboarding_user_email');
      
      setAuthError(null);
      console.log('✅ Composio OAuth processing completed successfully');
      
    } catch (error) {
      console.error('❌ Error processing Composio OAuth success:', error);
      setAuthError('Failed to complete authentication setup. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const checkAuthenticationStatus = async () => {
    if (serverStatus !== 'available') {
      console.log('⚠️ Skipping auth check - server not available');
      return;
    }

    console.log('🔍 Checking Composio authentication status...');
    setAuthStatus(prev => ({ ...prev, isCheckingAuth: true }));
    setAuthError(null);

    try {
      // Check if we have a stored email from a previous attempt
      const storedEmail = localStorage.getItem('onboarding_user_email');
      if (storedEmail && isValidRealEmail(storedEmail)) {
        console.log(`🔍 Checking Composio connection for stored email: ${storedEmail}`);
        
        try {
          const testResult = await composioService.testUserConnection(storedEmail);
          if (testResult.success && testResult.testResult) {
            console.log('✅ Found active Composio connection');
            
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
            return;
          }
        } catch (testError) {
          console.warn('⚠️ Error testing stored connection:', testError);
        }
      }

      // No active connection found
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
    }
  };

  const handleOAuthPopup = async (oauthUrl: string, userEmail: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      console.log('🪟 Opening OAuth popup window...');
      
      // Calculate popup window dimensions and position
      const width = 600;
      const height = 700;
      const left = (window.innerWidth - width) / 2 + window.screenX;
      const top = (window.innerHeight - height) / 2 + window.screenY;
      
      // Open popup window
      const popup = window.open(
        oauthUrl,
        'composio-oauth',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
      );

      if (!popup) {
        reject(new Error('Popup window was blocked. Please allow popups for this site and try again.'));
        return;
      }

      // Poll for popup completion
      let attempts = 0;
      const maxAttempts = 120; // 2 minutes at 1-second intervals
      
      const pollInterval = setInterval(async () => {
        attempts++;
        
        try {
          // Check if popup is closed
          if (popup.closed) {
            clearInterval(pollInterval);
            console.log('🚪 OAuth popup was closed by user');
            reject(new Error('Authentication was cancelled'));
            return;
          }

          // Try to check popup URL (will throw if cross-origin)
          try {
            const popupUrl = popup.location.href;
            
            // Check for success callback
            if (popupUrl.includes('composio_success=true')) {
              const urlParams = new URLSearchParams(new URL(popupUrl).search);
              const returnedEmail = urlParams.get('user');
              
              console.log('✅ OAuth popup completed successfully for:', returnedEmail);
              clearInterval(pollInterval);
              popup.close();
              
              // Process the successful OAuth
              await handleComposioOAuthSuccess(returnedEmail || userEmail);
              resolve();
              return;
            }
            
            // Check for error callback
            if (popupUrl.includes('composio_error')) {
              const urlParams = new URLSearchParams(new URL(popupUrl).search);
              const error = urlParams.get('composio_error');
              
              console.error('❌ OAuth popup error:', error);
              clearInterval(pollInterval);
              popup.close();
              reject(new Error(error || 'Authentication failed'));
              return;
            }
            
          } catch {
            // Cross-origin error is expected while OAuth is in progress
            // Continue polling
          }

          // Timeout check
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            popup.close();
            console.error('⏰ OAuth popup timed out');
            reject(new Error('Authentication timed out. Please try again.'));
            return;
          }
          
        } catch (error) {
          console.warn('⚠️ Error during OAuth polling:', error);
        }
      }, 1000); // Poll every second
    });
  };

  const handleStartAuthentication = async () => {
    if (serverStatus !== 'available') {
      setAuthError('Backend server is not available. Please start the server with "npm run dev" to enable authentication.');
      return;
    }

    setIsAuthenticating(true);
    setAuthError(null);
    
    try {
      const userEmail = authStatus.userEmail;
      if (!userEmail || !isValidRealEmail(userEmail)) {
        throw new Error('Please provide a valid email address first');
      }
      
      console.log(`🔗 Starting Composio OAuth flow for: ${userEmail}`);
      
      // Store email for retrieval after OAuth callback
      localStorage.setItem('onboarding_user_email', userEmail);
      
      // Get the redirect URL for Composio OAuth
      const redirectUrl = `${window.location.origin}/oauth/callback`;
      
      // Use Composio OAuth flow with popup window
      const result = await composioService.setupUserConnectionWithOAuth(userEmail, redirectUrl);
      
      if (result.success && result.redirectUrl) {
        console.log('🔗 Opening Composio OAuth popup...');
        
        // Open OAuth in popup window
        await handleOAuthPopup(result.redirectUrl, userEmail);
        setIsAuthenticating(false);
        
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
      } else {
        throw new Error(result.error || 'Failed to initiate Composio OAuth');
      }
    } catch (error) {
      console.error('❌ Error initiating Composio OAuth:', error);
      
      // Provide more helpful error messages
      let errorMessage = 'Failed to initiate authentication';
      if (error instanceof Error) {
        if (error.message.includes('Popup window was blocked')) {
          errorMessage = 'Popup window was blocked by your browser. Please allow popups for this site and try again.';
        } else if (error.message.includes('Authentication was cancelled')) {
          errorMessage = 'Authentication was cancelled. Please try again if you want to connect your calendar.';
        } else if (error.message.includes('Authentication timed out')) {
          errorMessage = 'Authentication timed out. Please try again.';
        } else if (error.message.includes('Backend server is not running')) {
          errorMessage = 'Backend server is not running. Please run "npm run dev" in your terminal to start both the client and server.';
        } else if (error.message.includes('Cannot connect to server')) {
          errorMessage = 'Cannot connect to the backend server. Please ensure it\'s running on port 3001.';
        } else if (error.message.includes('Request timed out')) {
          errorMessage = 'The server is taking too long to respond. Please check if the backend server is running properly.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setAuthError(errorMessage);
      setIsAuthenticating(false);
    }
  };

  const handleRetryAuth = () => {
    setAuthError(null);
    checkServerAvailability();
  };

  const handleSkipAuth = () => {
    setAuthStatus(prev => ({
      ...prev,
      composioSkipped: true,
      isCheckingAuth: false,
    }));
    setAuthError(null);
    // Allow user to continue with basic calendar features
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
        // Allow proceeding if server is unavailable (skip AI features) or if Composio authentication is complete
        return serverStatus === 'unavailable' || authStatus.composioConnected || authStatus.composioSkipped;
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
              {/* Server Status Check */}
              {serverStatus === 'checking' && (
                <div className="p-6 border-2 border-blue-200 bg-blue-50 rounded-xl">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto">
                      <Loader2 className="h-8 w-8 text-white animate-spin" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">
                        Checking Server Status
                      </h3>
                      <p className="text-sm text-gray-600">
                        Verifying backend server connection...
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Server Unavailable */}
              {serverStatus === 'unavailable' && (
                <div className="space-y-4">
                  <div className="p-6 border-2 border-orange-200 bg-orange-50 rounded-xl">
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto">
                        <Server className="h-8 w-8 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-2">
                          Backend Server Not Running
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          The AI features require a backend server. To enable full functionality:
                        </p>
                        <div className="text-sm text-gray-700 text-left space-y-2 mb-4">
                          <p className="font-medium">1. Open your terminal</p>
                          <p className="font-medium">2. Run: <code className="bg-gray-200 px-2 py-1 rounded">npm run dev</code></p>
                          <p className="font-medium">3. Wait for both client and server to start</p>
                        </div>
                        <p className="text-xs text-gray-500">
                          You can continue without AI features for now.
                        </p>
                      </div>
                      
                      <div className="flex space-x-3">
                        <button
                          onClick={checkServerAvailability}
                          className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                        >
                          <Loader2 className="h-4 w-4" />
                          <span>Retry Connection</span>
                        </button>
                        <button
                          onClick={handleSkipAuth}
                          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Continue Without AI
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Checking Authentication Status */}
              {serverStatus === 'available' && authStatus.isCheckingAuth && (
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
              {serverStatus === 'available' && !authStatus.isCheckingAuth && !authStatus.googleAuthenticated && !authStatus.composioSkipped && (
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
                            <span>Redirecting to authentication...</span>
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
                            <span>Preparing secure authentication redirect...</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Skip Option */}
                      <button
                        onClick={handleSkipAuth}
                        className="w-full text-sm text-gray-600 underline hover:no-underline"
                      >
                        Skip AI features for now
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Authentication Success State */}
              {serverStatus === 'available' && !authStatus.isCheckingAuth && authStatus.composioConnected && (
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

              {/* Skipped Authentication State */}
              {authStatus.composioSkipped && (
                <div className="p-4 border-2 border-gray-200 bg-gray-50 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-500 rounded-full flex items-center justify-center">
                      <Calendar className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        Basic Calendar Mode
                      </p>
                      <p className="text-sm text-gray-700">
                        AI features disabled - you can enable them later
                      </p>
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
                      <p className="font-medium text-red-900">Connection Error</p>
                      <p className="text-sm text-red-700 mb-2">{authError}</p>
                      <div className="flex space-x-2">
                        <button
                          onClick={handleRetryAuth}
                          className="text-sm text-red-600 underline hover:no-underline"
                        >
                          Retry Connection
                        </button>
                        <button
                          onClick={handleSkipAuth}
                          className="text-sm text-gray-600 underline hover:no-underline"
                        >
                          Continue Without AI
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="text-xs text-gray-500 text-center space-y-1">
                <p>🔒 Secure OAuth 2.0 authentication</p>
                <p>🤖 AI-powered calendar management (when server available)</p>
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
                  {serverStatus === 'unavailable' && (
                    <p className="text-orange-600 text-xs mt-1">⚠️ AI features disabled - server not running</p>
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
            {serverStatus === 'unavailable' && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl max-w-lg mx-auto">
                <p className="text-sm text-orange-700 text-center">
                  ⚠️ AI features require the backend server to be running
                </p>
              </div>
            )}
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
                  } ${serverStatus === 'unavailable' ? 'opacity-50' : ''}`}
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
                    disabled={serverStatus === 'unavailable'}
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
                        {serverStatus === 'available' && authStatus.hasValidEmail 
                          ? 'Google Calendar + Composio + OpenAI integration ready'
                          : serverStatus === 'available'
                          ? 'Google Calendar integration ready (AI features limited)'
                          : 'Basic calendar features ready (server required for AI)'
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