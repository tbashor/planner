import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Send, Mic, Brain, AlertCircle, Settings, Link, TestTube, Calendar, Shield, CheckCircle, Zap, ExternalLink, MessageSquare, User } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import composioService, { ComposioTestResponse } from '../../services/composioService';

// Extend Window interface for webkit speech recognition
declare global {
  interface Window {
    webkitSpeechRecognition: new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void;
      onerror: () => void;
      start: () => void;
    };
  }
}

export default function AiSidebar() {
  const { state, dispatch } = useApp();
  const { authState } = useAuth();
  const [chatInput, setChatInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessingMessage, setIsProcessingMessage] = useState(false);
  const [isComposioConnected, setIsComposioConnected] = useState(false);
  const [composioConnectionError, setComposioConnectionError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('unknown');
  const [showComposioSettings, setShowComposioSettings] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResults, setTestResults] = useState<ComposioTestResponse | null>(null);
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);
  const [isGoogleCalendarConnected, setIsGoogleCalendarConnected] = useState(false);
  const [lastToolsUsed, setLastToolsUsed] = useState<number>(0);
  const [isSettingUpConnection, setIsSettingUpConnection] = useState(false);
  const [setupRedirectUrl, setSetupRedirectUrl] = useState<string | null>(null);
  const [lastSetupAttempt, setLastSetupAttempt] = useState<number>(0);
  const [isCheckingConnections, setIsCheckingConnections] = useState<boolean>(false);

  // Chat scrolling refs and state
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function to validate if an email is real (not a fallback) - memoized to prevent excessive calls
  const isValidRealEmail = useCallback((email: string): boolean => {
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
  }, []);

  // Get the authenticated user email from the app state - memoized to prevent excessive calls
  const getAuthenticatedUserEmail = useMemo((): string | null => {
    if (state.user?.email && isValidRealEmail(state.user.email)) {
      console.log(`✅ Valid authenticated user email found: ${state.user.email}`);
      return state.user.email;
    }
    console.log(`⚠️ No valid user email found. Current state:`, {
      userEmail: state.user?.email,
      userExists: !!state.user,
      isValid: state.user?.email ? isValidRealEmail(state.user.email) : false
    });
    return null;
  }, [state.user?.email, isValidRealEmail]);

  // Enhanced helper function to prepare chat conversation context with BOTH user and AI messages
  const prepareChatContext = useCallback(() => {
    const maxMessages = 10; // Send last 10 messages (5 exchanges) for context
    const recentMessages = state.chatMessages.slice(-maxMessages);
    
    // Format messages for the AI agent - include BOTH user and assistant messages
    const conversationHistory = recentMessages.map(msg => ({
      role: msg.type === 'user' ? 'user' : 'assistant',
      content: msg.content,
      timestamp: msg.timestamp,
      messageId: msg.id
    }));

    // Add conversation flow analysis
    const userMessages = recentMessages.filter(msg => msg.type === 'user');
    const aiMessages = recentMessages.filter(msg => msg.type === 'ai');
    
    console.log(`📝 Preparing conversation context:`, {
      totalMessages: recentMessages.length,
      userMessages: userMessages.length,
      aiMessages: aiMessages.length,
      lastUserMessage: userMessages[userMessages.length - 1]?.content?.substring(0, 50),
      lastAiMessage: aiMessages[aiMessages.length - 1]?.content?.substring(0, 50)
    });

    return {
      conversationHistory,
      messageCount: recentMessages.length,
      totalMessages: state.chatMessages.length,
      conversationFlow: {
        userMessageCount: userMessages.length,
        aiMessageCount: aiMessages.length,
        lastExchange: recentMessages.length >= 2 ? {
          user: recentMessages[recentMessages.length - 2]?.type === 'user' ? recentMessages[recentMessages.length - 2]?.content : null,
          ai: recentMessages[recentMessages.length - 1]?.type === 'ai' ? recentMessages[recentMessages.length - 1]?.content : null
        } : null
      }
    };
  }, [state.chatMessages]);

  // Auto-scroll functionality
  const scrollToBottom = useCallback((force: boolean = false) => {
    if (messagesEndRef.current && (shouldAutoScroll || force)) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }
  }, [shouldAutoScroll]);

  // Check if user is near bottom of chat
  const isNearBottom = useCallback(() => {
    if (!chatContainerRef.current) return true;
    
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const threshold = 100; // pixels from bottom
    
    return scrollHeight - scrollTop - clientHeight < threshold;
  }, []);

  // Handle scroll events to detect user scrolling
  const handleScroll = useCallback(() => {
    if (!chatContainerRef.current) return;

    const nearBottom = isNearBottom();
    
    // If user scrolled up significantly, disable auto-scroll
    if (!nearBottom && !isUserScrolling) {
      setIsUserScrolling(true);
      setShouldAutoScroll(false);
    }
    
    // If user scrolled back to bottom, re-enable auto-scroll
    if (nearBottom && isUserScrolling) {
      setIsUserScrolling(false);
      setShouldAutoScroll(true);
    }

    // Clear any existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Set a timeout to detect when scrolling stops
    scrollTimeoutRef.current = setTimeout(() => {
      if (nearBottom) {
        setShouldAutoScroll(true);
        setIsUserScrolling(false);
      }
    }, 150);
  }, [isNearBottom, isUserScrolling]);

  // Auto-scroll when new messages are added
  useEffect(() => {
    if (state.chatMessages.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [state.chatMessages.length, scrollToBottom]);

  // Auto-scroll when processing state changes
  useEffect(() => {
    if (isProcessingMessage) {
      // Force scroll when processing starts
      setTimeout(() => {
        scrollToBottom(true);
      }, 100);
    }
  }, [isProcessingMessage, scrollToBottom]);

  // Cleanup scroll timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Check server availability and connections - debounced to prevent excessive calls
  const checkServerAndConnections = useCallback(async () => {
    // Prevent overlapping connection checks
    if (isCheckingConnections) {
      console.log('⚠️ Connection check already in progress, skipping duplicate');
      return;
    }
    
    // Debounce to prevent excessive calls
    const now = Date.now();
    if (now - lastSetupAttempt < 1000) {
      console.log('⚠️ Connection check called too recently, skipping');
      return;
    }
    
    setIsCheckingConnections(true);
    
    try {
      console.log('🔍 Checking server and connections...');
      // Check server availability
      const available = await composioService.isServerAvailable();
      setServerAvailable(available);

      // Check Google Calendar connection via Composio auth
      const googleConnected = authState.isAuthenticated && authState.connectionStatus === 'connected';
      setIsGoogleCalendarConnected(googleConnected);

      if (!available) {
        setIsComposioConnected(false);
        setComposioConnectionError('AI agent server is not available. Please start the server.');
        return;
      }

      // Get authenticated user email
      const userEmail = getAuthenticatedUserEmail;
      if (!userEmail) {
        setIsComposioConnected(false);
        setComposioConnectionError('Advanced AI agent features require email verification. Basic calendar features are available.');
        setConnectionStatus('no_valid_email');
        return;
      }

      console.log(`🔍 Checking AI agent connection for validated user: ${userEmail}`);

      // Test user's Composio connection
      const testResult = await composioService.testUserConnection(userEmail);
      
      if (testResult.success && testResult.testResult) {
        setIsComposioConnected(true);
        setConnectionStatus(testResult.testResult.connectionStatus);
        setComposioConnectionError(null);
        setSetupRedirectUrl(null);
        console.log(`✅ AI agent connection active for ${userEmail}`);
      } else {
        setIsComposioConnected(false);
        setConnectionStatus('disconnected');
        
        // Check if this is a connection issue that can be fixed
        if (testResult.error?.includes('Could not find a connection') || 
            testResult.error?.includes('No connection found') ||
            testResult.error?.includes('No Google Calendar connection')) {
          setComposioConnectionError('AI agent needs Google Calendar connection. Click "Setup Connection" to authenticate.');
        } else {
          setComposioConnectionError(testResult.error || 'AI agent connection not found');
        }
        
        console.warn(`❌ AI agent connection failed for ${userEmail}:`, testResult.error);
      }
    } catch (error) {
      setIsComposioConnected(false);
      setServerAvailable(false);
      setConnectionStatus('error');
      setComposioConnectionError('Failed to check AI agent connection');
      console.error('❌ Error checking AI agent connection:', error);
    } finally {
      setIsCheckingConnections(false);
    }
  }, [getAuthenticatedUserEmail, isCheckingConnections]);

  // Handle OAuth completion on page load
  useEffect(() => {
    const handleOAuthCompletion = () => {
      const oauthResult = composioService.handleOAuthCompletion();
      
      if (oauthResult.success && oauthResult.userEmail) {
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `oauth_complete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'ai',
            content: `🎉 Excellent! Your Google Calendar authentication completed successfully for ${oauthResult.userEmail}. I'm now setting up your AI agent with full calendar access...`,
            timestamp: new Date().toISOString(),
          },
        });
        
        // Start polling for connection to become active
        if (oauthResult.userEmail === getAuthenticatedUserEmail) {
          setTimeout(() => {
            composioService.pollConnectionStatus(oauthResult.userEmail!, 8, 2000)
              .then((success) => {
                if (success) {
                  setIsComposioConnected(true);
                  setConnectionStatus('active');
                  setComposioConnectionError(null);
                  setSetupRedirectUrl(null);
                  
                  dispatch({
                    type: 'ADD_CHAT_MESSAGE',
                    payload: {
                      id: `oauth_ready_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                      type: 'ai',
                      content: `✅ Perfect! Your AI agent is now fully active and ready to manage your Google Calendar. Try asking me to "schedule a meeting tomorrow at 2pm" or "what's on my calendar today?"`,
                      timestamp: new Date().toISOString(),
                    },
                  });
                } else {
                  dispatch({
                    type: 'ADD_CHAT_MESSAGE',
                    payload: {
                      id: `oauth_timeout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                      type: 'ai',
                      content: `⚠️ Your Google Calendar authentication completed, but the AI agent connection is taking longer than expected to activate. Please try using the "Test Connection" button or ask me a question to check if it's working.`,
                      timestamp: new Date().toISOString(),
                    },
                  });
                }
              })
              .catch((error) => {
                console.error('Error polling connection status:', error);
              });
          }, 1000);
        }
      } else if (oauthResult.success === false && oauthResult.error) {
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `oauth_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'ai',
            content: `❌ Google Calendar authentication failed: ${oauthResult.error}. Please try the "Setup Connection" button again.`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    };
    
    handleOAuthCompletion();
  }, []); // Run once on component mount
  
  // Only check connections when user email changes, not on every render
  useEffect(() => {
    if (getAuthenticatedUserEmail) {
      console.log(`🔄 useEffect triggered for user: ${getAuthenticatedUserEmail}`);
      checkServerAndConnections();
    }
  }, [getAuthenticatedUserEmail]);

  const handleSetupConnection = async () => {
    const userEmail = getAuthenticatedUserEmail;
    if (!userEmail) {
      setComposioConnectionError('Email verification required for AI agent setup');
      return;
    }

    // Prevent multiple concurrent setup calls with debouncing
    const now = Date.now();
    if (isSettingUpConnection) {
      console.log('⚠️ Setup already in progress, ignoring duplicate request');
      return;
    }
    
    // Debounce: prevent requests within 3 seconds of each other
    if (now - lastSetupAttempt < 3000) {
      console.log('⚠️ Setup called too recently, debouncing request');
      return;
    }
    
    setLastSetupAttempt(now);

    setIsSettingUpConnection(true);
    setComposioConnectionError(null);
    setSetupRedirectUrl(null);

    try {
      console.log(`🚀 Setting up AI agent connection using Composio OAuth flow for: ${userEmail}`);
      
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `composio_setup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: `🔗 Setting up your AI agent connection for ${userEmail}. This will use Composio's OAuth flow to securely connect to your Google Calendar...`,
          timestamp: new Date().toISOString(),
        },
      });

      // Use Composio's proper OAuth flow (following documentation)
      const result = await composioService.setupUserConnectionWithOAuth(userEmail);
      
      console.log('📥 Composio OAuth setup result:', result);
      
      if (result.success) {
        if (result.redirectUrl && result.needsOAuthCompletion) {
          // OAuth flow initiated - user needs to complete authentication
          setConnectionStatus(result.status || 'pending');
          setSetupRedirectUrl(result.redirectUrl);
          setComposioConnectionError(null);
          
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `composio_oauth_redirect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'ai',
              content: `🔗 Perfect! I've initiated your Google Calendar connection through Composio. Please click the "Open Authentication Page" button below to complete the OAuth authentication. You'll be redirected to Google to authorize access to your calendar.`,
              timestamp: new Date().toISOString(),
            },
          });
          
          return; // OAuth completion needed
        } else if (result.status === 'active') {
          // Already active connection found
          setIsComposioConnected(true);
          setConnectionStatus('active');
          setComposioConnectionError(null);
          setSetupRedirectUrl(null);
          
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `composio_ready_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'ai',
              content: `🎉 Excellent! Your AI agent connection for ${userEmail} is already active. I can now manage your Google Calendar using AI commands. Try asking me to "schedule a meeting tomorrow at 2pm" or "what's on my calendar today?"`,
              timestamp: new Date().toISOString(),
            },
          });
          
          // Refresh connection status
          setTimeout(() => {
            checkServerAndConnections();
          }, 2000);
          
          return; // Already active
        } else {
          // Other status
          console.warn(`⚠️ Unexpected status from OAuth setup: ${result.status}`);
          setConnectionStatus(result.status || 'pending');
          setComposioConnectionError(null);
          
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `composio_status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'ai',
              content: `🔄 Your AI agent connection is in progress. Status: ${result.status}. ${result.message}`,
              timestamp: new Date().toISOString(),
            },
          });
          
          return;
        }
      } else {
        // Setup failed
        setComposioConnectionError(result.error || 'Failed to setup AI agent connection');
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `composio_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'ai',
            content: `❌ Failed to setup AI agent connection: ${result.error}. Please try again or contact support if the issue persists.`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (setupError) {
      console.error('❌ Error setting up Composio OAuth connection:', setupError);
      setComposioConnectionError('Failed to setup AI agent connection');
      
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `composio_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: `❌ An error occurred while setting up your AI agent connection. Please try again.`,
          timestamp: new Date().toISOString(),
        },
      });
    } finally {
      setIsSettingUpConnection(false);
    }
  };

  const handleOpenAuthUrl = () => {
    if (setupRedirectUrl) {
      window.open(setupRedirectUrl, '_blank');
      
      // Start polling to check if connection is complete
      const pollInterval = setInterval(async () => {
        try {
          const userEmail = getAuthenticatedUserEmail;
          if (userEmail) {
            const testResult = await composioService.testUserConnection(userEmail);
            if (testResult.success && testResult.testResult) {
              clearInterval(pollInterval);
              setIsComposioConnected(true);
              setConnectionStatus('active');
              setComposioConnectionError(null);
              setSetupRedirectUrl(null);
              
              dispatch({
                type: 'ADD_CHAT_MESSAGE',
                payload: {
                  id: `composio_complete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  type: 'ai',
                  content: `🎉 Excellent! Your AI agent is now connected and ready. I have access to your Google Calendar tools and can help you manage your schedule intelligently.`,
                  timestamp: new Date().toISOString(),
                },
              });
            }
          }
        } catch {
          // Continue polling
        }
      }, 3000);
      
      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 5 * 60 * 1000);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = chatInput.trim();
    const userEmail = getAuthenticatedUserEmail;

    if (!userEmail) {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: 'Advanced AI agent features require email verification. Please ensure your Google account email is properly authenticated. Basic calendar features are still available.',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    setIsProcessingMessage(true);

    // Add user message
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
      },
    });

    setChatInput('');

    try {
      console.log(`🤖 Sending message to OpenAI agent for validated user: ${userEmail}`);
      
      // Prepare enhanced context with conversation history INCLUDING AI responses
      const chatContext = prepareChatContext();
      
      console.log(`📝 Enhanced conversation context prepared:`, {
        historyLength: chatContext.conversationHistory.length,
        userMessages: chatContext.conversationFlow.userMessageCount,
        aiMessages: chatContext.conversationFlow.aiMessageCount,
        lastExchange: chatContext.conversationFlow.lastExchange
      });
      
      // Send message to OpenAI agent with Composio tools and FULL conversation context
      const response = await composioService.sendMessage(userMessage, userEmail, {
        events: state.events,
        preferences: state.user?.preferences,
        currentDate: new Date(),
        // Enhanced conversation history with BOTH user and AI messages
        conversationHistory: chatContext.conversationHistory,
        conversationMetadata: {
          messageCount: chatContext.messageCount,
          totalMessages: chatContext.totalMessages,
          userEmail: userEmail,
          userName: state.user?.name,
          timestamp: new Date().toISOString(),
          conversationFlow: chatContext.conversationFlow
        }
      });

      if (response.success && response.response) {
        // Track tools used by the agent
        if (response.response.toolsUsed) {
          setLastToolsUsed(response.response.toolsUsed);
        }

        // Check if user needs to setup connection
        if (response.response.needsConnection) {
          let aiMessage = response.response.message;
          
          // If this is a setup issue, suggest using the setup button
          if (response.response.needsSetup) {
            aiMessage += '\n\n💡 Use the "Setup Connection" button below to connect your Google Calendar with the AI agent.';
          }
          
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `ai_setup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'ai',
              content: aiMessage,
              timestamp: new Date().toISOString(),
            },
          });
        } else {
          // Normal AI agent response
          let aiMessage = response.response.message;
          
          // Add tool usage info if tools were used
          if (response.response.toolsUsed && response.response.toolsUsed > 0) {
            aiMessage += `\n\n🔧 *I used ${response.response.toolsUsed} Google Calendar tool${response.response.toolsUsed > 1 ? 's' : ''} to help you with this request.*`;
          }

          // Add conversation context info for debugging (only in development)
          if (import.meta.env.DEV && chatContext.messageCount > 0) {
            aiMessage += `\n\n*[Context: ${chatContext.messageCount} recent messages (${chatContext.conversationFlow.userMessageCount} user, ${chatContext.conversationFlow.aiMessageCount} AI) provided for continuity]*`;
          }

          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'ai',
              content: aiMessage,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else {
        throw new Error(response.error || 'Failed to get AI agent response');
      }

      setIsProcessingMessage(false);
    } catch (error) {
      console.error(`Error processing message for ${userEmail}:`, error);
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `ai_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ai',
          content: "I'm having trouble processing that request right now. Please check your connection and try again. The AI agent might be temporarily unavailable.",
          timestamp: new Date().toISOString(),
        },
      });
      setIsProcessingMessage(false);
    }
  };

  const handleVoiceInput = () => {
    if (!state.user?.preferences.voiceInput) return;
    
    setIsListening(!isListening);
    
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setChatInput(transcript);
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.start();
    }
  };

  const handleTestConnection = async () => {
    const userEmail = getAuthenticatedUserEmail;
    if (!userEmail) {
      setComposioConnectionError('Email verification required for AI agent features');
      return;
    }

    setIsTestingConnection(true);
    setTestResults(null);

    try {
      console.log(`🧪 Testing AI agent connection for validated user: ${userEmail}`);
      
      const result = await composioService.testUserConnection(userEmail);
      setTestResults(result);
      
      if (result.success) {
        setIsComposioConnected(true);
        setConnectionStatus(result.testResult?.connectionStatus || 'active');
        setComposioConnectionError(null);
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `test_success_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'ai',
            content: `🧪 AI agent connection test successful for ${userEmail}! Your OpenAI agent has access to ${result.testResult?.toolsAvailable || 0} Google Calendar tools and can intelligently decide which ones to use for your requests. I also have full conversation memory to maintain context across our chat.`,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        setIsComposioConnected(false);
        setComposioConnectionError(result.error || 'AI agent connection test failed');
        
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `test_failed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'ai',
            content: `❌ AI agent connection test failed for ${userEmail}: ${result.error}. Try using the "Setup Connection" button to establish your connection.`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('❌ AI agent connection test error:', error);
      setComposioConnectionError('AI agent connection test failed');
      setTestResults({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const displayUserEmail = getAuthenticatedUserEmail;
  const hasValidEmail = !!displayUserEmail;

  // Generate dynamic placeholder based on conversation context and user preferences
  const getChatPlaceholder = () => {
    const baseMessages = [
      "Tell me what you need help with...",
      "Ask me about your schedule or create events...",
      "What would you like me to help you with today?"
    ];

    // If user has routines, suggest routine-based actions
    if (state.user?.preferences?.dailyRoutines?.length > 0) {
      const routines = state.user.preferences.dailyRoutines;
      if (routines.includes('lunch')) {
        return "Try: 'Schedule my lunch break' or ask about your day...";
      }
      if (routines.includes('exercise')) {
        return "Try: 'Add my workout' or ask about your schedule...";
      }
    }

    // If user has focus areas, suggest focus-based actions
    if (state.user?.preferences?.focusAreas?.length > 0) {
      const focusAreas = state.user.preferences.focusAreas;
      if (focusAreas.includes('learning-education')) {
        return "Try: 'Schedule study time' or ask about your calendar...";
      }
      if (focusAreas.includes('health-fitness')) {
        return "Try: 'Add workout session' or check your schedule...";
      }
    }

    // Check recent conversation for context
    if (state.chatMessages.length > 0) {
      const lastMessage = state.chatMessages[state.chatMessages.length - 1];
      if (lastMessage.type === 'ai' && lastMessage.content.includes('schedule')) {
        return "Continue our conversation or ask something new...";
      }
    }

    return baseMessages[Math.floor(Math.random() * baseMessages.length)];
  };

  return (
    <div className={`h-full flex flex-col ${
      state.isDarkMode 
        ? 'bg-gray-900' 
        : 'bg-white'
    }`}>
      {/* Chat Header */}
      <div className={`p-4 border-b flex-shrink-0 ${
        state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className={`font-semibold ${
                state.isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                AI Assistant
              </h2>
              <div className="flex items-center space-x-2">
                {isComposioConnected && hasValidEmail ? (
                  <>
                    <CheckCircle className="w-3 h-3 text-green-400" />
                    <span className={`text-xs ${
                      state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      Active with Memory
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 text-red-400" />
                    <span className={`text-xs ${
                      state.isDarkMode ? 'text-red-400' : 'text-red-600'
                    }`}>
                      {hasValidEmail ? 'Setup Needed' : 'Limited'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <button
            onClick={() => setShowComposioSettings(!showComposioSettings)}
            className={`p-2 rounded-lg transition-colors ${
              state.isDarkMode
                ? 'text-gray-400 hover:bg-gray-700 hover:text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
        
        {/* Connection Error */}
        {composioConnectionError && (
          <div className={`mt-3 p-3 rounded-md text-sm max-h-32 overflow-y-auto ${
            hasValidEmail
              ? state.isDarkMode 
                ? 'bg-red-900/30 text-red-300 border border-red-800' 
                : 'bg-red-50 text-red-700 border border-red-200'
              : state.isDarkMode
                ? 'bg-orange-900/30 text-orange-300 border border-orange-800'
                : 'bg-orange-50 text-orange-700 border border-orange-200'
          }`}>
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="whitespace-pre-wrap break-words">{composioConnectionError}</div>
                <div className="flex space-x-2 mt-2">
                  <button 
                    onClick={checkServerAndConnections}
                    className={`text-xs underline hover:no-underline ${
                      hasValidEmail
                        ? state.isDarkMode ? 'text-red-400' : 'text-red-600'
                        : state.isDarkMode ? 'text-orange-400' : 'text-orange-600'
                    }`}
                  >
                    Retry check
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Setup Authentication URL */}
        {setupRedirectUrl && (
          <div className={`mt-3 p-3 rounded-md text-sm ${
            state.isDarkMode 
              ? 'bg-blue-900/30 text-blue-300 border border-blue-800' 
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            <div className="flex items-start space-x-2">
              <ExternalLink className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium mb-2">Complete Authentication</div>
                <p className="text-xs mb-3">Click the button below to authenticate your Google Calendar with the AI agent:</p>
                <button
                  onClick={handleOpenAuthUrl}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    state.isDarkMode
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  <ExternalLink className="h-3 w-3 inline mr-1" />
                  Open Authentication Page
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settings Panel */}
        {showComposioSettings && (
          <div className={`mt-3 p-3 rounded-lg border ${
            state.isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
          }`}>
            {/* Status Information Section */}
            <div className={`mb-4 pb-3 border-b ${
              state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <h4 className={`text-sm font-medium mb-3 ${
                state.isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Connection Status
              </h4>
              
              {/* User Info */}
              {state.user?.email && (
                <div className={`text-xs space-y-2 ${
                  state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  <div className="flex items-center space-x-2">
                    <User className="h-3 w-3" />
                    <span className={`font-medium ${hasValidEmail ? 'text-green-600' : 'text-orange-600'}`}>
                      {state.user.email}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-3 w-3" />
                    <span>Google Calendar: {isGoogleCalendarConnected ? 'Connected' : 'Disconnected'}</span>
                    {isGoogleCalendarConnected && <Shield className="h-3 w-3 text-green-500" />}
                  </div>
                  {hasValidEmail ? (
                    <div className="text-green-500">✓ Email verified - AI agent ready</div>
                  ) : (
                    <div className="text-orange-500">⚠️ Email verification needed</div>
                  )}
                  {isComposioConnected && hasValidEmail && (
                    <div className="text-purple-500">🤖 OpenAI agent with {lastToolsUsed > 0 ? `${lastToolsUsed} tools used recently` : 'Composio tools ready'}</div>
                  )}
                  {/* Enhanced Chat Context Info */}
                  {state.chatMessages.length > 0 && (
                    <div className="text-blue-500">
                      💬 {state.chatMessages.length} messages in conversation 
                      {isComposioConnected && <span className="text-green-500"> • Full memory active</span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {/* Setup Connection Button */}
              {state.user?.email && hasValidEmail && !isComposioConnected && (
                <button
                  onClick={handleSetupConnection}
                  disabled={isSettingUpConnection || !serverAvailable}
                  className={`w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-200 ${
                    isSettingUpConnection || !serverAvailable
                      ? 'opacity-50 cursor-not-allowed'
                      : state.isDarkMode
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  <Link className={`h-3 w-3 ${isSettingUpConnection ? 'animate-spin' : ''}`} />
                  <span>{isSettingUpConnection ? 'Setting up...' : 'Setup Connection'}</span>
                </button>
              )}

              {/* Test Connection Button */}
              {state.user?.email && (
                <button
                  onClick={handleTestConnection}
                  disabled={isTestingConnection || !serverAvailable}
                  className={`w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-200 ${
                    isTestingConnection || !serverAvailable
                      ? 'opacity-50 cursor-not-allowed'
                      : state.isDarkMode
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : 'bg-purple-500 text-white hover:bg-purple-600'
                  }`}
                >
                  <TestTube className={`h-3 w-3 ${isTestingConnection ? 'animate-spin' : ''}`} />
                  <span>{isTestingConnection ? 'Testing...' : 'Test AI Agent'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Chat Messages with Auto-Scroll */}
      <div className="flex-1 flex flex-col min-h-0">
        <div 
          ref={chatContainerRef}
          onScroll={handleScroll}
          className={`flex-1 overflow-y-auto p-4 space-y-4 ${
            state.isDarkMode ? 'scrollbar-dark' : 'scrollbar-light'
          }`}
        >
          {state.chatMessages.length === 0 && (
            <div className={`text-center py-8 ${
              state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Chat with your intelligent AI calendar agent</p>
              <p className="text-xs mt-1">
                {hasValidEmail 
                  ? 'Powered by OpenAI with Composio Google Calendar tools & full conversation memory'
                  : 'Email verification required for AI agent features'
                }
              </p>
              {state.user?.email && (
                <div className="text-xs mt-2 opacity-75">
                  <p>Connected as: {state.user.email}</p>
                  <p>Agent Status: {connectionStatus}</p>
                  {!hasValidEmail && (
                    <p className="text-orange-500 mt-1">⚠️ Limited features - email verification needed</p>
                  )}
                </div>
              )}
            </div>
          )}
          
          {state.chatMessages.map((message, index) => (
            <div
              key={`${message.id}_${index}`}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  message.type === 'user'
                    ? 'bg-blue-500 text-white'
                    : state.isDarkMode
                    ? 'bg-gray-800 text-gray-200'
                    : 'bg-white text-gray-900 border border-gray-200'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                <p className={`text-xs mt-1 opacity-70`}>
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {/* Processing indicator */}
          {isProcessingMessage && (
            <div className="flex justify-start">
              <div className={`max-w-[80%] p-3 rounded-lg ${
                state.isDarkMode
                  ? 'bg-gray-800 text-gray-200'
                  : 'bg-white text-gray-900 border border-gray-200'
              }`}>
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="text-xs opacity-70">AI agent is analyzing with full conversation context...</span>
                </div>
              </div>
            </div>
          )}

          {/* Invisible element to scroll to */}
          <div ref={messagesEndRef} />
        </div>

        {/* Auto-scroll indicator */}
        {!shouldAutoScroll && (
          <div className="px-4 py-2">
            <button
              onClick={() => {
                setShouldAutoScroll(true);
                setIsUserScrolling(false);
                scrollToBottom(true);
              }}
              className={`w-full text-xs py-2 px-3 rounded-lg transition-colors ${
                state.isDarkMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              ↓ Scroll to latest messages
            </button>
          </div>
        )}

        {/* Chat Input */}
        <div className={`p-4 border-t flex-shrink-0 ${
          state.isDarkMode ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <form onSubmit={handleSendMessage} className="flex space-x-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={
                !state.user?.email 
                  ? "Complete onboarding to get your AI agent..."
                  : !serverAvailable
                    ? "AI agent server is offline..."
                    : !hasValidEmail
                      ? "Email verification needed for AI agent..."
                      : getChatPlaceholder()
              }
              disabled={isProcessingMessage || !state.user?.email || !serverAvailable}
              className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                state.isDarkMode
                  ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              } ${(isProcessingMessage || !state.user?.email || !serverAvailable) ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {state.user?.preferences.voiceInput && (
              <button
                type="button"
                onClick={handleVoiceInput}
                disabled={isProcessingMessage || !state.user?.email || !serverAvailable}
                className={`p-2 rounded-lg transition-colors duration-200 ${
                  isListening
                    ? 'bg-red-500 text-white'
                    : state.isDarkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                } ${(isProcessingMessage || !state.user?.email || !serverAvailable) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={!chatInput.trim() || isProcessingMessage || !state.user?.email || !serverAvailable}
              className="p-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          
          {/* Helper text */}
          <div className={`mt-2 text-xs ${
            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {!state.user?.email ? (
              <p>🔐 Complete onboarding to get your AI agent</p>
            ) : !serverAvailable ? (
              <p>🔌 AI agent server is offline - please start the server</p>
            ) : !hasValidEmail ? (
              <p>📧 Email verification needed for AI agent features</p>
            ) : (
              <div>
                <p>🤖 Try: "What's on my calendar today?", "Schedule a meeting tomorrow", "Find me free time this week"</p>
                {state.chatMessages.length > 0 && (
                  <p className="mt-1 opacity-75">
                    💬 Conversation context: {Math.min(state.chatMessages.length, 10)} recent messages 
                    {isComposioConnected && <span className="text-green-500"> • Full memory enabled</span>}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}