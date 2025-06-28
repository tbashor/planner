import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { openai } from '@ai-sdk/openai';
import { VercelAIToolSet } from 'composio-core';
import { generateText } from 'ai';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Initialize Composio ToolSet
const toolset = new VercelAIToolSet({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// User-specific storage for connections and entities
const userConnections = new Map(); // userEmail -> connection data
const userEntities = new Map(); // userEmail -> entityId

// Helper function to wait for connection to become active
async function waitForConnectionActive(userEmail, entityId, connectionId, maxWaitTime = 30000) {
  const startTime = Date.now();
  const pollInterval = 2000; // Check every 2 seconds
  
  console.log(`⏳ Waiting for connection ${connectionId} to become active for ${userEmail}...`);
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const entity = await toolset.client.getEntity(entityId);
      const connections = await entity.getConnections();
      
      const targetConnection = connections.find(conn => conn.id === connectionId);
      
      if (targetConnection) {
        console.log(`🔍 Connection ${connectionId} status: ${targetConnection.status}`);
        
        // Check for various "active" states
        const activeStates = ['active', 'initiated', 'connected', 'ready'];
        const isActive = targetConnection.status && 
                        activeStates.some(state => 
                          targetConnection.status.toLowerCase().includes(state.toLowerCase())
                        );
        
        if (isActive) {
          console.log(`✅ Connection ${connectionId} is now active for ${userEmail}`);
          return targetConnection;
        }
        
        // If still initializing, continue waiting
        if (targetConnection.status && targetConnection.status.toLowerCase().includes('initializing')) {
          console.log(`⏳ Connection ${connectionId} still initializing, waiting...`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }
        
        // If in error state, return null
        if (targetConnection.status && targetConnection.status.toLowerCase().includes('error')) {
          console.error(`❌ Connection ${connectionId} is in error state: ${targetConnection.status}`);
          return null;
        }
      } else {
        console.warn(`⚠️ Connection ${connectionId} not found in entity connections`);
        return null;
      }
    } catch (error) {
      console.warn(`⚠️ Error checking connection status: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  console.warn(`⏰ Timeout waiting for connection ${connectionId} to become active`);
  return null;
}

// Helper function to clean up duplicate connections more aggressively
async function cleanupDuplicateConnections(userEmail, entityId) {
  try {
    console.log(`🧹 Aggressively cleaning up duplicate connections for user: ${userEmail}`);
    
    const entity = await toolset.client.getEntity(entityId);
    const connections = await entity.getConnections();
    
    // Find all Google Calendar connections
    const googleConnections = connections.filter(conn => {
      const appName = (conn.appName || conn.app || '').toLowerCase();
      return appName === 'googlecalendar' || 
             appName === 'google_calendar' ||
             appName === 'google-calendar' ||
             appName === 'calendar';
    });
    
    console.log(`🔍 Found ${googleConnections.length} Google Calendar connections for ${userEmail}`);
    
    if (googleConnections.length === 0) {
      console.log(`✅ No Google Calendar connections found for ${userEmail}`);
      return null;
    }
    
    if (googleConnections.length === 1) {
      const connection = googleConnections[0];
      console.log(`✅ Single connection found: ${connection.id} with status: ${connection.status}`);
      return connection;
    }
    
    // Multiple connections found - clean them up
    console.log(`🔄 Multiple connections found (${googleConnections.length}), cleaning up...`);
    
    // Sort by creation date (newest first) and status priority
    const sortedConnections = googleConnections.sort((a, b) => {
      // Prioritize active connections
      const aActive = a.status && ['active', 'initiated', 'connected', 'ready'].some(s => 
        a.status.toLowerCase().includes(s.toLowerCase())
      );
      const bActive = b.status && ['active', 'initiated', 'connected', 'ready'].some(s => 
        b.status.toLowerCase().includes(s.toLowerCase())
      );
      
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      
      // Then by creation date (newest first)
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
    
    // Keep the best connection (first in sorted list)
    const keepConnection = sortedConnections[0];
    const deleteConnections = sortedConnections.slice(1);
    
    console.log(`🔄 Keeping connection: ${keepConnection.id} (status: ${keepConnection.status})`);
    console.log(`🗑️ Deleting ${deleteConnections.length} duplicate connections`);
    
    // Delete duplicate connections
    for (const conn of deleteConnections) {
      try {
        await entity.deleteConnection(conn.id);
        console.log(`🗑️ Deleted duplicate connection: ${conn.id}`);
      } catch (deleteError) {
        console.warn(`⚠️ Failed to delete connection ${conn.id}:`, deleteError.message);
      }
    }
    
    return keepConnection;
  } catch (error) {
    console.error(`❌ Error cleaning up duplicate connections for ${userEmail}:`, error);
    return null;
  }
}

// Helper function to setup user connection if not exists
async function setupUserConnectionIfNotExists(userEmail) {
  try {
    console.log(`🔗 Setting up Composio connection for user: ${userEmail}`);
    
    // Create entity ID based on user email (sanitized)
    const entityId = userEmail.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    
    // Store entity mapping
    userEntities.set(userEmail, entityId);
    
    console.log(`📝 Created entity ID: ${entityId} for user: ${userEmail}`);
    
    try {
      // First, try to get or create the entity
      let entity;
      try {
        entity = await toolset.client.getEntity(entityId);
        console.log(`✅ Entity ${entityId} already exists`);
      } catch (getEntityError) {
        console.log(`🔄 Entity ${entityId} doesn't exist, creating...`);
        try {
          // Create the entity first
          await toolset.client.createEntity(entityId);
          entity = await toolset.client.getEntity(entityId);
          console.log(`✅ Created and retrieved entity ${entityId}`);
        } catch (createError) {
          console.error(`❌ Failed to create entity ${entityId}:`, createError);
          throw createError;
        }
      }
      
      // Clean up any duplicate connections first
      const cleanConnection = await cleanupDuplicateConnections(userEmail, entityId);
      
      if (cleanConnection) {
        console.log(`✅ Using cleaned connection for ${userEmail}:`, cleanConnection.id);
        
        // Check if this connection is active or can become active
        const activeStates = ['active', 'initiated', 'connected', 'ready'];
        const isActive = cleanConnection.status && 
                        activeStates.some(state => 
                          cleanConnection.status.toLowerCase().includes(state.toLowerCase())
                        );
        
        if (isActive) {
          // Store connection info as active
          userConnections.set(userEmail, {
            entityId,
            connectionId: cleanConnection.id,
            status: 'active',
            connectedAt: new Date().toISOString()
          });
          
          return cleanConnection;
        } else if (cleanConnection.status && cleanConnection.status.toLowerCase().includes('initializing')) {
          // Wait for it to become active
          console.log(`⏳ Connection is initializing, waiting for it to become active...`);
          
          const activeConnection = await waitForConnectionActive(userEmail, entityId, cleanConnection.id);
          
          if (activeConnection) {
            userConnections.set(userEmail, {
              entityId,
              connectionId: activeConnection.id,
              status: 'active',
              connectedAt: new Date().toISOString()
            });
            
            return activeConnection;
          } else {
            console.warn(`⚠️ Connection failed to become active, creating new one`);
            // Delete the failed connection and create a new one
            try {
              await entity.deleteConnection(cleanConnection.id);
              console.log(`🗑️ Deleted failed connection: ${cleanConnection.id}`);
            } catch (deleteError) {
              console.warn(`⚠️ Failed to delete failed connection:`, deleteError);
            }
          }
        }
      }
      
      // If no existing connection or existing connection failed, create a new one
      console.log(`🔄 Creating new Google Calendar connection for ${userEmail}`);
      
      // Create new connection with proper configuration
      const connectionConfig = {
        appName: 'googlecalendar',
        entity: entityId,
        config: {
          // Add any required configuration for Google Calendar
          scopes: ['https://www.googleapis.com/auth/calendar'],
        }
      };
      
      console.log(`🔗 Initiating connection with config:`, connectionConfig);
      
      const newConnection = await entity.initiateConnection(connectionConfig);
      
      console.log(`🔗 Google Calendar connection initiated for ${userEmail}:`, {
        id: newConnection.id,
        redirectUrl: newConnection.redirectUrl,
        status: newConnection.status
      });
      
      // Store pending connection info
      userConnections.set(userEmail, {
        entityId,
        connectionId: newConnection.id,
        redirectUrl: newConnection.redirectUrl,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      
      return newConnection;
    } catch (entityError) {
      console.error(`❌ Error with entity operations for ${userEmail}:`, entityError);
      throw entityError;
    }
  } catch (error) {
    console.error(`❌ Error setting up connection for ${userEmail}:`, error);
    
    // Store error state
    userConnections.set(userEmail, {
      entityId: userEmail.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
      status: 'error',
      error: error.message,
      createdAt: new Date().toISOString()
    });
    
    throw error;
  }
}

// Helper function to get user-specific tools with better error handling
async function getUserTools(userEmail) {
  try {
    const entityId = userEntities.get(userEmail);
    if (!entityId) {
      throw new Error(`No entity found for user: ${userEmail}`);
    }
    
    console.log(`🛠️ Getting tools for user ${userEmail} with entity ${entityId}`);
    
    // First check if entity exists and has connections
    const entity = await toolset.client.getEntity(entityId);
    let connections = [];
    
    try {
      connections = await entity.getConnections();
      console.log(`📊 Entity ${entityId} has ${connections.length} connections`);
    } catch (connectionsError) {
      console.warn(`⚠️ Could not get connections for entity ${entityId}:`, connectionsError);
      throw new Error(`No connections available for user ${userEmail}. Please complete the authentication process.`);
    }
    
    if (connections.length === 0) {
      console.warn(`⚠️ No connections found for entity ${entityId}, user needs to authenticate`);
      throw new Error(`No Google Calendar connection found for ${userEmail}. Please complete the authentication process.`);
    }
    
    // Check if we have an active Google Calendar connection
    const googleConnection = connections.find(conn => {
      const appName = (conn.appName || conn.app || '').toLowerCase();
      const isGoogleCalendar = appName === 'googlecalendar' || 
                              appName === 'google_calendar' ||
                              appName === 'google-calendar' ||
                              appName === 'calendar';
      
      // Be more flexible with status checking
      const activeStates = ['active', 'initiated', 'connected', 'ready'];
      const isActive = !conn.status || // No status might mean active
                      activeStates.some(state => 
                        conn.status.toLowerCase().includes(state.toLowerCase())
                      );
      
      return isGoogleCalendar && isActive;
    });
    
    if (!googleConnection) {
      console.warn(`⚠️ No active Google Calendar connection found for entity ${entityId}`);
      
      // Check if there are any Google Calendar connections at all
      const anyGoogleConnection = connections.find(conn => {
        const appName = (conn.appName || conn.app || '').toLowerCase();
        return appName === 'googlecalendar' || 
               appName === 'google_calendar' ||
               appName === 'google-calendar' ||
               appName === 'calendar';
      });
      
      if (anyGoogleConnection) {
        // If connection is initializing, wait for it to become active
        if (anyGoogleConnection.status && anyGoogleConnection.status.toLowerCase().includes('initializing')) {
          console.log(`⏳ Connection is initializing, waiting for it to become active...`);
          
          const activeConnection = await waitForConnectionActive(userEmail, entityId, anyGoogleConnection.id, 15000);
          
          if (activeConnection) {
            console.log(`✅ Connection became active, proceeding with tools...`);
            // Update stored connection status
            const connectionData = userConnections.get(userEmail);
            if (connectionData) {
              connectionData.status = 'active';
              userConnections.set(userEmail, connectionData);
            }
          } else {
            throw new Error(`Google Calendar connection for ${userEmail} is taking too long to initialize. Please try again in a moment.`);
          }
        } else {
          throw new Error(`Google Calendar connection for ${userEmail} is still initializing. Please wait for authentication to complete.`);
        }
      } else {
        throw new Error(`No Google Calendar connection found for ${userEmail}. Please complete the Google Calendar authentication.`);
      }
    }
    
    console.log(`✅ Found Google Calendar connection for ${userEmail}:`, {
      id: googleConnection.id,
      status: googleConnection.status,
      appName: googleConnection.appName
    });
    
    // Get tools with more specific action list
    const tools = await toolset.getTools({
      actions: [
        'GOOGLECALENDAR_LIST_EVENTS',
        'GOOGLECALENDAR_CREATE_EVENT',
        'GOOGLECALENDAR_UPDATE_EVENT',
        'GOOGLECALENDAR_DELETE_EVENT',
        'GOOGLECALENDAR_QUICK_ADD',
        'GOOGLECALENDAR_FIND_FREE_TIME',
        'GOOGLECALENDAR_GET_EVENT',
        'GOOGLECALENDAR_MOVE_EVENT',
        'GOOGLECALENDAR_LIST_CALENDARS'
      ]
    }, entityId);
    
    console.log(`✅ Retrieved ${tools ? Object.keys(tools).length : 0} tools for ${userEmail}`);
    return tools;
  } catch (error) {
    console.error(`❌ Error getting tools for ${userEmail}:`, error);
    
    // If it's a connection error, mark the user as needing reconnection
    if (error.message.includes('Could not find a connection') || 
        error.message.includes('No connection found') ||
        error.message.includes('No Google Calendar connection') ||
        error.message.includes('still initializing')) {
      const connectionData = userConnections.get(userEmail);
      if (connectionData) {
        connectionData.status = 'disconnected';
        connectionData.error = error.message;
        userConnections.set(userEmail, connectionData);
      }
    }
    
    throw error;
  }
}

// Helper function to check if connection is active with better error handling
async function checkConnectionStatus(userEmail) {
  try {
    const connectionData = userConnections.get(userEmail);
    const entityId = userEntities.get(userEmail);
    
    if (!connectionData || !entityId) {
      return { status: 'not_found', message: 'No connection found', needsSetup: true };
    }
    
    // If we have an error state, return it
    if (connectionData.status === 'error') {
      return { 
        status: 'error', 
        message: connectionData.error || 'Connection error',
        needsSetup: true
      };
    }
    
    // If connection is pending, check if it's been completed
    if (connectionData.status === 'pending') {
      try {
        // Check if the connection is now active
        const entity = await toolset.client.getEntity(entityId);
        const connections = await entity.getConnections();
        
        const targetConnection = connections.find(conn => conn.id === connectionData.connectionId);
        
        if (targetConnection) {
          console.log(`🔍 Checking pending connection ${targetConnection.id} status: ${targetConnection.status}`);
          
          // Check for active states
          const activeStates = ['active', 'initiated', 'connected', 'ready'];
          const isActive = targetConnection.status && 
                          activeStates.some(state => 
                            targetConnection.status.toLowerCase().includes(state.toLowerCase())
                          );
          
          if (isActive) {
            // Update status to active
            connectionData.status = 'active';
            connectionData.connectionId = targetConnection.id;
            userConnections.set(userEmail, connectionData);
            
            return { 
              status: 'active', 
              message: 'Connection is active',
              toolsAvailable: 9 // We have 9 Google Calendar tools
            };
          } else if (targetConnection.status && targetConnection.status.toLowerCase().includes('initializing')) {
            return { 
              status: 'pending', 
              message: 'Connection is still initializing - please wait',
              redirectUrl: connectionData.redirectUrl,
              needsSetup: false
            };
          } else {
            return { 
              status: 'error', 
              message: `Connection failed with status: ${targetConnection.status}`,
              needsSetup: true
            };
          }
        } else {
          return { 
            status: 'error', 
            message: 'Connection not found in entity',
            needsSetup: true
          };
        }
      } catch (checkError) {
        console.error(`❌ Error checking pending connection for ${userEmail}:`, checkError);
        return { 
          status: 'pending', 
          message: 'Connection pending authentication',
          redirectUrl: connectionData.redirectUrl,
          needsSetup: false
        };
      }
    }
    
    // Try to get tools to verify connection is working
    try {
      const tools = await getUserTools(userEmail);
      
      if (tools && Object.keys(tools).length > 0) {
        // Update status to active if tools are available
        connectionData.status = 'active';
        userConnections.set(userEmail, connectionData);
        
        return { 
          status: 'active', 
          message: 'Connection is active',
          toolsAvailable: Object.keys(tools).length
        };
      } else {
        return { 
          status: 'disconnected', 
          message: 'No tools available - connection may be inactive',
          needsSetup: true
        };
      }
    } catch (toolsError) {
      console.error(`❌ Error getting tools for connection check ${userEmail}:`, toolsError);
      
      if (toolsError.message.includes('Could not find a connection') ||
          toolsError.message.includes('No connection found') ||
          toolsError.message.includes('No Google Calendar connection')) {
        return { 
          status: 'disconnected', 
          message: 'Google Calendar connection not found - needs authentication',
          needsSetup: true
        };
      } else if (toolsError.message.includes('still initializing') || 
                 toolsError.message.includes('taking too long')) {
        return {
          status: 'pending',
          message: 'Google Calendar connection is still initializing - please wait',
          needsSetup: false
        };
      }
      
      return { 
        status: 'error', 
        message: toolsError.message,
        needsSetup: true
      };
    }
  } catch (error) {
    console.error(`❌ Error checking connection status for ${userEmail}:`, error);
    return { status: 'error', message: error.message, needsSetup: true };
  }
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'SmartPlan API Server with Composio + OpenAI Agent',
    status: 'running',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    endpoints: {
      health: '/api/health',
      setupConnection: '/api/composio/setup-connection',
      sendMessage: '/api/ai/send-message',
      getConnections: '/api/composio/connections',
      testConnection: '/api/composio/test-connection',
      stats: '/api/stats'
    },
    note: 'This server uses an OpenAI agent with Composio Google Calendar tools for intelligent calendar management.',
    userConnections: userConnections.size,
    userEntities: userEntities.size,
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    services: {
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      composio: process.env.COMPOSIO_API_KEY ? 'configured' : 'missing'
    },
    userConnections: userConnections.size,
    userEntities: userEntities.size
  });
});

// Setup Composio connection for user
app.post('/api/composio/setup-connection', async (req, res) => {
  try {
    const { userEmail } = req.body;
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'userEmail is required',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🔄 Setting up Composio connection for: ${userEmail}`);
    
    // First, check if connection already exists and is working
    const existingStatus = await checkConnectionStatus(userEmail);
    if (existingStatus.status === 'active') {
      console.log(`✅ Connection already active for ${userEmail}`);
      const connectionData = userConnections.get(userEmail);
      return res.json({
        success: true,
        userEmail,
        entityId: connectionData?.entityId,
        connectionId: connectionData?.connectionId,
        status: 'active',
        message: `Google Calendar connection is already active for ${userEmail}`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Setup new connection
    const connection = await setupUserConnectionIfNotExists(userEmail);
    const connectionData = userConnections.get(userEmail);
    
    res.json({
      success: true,
      userEmail,
      entityId: connectionData?.entityId,
      connectionId: connectionData?.connectionId,
      redirectUrl: connectionData?.redirectUrl,
      status: connectionData?.status,
      message: connectionData?.status === 'pending' 
        ? `Please complete Google Calendar authentication using the redirect URL`
        : connectionData?.status === 'error'
          ? `Connection setup failed: ${connectionData.error}`
          : `Google Calendar connection is active for ${userEmail}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error setting up Composio connection:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// AI Chat endpoint with OpenAI agent and Composio tools
app.post('/api/ai/send-message', async (req, res) => {
  try {
    const { message, userEmail, context } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
        timestamp: new Date().toISOString()
      });
    }
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'User email is required for personalized calendar management',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🤖 Processing AI message for ${userEmail}: "${message}"`);
    
    // Check connection status first
    const connectionStatus = await checkConnectionStatus(userEmail);
    console.log(`📊 Connection status for ${userEmail}:`, connectionStatus);
    
    if (connectionStatus.status === 'not_found') {
      return res.json({
        success: true,
        response: {
          message: `Hi! To manage your Google Calendar with AI, I need to connect to your account first. Please use the "Setup Connection" button to authenticate with Google Calendar through Composio.`,
          needsConnection: true,
          needsSetup: true,
          userEmail: userEmail
        },
        timestamp: new Date().toISOString()
      });
    }
    
    if (connectionStatus.status === 'pending') {
      const connectionData = userConnections.get(userEmail);
      return res.json({
        success: true,
        response: {
          message: `Hi! Your Google Calendar connection is still being set up. ${connectionStatus.message}. Please wait a moment and try again.`,
          needsConnection: true,
          redirectUrl: connectionData?.redirectUrl || connectionStatus.redirectUrl,
          userEmail: userEmail
        },
        timestamp: new Date().toISOString()
      });
    }
    
    if (connectionStatus.status === 'error' || connectionStatus.status === 'disconnected') {
      return res.json({
        success: true,
        response: {
          message: `There's an issue with your Google Calendar connection: ${connectionStatus.message}. ${connectionStatus.needsSetup ? 'Please use the "Setup Connection" button to fix this.' : ''}`,
          needsConnection: true,
          needsSetup: connectionStatus.needsSetup,
          userEmail: userEmail
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // Get user-specific Composio tools
    let tools;
    try {
      tools = await getUserTools(userEmail);
      
      if (!tools || Object.keys(tools).length === 0) {
        return res.json({
          success: true,
          response: {
            message: `I can help you with calendar planning, but I need access to your Google Calendar tools. Please complete the authentication process to enable full AI calendar management.`,
            needsConnection: true,
            needsSetup: true,
            userEmail: userEmail
          },
          timestamp: new Date().toISOString()
        });
      }
      
      console.log(`✅ Successfully retrieved ${Object.keys(tools).length} tools for ${userEmail}`);
    } catch (toolsError) {
      console.error(`❌ Error getting tools for ${userEmail}:`, toolsError);
      
      // Provide specific error message based on the error type
      let errorMessage = `I'm having trouble accessing your Google Calendar tools. `;
      let needsSetup = true;
      
      if (toolsError.message.includes('No Google Calendar connection')) {
        errorMessage += 'It looks like your Google Calendar connection needs to be set up. Please use the "Setup Connection" button to authenticate.';
      } else if (toolsError.message.includes('No connections available')) {
        errorMessage += 'Please complete the Google Calendar authentication process first.';
      } else if (toolsError.message.includes('still initializing') || toolsError.message.includes('taking too long')) {
        errorMessage += 'Your Google Calendar connection is still being set up. Please wait a moment and try again.';
        needsSetup = false;
      } else {
        errorMessage += `Error: ${toolsError.message}`;
      }
      
      return res.json({
        success: true,
        response: {
          message: errorMessage,
          needsConnection: true,
          needsSetup: needsSetup,
          userEmail: userEmail
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // Build comprehensive context for the AI agent
    const contextInfo = [];
    if (context?.currentDate) {
      contextInfo.push(`Current date and time: ${new Date(context.currentDate).toLocaleString()}`);
    }
    if (context?.events && context.events.length > 0) {
      const todayEvents = context.events.filter(e => 
        e.date === context.currentDate?.split('T')[0]
      );
      if (todayEvents.length > 0) {
        contextInfo.push(`Today's local events: ${todayEvents.map(e => `${e.startTime} - ${e.title} (${e.category?.name || 'No category'})`).join(', ')}`);
      }
      
      // Add upcoming events for the next few days
      const upcomingEvents = context.events.filter(e => {
        const eventDate = new Date(e.date);
        const today = new Date(context.currentDate);
        const diffTime = eventDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 && diffDays <= 7;
      }).slice(0, 5);
      
      if (upcomingEvents.length > 0) {
        contextInfo.push(`Upcoming events this week: ${upcomingEvents.map(e => `${e.date} ${e.startTime} - ${e.title}`).join(', ')}`);
      }
    }
    if (context?.preferences?.focusAreas) {
      contextInfo.push(`User's focus areas: ${context.preferences.focusAreas.join(', ')}`);
    }
    if (context?.preferences?.productivityHours) {
      contextInfo.push(`User's most productive hours: ${context.preferences.productivityHours.join(', ')}`);
    }
    if (context?.preferences?.workingHours) {
      contextInfo.push(`User's working hours: ${context.preferences.workingHours.start} to ${context.preferences.workingHours.end}`);
    }
    
    const systemContext = contextInfo.length > 0 ? contextInfo.join('\n') : '';
    
    // Create comprehensive system prompt for the OpenAI agent
    const systemPrompt = `You are an intelligent calendar assistant for ${userEmail}. You have access to Google Calendar tools through Composio and can perform various calendar operations.

AVAILABLE TOOLS:
- GOOGLECALENDAR_LIST_EVENTS: Get events from Google Calendar
- GOOGLECALENDAR_CREATE_EVENT: Create new calendar events
- GOOGLECALENDAR_UPDATE_EVENT: Modify existing events
- GOOGLECALENDAR_DELETE_EVENT: Remove events
- GOOGLECALENDAR_QUICK_ADD: Create events using natural language
- GOOGLECALENDAR_FIND_FREE_TIME: Find available time slots
- GOOGLECALENDAR_GET_EVENT: Get details of a specific event
- GOOGLECALENDAR_MOVE_EVENT: Reschedule events
- GOOGLECALENDAR_LIST_CALENDARS: List available calendars

CONTEXT:
${systemContext}

INSTRUCTIONS:
1. Always be helpful, friendly, and proactive
2. When users ask about their schedule, use GOOGLECALENDAR_LIST_EVENTS to get current information
3. For creating events, prefer GOOGLECALENDAR_CREATE_EVENT for structured data or GOOGLECALENDAR_QUICK_ADD for natural language
4. When scheduling, consider the user's preferences and existing events to avoid conflicts
5. Use GOOGLECALENDAR_FIND_FREE_TIME to suggest optimal scheduling times
6. Be specific about dates and times when creating or modifying events
7. Confirm actions before performing destructive operations like deleting events
8. Provide helpful suggestions based on the user's focus areas and productivity patterns
9. If you need to check for conflicts or find free time, use the appropriate tools first
10. Always explain what you're doing and why

PERSONALITY:
- Professional but friendly
- Proactive in suggesting improvements
- Considerate of user's time and preferences
- Clear in communication about what actions you're taking

Remember: You have direct access to ${userEmail}'s Google Calendar through these tools. Use them intelligently to provide the best possible assistance.`;

    console.log(`🤖 Sending request to OpenAI agent for ${userEmail} with ${tools ? Object.keys(tools).length : 0} tools`);
    
    // Generate response using OpenAI agent with Composio tools
    const output = await generateText({
      model: openai("gpt-4o"),
      tools: tools,
      system: systemPrompt,
      prompt: message,
      maxToolRoundtrips: 5,
      temperature: 0.7,
    });
    
    console.log(`✅ OpenAI agent completed processing for ${userEmail}`);
    console.log(`📊 Tool calls made: ${output.toolCalls?.length || 0}`);
    console.log(`📋 Tool results: ${output.toolResults?.length || 0}`);
    
    // Log tool usage for debugging
    if (output.toolCalls && output.toolCalls.length > 0) {
      console.log('🔧 Tools used:');
      output.toolCalls.forEach((call, index) => {
        console.log(`  ${index + 1}. ${call.toolName} - ${call.args ? JSON.stringify(call.args).substring(0, 100) : 'no args'}...`);
      });
    }
    
    res.json({
      success: true,
      response: {
        message: output.text,
        toolCalls: output.toolCalls,
        toolResults: output.toolResults,
        userEmail: userEmail,
        toolsUsed: output.toolCalls?.length || 0,
        reasoning: output.reasoning || null
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error processing AI message:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Get user connections
app.get('/api/composio/connections', async (req, res) => {
  try {
    const connections = Array.from(userConnections.entries()).map(([userEmail, conn]) => ({
      userEmail: userEmail,
      entityId: conn.entityId,
      connectionId: conn.connectionId,
      status: conn.status,
      connectedAt: conn.connectedAt || conn.createdAt,
      redirectUrl: conn.redirectUrl,
      error: conn.error
    }));
    
    res.json({
      success: true,
      connections,
      userCount: userConnections.size,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to get connections:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Test connection for user
app.post('/api/composio/test-connection', async (req, res) => {
  try {
    const { userEmail } = req.body;
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'userEmail is required for connection test',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🧪 Testing connection for user: ${userEmail}`);
    
    const connectionStatus = await checkConnectionStatus(userEmail);
    const connectionData = userConnections.get(userEmail);
    const entityId = userEntities.get(userEmail);
    
    if (connectionStatus.status === 'active') {
      const testResult = {
        status: 'success',
        message: `Connection test successful for ${userEmail}`,
        userEmail: userEmail,
        entityId: entityId,
        connectionId: connectionData?.connectionId,
        connectionStatus: connectionStatus.status,
        toolsAvailable: connectionStatus.toolsAvailable || 0,
        features: {
          googleCalendarIntegration: 'active',
          composioTools: 'available',
          openaiAgent: 'active',
          userSpecificEntity: 'enabled'
        },
        timestamp: new Date().toISOString()
      };
      
      res.json({
        success: true,
        testResult,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: false,
        error: `Connection test failed for ${userEmail}: ${connectionStatus.message}`,
        userEmail,
        connectionData,
        connectionStatus: connectionStatus.status,
        needsSetup: connectionStatus.needsSetup,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Service statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = {
      userConnections: userConnections.size,
      userEntities: userEntities.size,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      services: {
        openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
        composio: process.env.COMPOSIO_API_KEY ? 'configured' : 'missing'
      },
      userDetails: {
        connectedUsers: Array.from(userConnections.keys()),
        entityUsers: Array.from(userEntities.keys()),
        userEntityMapping: Array.from(userEntities.entries()).map(([email, entityId]) => ({
          userEmail: email,
          entityId: entityId,
          connectionStatus: userConnections.get(email)?.status || 'unknown'
        }))
      },
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to get service stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Server Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    availableEndpoints: [
      'GET /',
      'GET /api/health',
      'POST /api/composio/setup-connection',
      'POST /api/ai/send-message',
      'GET /api/composio/connections',
      'POST /api/composio/test-connection',
      'GET /api/stats'
    ],
    note: 'This is an API server with OpenAI agent + Composio integration. Visit http://localhost:5173 for the client application.',
    userConnections: userConnections.size,
    userEntities: userEntities.size,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 SmartPlan Server with OpenAI Agent + Composio started successfully!');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 CORS enabled for: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
  console.log('');
  console.log('🔧 Configuration:');
  console.log(`  - OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`  - Composio API Key: ${process.env.COMPOSIO_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log('');
  console.log('📋 Available endpoints:');
  console.log('  GET  /');
  console.log('  GET  /api/health');
  console.log('  POST /api/composio/setup-connection');
  console.log('  POST /api/ai/send-message');
  console.log('  GET  /api/composio/connections');
  console.log('  POST /api/composio/test-connection');
  console.log('  GET  /api/stats');
  console.log('');
  console.log('✅ Server is ready to handle requests!');
  console.log('🤖 OpenAI Agent with intelligent tool selection for calendar management');
  console.log('🔐 User-specific calendar management with complete data isolation');
  console.log('🎯 Composio Google Calendar tools available to the AI agent');
  console.log('🧹 Automatic cleanup of duplicate connections');
  console.log('⏳ Smart waiting for connections to become active');
  console.log('');
  console.log('🎯 To use the application:');
  console.log('   👉 Visit: http://localhost:5173');
  console.log('   📱 This server (port 3001) is the API backend with OpenAI agent');
  console.log('   🖥️  The client app (port 5173) is the user interface');
  console.log('   🤖 Each user gets their own AI agent with Composio tools');
});

export default app;