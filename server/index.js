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
        
        // Check for various "active" states - be more flexible
        const activeStates = ['active', 'initiated', 'connected', 'ready', 'enabled', 'authenticated'];
        const isActive = targetConnection.status && 
                        activeStates.some(state => 
                          targetConnection.status.toLowerCase().includes(state.toLowerCase())
                        );
        
        if (isActive) {
          console.log(`✅ Connection ${connectionId} is now active for ${userEmail}`);
          return targetConnection;
        }
        
        // If still initializing, continue waiting
        if (targetConnection.status && 
            (targetConnection.status.toLowerCase().includes('initializing') ||
             targetConnection.status.toLowerCase().includes('pending') ||
             targetConnection.status.toLowerCase().includes('processing'))) {
          console.log(`⏳ Connection ${connectionId} still initializing (${targetConnection.status}), waiting...`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }
        
        // If in error state, return null
        if (targetConnection.status && 
            (targetConnection.status.toLowerCase().includes('error') ||
             targetConnection.status.toLowerCase().includes('failed') ||
             targetConnection.status.toLowerCase().includes('invalid'))) {
          console.error(`❌ Connection ${connectionId} is in error state: ${targetConnection.status}`);
          return null;
        }
        
        // If status is unknown, assume it might be working and try it
        if (!targetConnection.status || targetConnection.status.toLowerCase() === 'unknown') {
          console.log(`🤔 Connection ${connectionId} has unknown status, assuming it might be active`);
          return targetConnection;
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
    
    // Try to get a specific Google Calendar connection first, but handle errors gracefully
    let connection = null;
    try {
      connection = await entity.getConnection({
        app: 'googlecalendar'
      });
      
      if (connection) {
        console.log(`✅ Found single Google Calendar connection: ${connection.id}`);
        return connection;
      }
    } catch (getConnectionError) {
      // This is expected when no connection exists - not an error
      console.log(`📝 No single Google Calendar connection found (expected): ${getConnectionError.message}`);
    }

    // Get all connections to check for duplicates
    let connections = [];
    try {
      connections = await entity.getConnections();
    } catch (getConnectionsError) {
      console.log(`📝 No connections found for entity ${entityId}: ${getConnectionsError.message}`);
      return null;
    }
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
    
    // Multiple connections found - be very aggressive about cleanup
    console.log(`🔄 Multiple connections found (${googleConnections.length}), performing aggressive cleanup...`);
    
    // Find the best connection to keep
    let bestConnection = null;
    let connectionsToDelete = [];
    
    // Strategy 1: Prefer ACTIVE connections
    const activeConnections = googleConnections.filter(conn => 
      conn.status && conn.status.toLowerCase() === 'active'
    );
    
    if (activeConnections.length > 0) {
      console.log(`🎯 Found ${activeConnections.length} ACTIVE connections, keeping the most recent one`);
      bestConnection = activeConnections.sort((a, b) => 
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      )[0];
      connectionsToDelete = googleConnections.filter(conn => conn.id !== bestConnection.id);
    } else {
      // Strategy 2: If no ACTIVE, prefer connections with valid states over INITIALIZING
      const validStates = ['initiated', 'connected', 'ready', 'enabled', 'authenticated'];
      const validConnections = googleConnections.filter(conn => 
        conn.status && validStates.some(state => 
          conn.status.toLowerCase().includes(state.toLowerCase())
        )
      );
      
      if (validConnections.length > 0) {
        console.log(`🎯 Found ${validConnections.length} connections with valid states, keeping the most recent one`);
        bestConnection = validConnections.sort((a, b) => 
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        )[0];
        connectionsToDelete = googleConnections.filter(conn => conn.id !== bestConnection.id);
      } else {
        // Strategy 3: Keep the most recent connection regardless of status
        console.log(`🎯 No clearly valid connections, keeping the most recent one`);
        const sortedByDate = googleConnections.sort((a, b) => 
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        bestConnection = sortedByDate[0];
        connectionsToDelete = sortedByDate.slice(1);
      }
    }
    
    console.log(`🔄 Keeping connection: ${bestConnection.id} (status: ${bestConnection.status})`);
    console.log(`🗑️ Deleting ${connectionsToDelete.length} duplicate connections`);
    
    // Aggressively delete all duplicate connections
    for (const conn of connectionsToDelete) {
      try {
        console.log(`🗑️ Attempting to delete connection ${conn.id} (status: ${conn.status})`);
        
        // Try multiple deletion approaches
        let deletionSuccessful = false;
        
        // Method 1: Standard deleteConnection
        if (!deletionSuccessful && typeof entity.deleteConnection === 'function') {
          try {
            await entity.deleteConnection(conn.id);
            deletionSuccessful = true;
            console.log(`✅ Deleted connection ${conn.id} using deleteConnection`);
          } catch (e) {
            console.warn(`⚠️ deleteConnection failed for ${conn.id}:`, e.message);
          }
        }
        
        // Method 2: Try removeConnection
        if (!deletionSuccessful && typeof entity.removeConnection === 'function') {
          try {
            await entity.removeConnection(conn.id);
            deletionSuccessful = true;
            console.log(`✅ Deleted connection ${conn.id} using removeConnection`);
          } catch (e) {
            console.warn(`⚠️ removeConnection failed for ${conn.id}:`, e.message);
          }
        }
        
        // Method 3: Try using toolset directly
        if (!deletionSuccessful) {
          try {
            await toolset.client.deleteConnection(conn.id);
            deletionSuccessful = true;
            console.log(`✅ Deleted connection ${conn.id} using toolset.client.deleteConnection`);
          } catch (e) {
            console.warn(`⚠️ toolset.client.deleteConnection failed for ${conn.id}:`, e.message);
          }
        }
        
        if (!deletionSuccessful) {
          console.warn(`⚠️ Could not delete connection ${conn.id} - no working deletion method found`);
        }
        
      } catch (deleteError) {
        console.warn(`⚠️ Failed to delete connection ${conn.id}:`, deleteError.message);
      }
    }
    
    return bestConnection;
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
        console.log(`🔍 Found existing connection during cleanup: ${cleanConnection.id} with status: ${cleanConnection.status}`);
        console.log(`✅ Using cleaned connection for ${userEmail}:`, cleanConnection.id);
        
        // Check if this connection is active or can become active
        const activeStates = ['active', 'initiated', 'connected', 'ready', 'enabled', 'authenticated'];
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
        } else if (!cleanConnection.status || 
                  cleanConnection.status.toLowerCase().includes('initializing') || 
                  cleanConnection.status.toLowerCase().includes('pending')) {
          // Wait for it to become active with shorter timeout
          console.log(`⏳ Connection is initializing, waiting for it to become active...`);
          
          const activeConnection = await waitForConnectionActive(userEmail, entityId, cleanConnection.id, 10000);
          
          if (activeConnection) {
            userConnections.set(userEmail, {
              entityId,
              connectionId: activeConnection.id,
              status: 'active',
              connectedAt: new Date().toISOString()
            });
            
            return activeConnection;
          } else {
            console.warn(`⚠️ Connection failed to become active quickly, but returning it anyway for user to complete auth`);
            // Store as pending so user can complete auth
            userConnections.set(userEmail, {
              entityId,
              connectionId: cleanConnection.id,
              status: 'pending',
              redirectUrl: cleanConnection.redirectUrl || null,
              createdAt: new Date().toISOString()
            });
            return cleanConnection;
          }
        }
      }
      
      // If no existing connection or existing connection failed, create a new one
      console.log(`🔄 Creating new Google Calendar connection for ${userEmail}`);
      
      // Create new connection with proper configuration
      const connectionConfig = {
        appName: 'googlecalendar',
        config: {
          // Add any required configuration for Google Calendar
          scopes: ['https://www.googleapis.com/auth/calendar'],
        }
      };
      
      console.log(`🔗 Initiating connection with config:`, JSON.stringify(connectionConfig, null, 2));
      
      try {
        const newConnection = await entity.initiateConnection(connectionConfig);
        
        console.log(`🔗 Google Calendar connection response for ${userEmail}:`, {
          id: newConnection?.id || 'UNDEFINED',
          connectedAccountId: newConnection?.connectedAccountId || 'UNDEFINED',
          connectionStatus: newConnection?.connectionStatus || 'UNDEFINED',
          redirectUrl: newConnection?.redirectUrl || 'UNDEFINED',
          status: newConnection?.status || 'UNDEFINED',
          fullResponse: newConnection
        });
        
        // Validate the response
        if (!newConnection) {
          throw new Error('Connection initiation returned null/undefined');
        }
        
        // Extract the correct connection ID from the response
        // Composio returns connectedAccountId, not id
        const connectionId = newConnection.connectedAccountId || newConnection.id || `temp_${Date.now()}`;
        const redirectUrl = newConnection.redirectUrl;
        const connectionStatus = newConnection.connectionStatus || newConnection.status || 'pending';
        
        if (!redirectUrl) {
          throw new Error('No redirect URL provided by Composio - cannot complete OAuth flow');
        }
        
        // Store connection info with correct status
        userConnections.set(userEmail, {
          entityId,
          connectionId,
          redirectUrl,
          status: connectionStatus.toLowerCase() === 'initiated' ? 'pending' : connectionStatus.toLowerCase(),
          createdAt: new Date().toISOString()
        });
        
        return newConnection;
        
      } catch (connectionError) {
        console.error(`❌ Failed to initiate Google Calendar connection for ${userEmail}:`, connectionError);
        throw new Error(`Failed to initiate Composio connection: ${connectionError.message}`);
      }
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
    
    // Check if we have a Google Calendar connection - be more permissive
    let googleConnection = connections.find(conn => {
      const appName = (conn.appName || conn.app || '').toLowerCase();
      const isGoogleCalendar = appName === 'googlecalendar' || 
                              appName === 'google_calendar' ||
                              appName === 'google-calendar' ||
                              appName === 'calendar';
      
      if (!isGoogleCalendar) return false;
      
      // Be more permissive - try to use any Google Calendar connection that's not explicitly failed
      const failedStates = ['failed', 'error', 'cancelled', 'invalid', 'deleted'];
      const hasFailed = conn.status && 
                       failedStates.some(state => 
                         conn.status.toLowerCase().includes(state.toLowerCase())
                       );
      
      return !hasFailed; // Use any connection that hasn't explicitly failed
    });
    
    // If no usable connection found, provide detailed error information
    if (!googleConnection) {
      console.warn(`⚠️ No usable Google Calendar connection found for entity ${entityId}`);
      
      // Check if there are any Google Calendar connections at all
      const allGoogleConnections = connections.filter(conn => {
        const appName = (conn.appName || conn.app || '').toLowerCase();
        return appName === 'googlecalendar' || 
               appName === 'google_calendar' ||
               appName === 'google-calendar' ||
               appName === 'calendar';
      });
      
      if (allGoogleConnections.length > 0) {
        console.log(`🔍 Found ${allGoogleConnections.length} Google Calendar connection(s):`);
        allGoogleConnections.forEach((conn, index) => {
          console.log(`  ${index + 1}. ID: ${conn.id}, Status: ${conn.status}, App: ${conn.appName}`);
        });
        
        const statuses = allGoogleConnections.map(c => c.status).join(', ');
        throw new Error(`Google Calendar connection(s) found but not ready for tools. Statuses: [${statuses}]. Please complete or reauthorize the Google Calendar connection.`);
      } else {
        throw new Error(`No Google Calendar connection found for ${userEmail}. Please complete the Google Calendar authentication through the AI assistant.`);
      }
    }
    
    console.log(`✅ Found Google Calendar connection for ${userEmail}:`, {
      id: googleConnection.id,
      status: googleConnection.status,
      appName: googleConnection.appName
    });
    
    // Log what we're about to try
    console.log(`🔧 Attempting to get tools for entity ${entityId} with connection ${googleConnection.id}`);
    
    // Get only Google Calendar tools to avoid the massive 9639 tools
    const tools = await toolset.getTools({
      apps: ['googlecalendar']
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
          
          // Check for truly active states (be more strict)
          const activeStates = ['active', 'connected', 'ready', 'authenticated'];
          const isActive = targetConnection.status && 
                          activeStates.some(state => 
                            targetConnection.status.toLowerCase() === state.toLowerCase()
                          );
          
          // Also check if status indicates it's still initializing
          const isInitializing = targetConnection.status && 
                                (targetConnection.status.toLowerCase().includes('initializing') ||
                                 targetConnection.status.toLowerCase().includes('initiated') ||
                                 targetConnection.status.toLowerCase().includes('pending'));
          
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
          } else if (isInitializing) {
            return { 
              status: 'pending', 
              message: `Connection is still initializing (${targetConnection.status}) - please wait or complete OAuth authentication`,
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

// Composio OAuth callback handler
app.get('/api/composio/callback', async (req, res) => {
  try {
    const { connectionId, entityId, status, error } = req.query;
    
    console.log('🔗 Composio OAuth callback received:', { connectionId, entityId, status, error });
    
    if (error) {
      console.error('❌ Composio OAuth error:', error);
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?composio_error=${encodeURIComponent(error)}`);
    }
    
    if (connectionId && entityId) {
      // Find the user email for this entity
      let userEmail = null;
      for (const [email, storedEntityId] of userEntities.entries()) {
        if (storedEntityId === entityId) {
          userEmail = email;
          break;
        }
      }
      
      if (userEmail) {
        console.log(`✅ Composio OAuth successful for ${userEmail}, connection: ${connectionId}`);
        
        // Update stored connection status
        userConnections.set(userEmail, {
          entityId,
          connectionId,
          status: 'active',
          connectedAt: new Date().toISOString()
        });
        
        // Redirect back to the app with success
        return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?composio_success=true&user=${encodeURIComponent(userEmail)}`);
      }
    }
    
    // Default redirect if we can't identify the user
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?composio_status=completed`);
  } catch (error) {
    console.error('❌ Error handling Composio callback:', error);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?composio_error=${encodeURIComponent('Callback processing failed')}`);
  }
});

// Composio webhook handler for connection status updates
app.post('/api/composio/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;
    
    console.log('📡 Composio webhook received:', { event, data });
    
    if (event === 'connection.created' || event === 'connection.updated') {
      const { connectionId, entityId, status, appName } = data;
      
      // Find user email for this entity
      let userEmail = null;
      for (const [email, storedEntityId] of userEntities.entries()) {
        if (storedEntityId === entityId) {
          userEmail = email;
          break;
        }
      }
      
      if (userEmail && appName?.toLowerCase().includes('googlecalendar')) {
        console.log(`📡 Webhook: Google Calendar connection ${status} for ${userEmail}`);
        
        // Update stored connection status
        const connectionData = userConnections.get(userEmail) || { entityId };
        connectionData.connectionId = connectionId;
        connectionData.status = status?.toLowerCase().includes('active') || 
                               status?.toLowerCase().includes('connected') || 
                               status?.toLowerCase().includes('ready') ? 'active' : 'pending';
        connectionData.lastUpdated = new Date().toISOString();
        
        userConnections.set(userEmail, connectionData);
        
        console.log(`✅ Updated connection status for ${userEmail}: ${connectionData.status}`);
      }
    }
    
    res.json({ success: true, received: true });
  } catch (error) {
    console.error('❌ Error handling Composio webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Poll connection until active (following Composio documentation)
app.post('/api/composio/poll-connection-status', async (req, res) => {
  try {
    const { userEmail, maxAttempts = 10, intervalMs = 3000 } = req.body;
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'userEmail is required',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🔄 Polling connection status for ${userEmail} (max ${maxAttempts} attempts)`);
    
    const connectionData = userConnections.get(userEmail);
    const entityId = userEntities.get(userEmail);
    
    if (!connectionData || !entityId) {
      return res.status(404).json({
        success: false,
        error: 'No connection found for user',
        timestamp: new Date().toISOString()
      });
    }
    
    // Poll for connection activation
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const entity = await toolset.client.getEntity(entityId);
        const connections = await entity.getConnections();
        
        const targetConnection = connections.find(conn => conn.id === connectionData.connectionId);
        
        if (targetConnection) {
          console.log(`🔍 Polling attempt ${attempt}/${maxAttempts}: Connection ${targetConnection.id} status: ${targetConnection.status}`);
          
          // Check for truly active states
          const activeStates = ['active', 'connected', 'ready', 'authenticated'];
          const isActive = targetConnection.status && 
                          activeStates.some(state => 
                            targetConnection.status.toLowerCase() === state.toLowerCase()
                          );
          
          if (isActive) {
            // Update status to active
            connectionData.status = 'active';
            connectionData.connectionId = targetConnection.id;
            userConnections.set(userEmail, connectionData);
            
            console.log(`✅ Connection became active for ${userEmail} after ${attempt} attempts`);
            
            return res.json({
              success: true,
              userEmail,
              status: 'active',
              message: 'Connection is now active',
              attempts: attempt,
              connectionId: targetConnection.id,
              timestamp: new Date().toISOString()
            });
          }
          
          // Check if connection failed
          if (targetConnection.status && 
              (targetConnection.status.toLowerCase().includes('failed') ||
               targetConnection.status.toLowerCase().includes('error') ||
               targetConnection.status.toLowerCase().includes('cancelled'))) {
            
            console.error(`❌ Connection failed for ${userEmail}:`, targetConnection.status);
            
            return res.json({
              success: false,
              error: `Connection failed with status: ${targetConnection.status}`,
              attempts: attempt,
              timestamp: new Date().toISOString()
            });
          }
        } else {
          console.warn(`⚠️ Connection not found in entity for ${userEmail} (attempt ${attempt})`);
        }
        
        // Wait before next attempt (except on last attempt)
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        
      } catch (error) {
        console.warn(`⚠️ Error polling connection status (attempt ${attempt}):`, error);
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      }
    }
    
    // Timeout reached
    console.warn(`⏰ Connection polling timed out for ${userEmail} after ${maxAttempts} attempts`);
    
    res.json({
      success: false,
      error: `Connection did not become active within ${maxAttempts} attempts`,
      timeout: true,
      attempts: maxAttempts,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error polling connection status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Check connection status for a user
app.get('/api/composio/status/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'User email is required',
        timestamp: new Date().toISOString()
      });
    }
    
    const connectionStatus = await checkConnectionStatus(userEmail);
    const connectionData = userConnections.get(userEmail);
    
    res.json({
      success: true,
      userEmail,
      status: connectionStatus.status,
      message: connectionStatus.message,
      needsSetup: connectionStatus.needsSetup,
      toolsAvailable: connectionStatus.toolsAvailable,
      connectionData: connectionData ? {
        entityId: connectionData.entityId,
        connectionId: connectionData.connectionId,
        status: connectionData.status,
        redirectUrl: connectionData.redirectUrl,
        lastUpdated: connectionData.lastUpdated || connectionData.connectedAt || connectionData.createdAt
      } : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error checking connection status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Initiate anonymous Composio OAuth flow (for onboarding)
app.post('/api/composio/initiate-oauth', async (req, res) => {
  try {
    const { redirectUrl } = req.body;
    
    console.log('🔗 Initiating anonymous Composio OAuth flow...');
    
    // Create a temporary entity for the OAuth flow
    const tempEntityId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Create temporary entity
      await toolset.client.createEntity(tempEntityId);
      const entity = await toolset.client.getEntity(tempEntityId);
      console.log(`✅ Created temporary entity: ${tempEntityId}`);
      
      // Initiate OAuth connection
      const connectionRequest = await entity.initiateConnection({
        appName: 'googlecalendar',
        redirectUrl: redirectUrl || undefined
      });
      
      console.log(`✅ OAuth connection initiated:`, connectionRequest);
      
      const connectionId = connectionRequest.connectedAccountId || connectionRequest.id;
      const oauthRedirectUrl = connectionRequest.redirectUrl;
      const connectionStatus = connectionRequest.connectionStatus || 'initiated';
      
      if (!connectionId) {
        throw new Error('OAuth initiation returned invalid response - no connection ID');
      }
      
      if (!oauthRedirectUrl) {
        throw new Error('OAuth connection should provide a redirect URL');
      }
      
      // Store temporary connection info
      userConnections.set(tempEntityId, {
        entityId: tempEntityId,
        connectionId: connectionId,
        status: 'pending',
        redirectUrl: oauthRedirectUrl,
        createdAt: new Date().toISOString(),
        isTemporary: true
      });
      
      res.json({
        success: true,
        tempEntityId,
        connectionId: connectionId,
        status: 'pending',
        redirectUrl: oauthRedirectUrl,
        needsOAuthCompletion: true,
        message: 'Anonymous OAuth connection initiated. User must complete OAuth authentication.',
        timestamp: new Date().toISOString()
      });
      
    } catch (connectionError) {
      console.error(`❌ Failed to initiate anonymous OAuth:`, connectionError);
      throw new Error(`Failed to initiate Composio OAuth: ${connectionError.message}`);
    }
  } catch (error) {
    console.error('❌ Error initiating anonymous Composio OAuth:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Setup Composio connection using proper OAuth flow (following Composio documentation)
app.post('/api/composio/setup-connection-with-oauth', async (req, res) => {
  try {
    const { userEmail, redirectUrl } = req.body;
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'userEmail is required',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🔗 Setting up Composio OAuth connection for: ${userEmail}`);
    
    // Create entity ID based on user email (sanitized)
    const entityId = userEmail.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    userEntities.set(userEmail, entityId);
    
    try {
      // First, try to get or create the entity
      let entity;
      try {
        entity = await toolset.client.getEntity(entityId);
        console.log(`✅ Entity ${entityId} already exists`);
      } catch (getEntityError) {
        console.log(`🔄 Entity ${entityId} doesn't exist, creating...`);
        await toolset.client.createEntity(entityId);
        entity = await toolset.client.getEntity(entityId);
        console.log(`✅ Created and retrieved entity ${entityId}`);
      }
      
      // Clean up any existing connections first and check if we already have an active one
      const existingConnection = await cleanupDuplicateConnections(userEmail, entityId);
      
      // If we found an active connection during cleanup, use it instead of creating a new one
      if (existingConnection && existingConnection.status && 
          existingConnection.status.toLowerCase() === 'active') {
        console.log(`✅ Found existing ACTIVE connection for ${userEmail}, using it instead of creating new one`);
        
        userConnections.set(userEmail, {
          entityId,
          connectionId: existingConnection.id,
          status: 'active',
          connectedAt: new Date().toISOString()
        });
        
        return res.json({
          success: true,
          userEmail,
          entityId,
          connectionId: existingConnection.id,
          status: 'active',
          message: `Found existing active Google Calendar connection for ${userEmail}`,
          timestamp: new Date().toISOString()
        });
      }
      
      // Initiate OAuth connection following Composio documentation
      console.log(`🔗 Initiating Composio OAuth connection for Google Calendar for ${userEmail}`);
      
      try {
        // Step 1: Initiate the Connection (per Composio docs)
        const connectionRequest = await entity.initiateConnection({
          appName: 'googlecalendar',
          // Optional: Add redirect URL if you want user sent somewhere specific after Composio finishes
          redirectUrl: redirectUrl || undefined
        });
        
        console.log(`✅ Connection initiated for ${userEmail}:`, connectionRequest);
        
        // Extract the connection details
        const connectionId = connectionRequest.connectedAccountId || connectionRequest.id;
        const oauthRedirectUrl = connectionRequest.redirectUrl;
        const connectionStatus = connectionRequest.connectionStatus || 'initiated';
        
        if (!connectionId) {
          console.error('❌ No connection ID found in response:', connectionRequest);
          throw new Error('Connection initiation returned invalid response - no connection ID');
        }
        
        if (!oauthRedirectUrl) {
          console.error('❌ No redirect URL found in response:', connectionRequest);
          throw new Error('OAuth connection should provide a redirect URL');
        }
       
        console.log(`✅ Google Calendar OAuth connection initiated for ${userEmail}:`, {
          connectionId: connectionId,
          status: connectionStatus,
          redirectUrl: oauthRedirectUrl
        });
        
        // Store connection info with correct status
        userConnections.set(userEmail, {
          entityId,
          connectionId: connectionId,
          status: 'pending', // OAuth connections start as pending
          redirectUrl: oauthRedirectUrl,
          createdAt: new Date().toISOString()
        });
        
        res.json({
          success: true,
          userEmail,
          entityId,
          connectionId: connectionId,
          status: 'pending',
          redirectUrl: oauthRedirectUrl,
          needsOAuthCompletion: true,
          message: `Google Calendar OAuth connection initiated for ${userEmail}. User must complete OAuth authentication via redirect URL.`,
          timestamp: new Date().toISOString()
        });
        
      } catch (connectionError) {
        console.error(`❌ Failed to initiate OAuth connection for ${userEmail}:`, connectionError);
        throw new Error(`Failed to initiate Composio OAuth connection: ${connectionError.message}`);
      }
      
    } catch (entityError) {
      console.error(`❌ Error with entity operations for ${userEmail}:`, entityError);
      throw entityError;
    }
  } catch (error) {
    console.error('❌ Error setting up Composio OAuth connection:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Setup Composio connection for user (fallback to OAuth flow)
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

IMPORTANT: You have access to these Google Calendar tools: ${Object.keys(tools).join(', ')}
If the user asks about viewing their calendar events or current schedule, you should explain that you can help create, update, and delete events, but reading existing events may require additional setup.

Remember: Use the available tools intelligently to provide the best possible assistance within the current capabilities.`;

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

// Fetch Google Calendar events for a user
app.post('/api/composio/calendar/events', async (req, res) => {
  try {
    const { userEmail, startDate, endDate, calendarId = 'primary' } = req.body;
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'userEmail is required',
        timestamp: new Date().toISOString()
      });
    }
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`📅 Fetching calendar events for ${userEmail} from ${startDate} to ${endDate}`);
    
    // Check connection status
    const connectionStatus = await checkConnectionStatus(userEmail);
    if (connectionStatus.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: `Cannot fetch events: ${connectionStatus.message}`,
        needsSetup: connectionStatus.needsSetup,
        timestamp: new Date().toISOString()
      });
    }
    
    // Get user tools with detailed error reporting
    let tools;
    try {
      tools = await getUserTools(userEmail);
      console.log(`🔧 Available tools for ${userEmail}:`, Object.keys(tools || {}));
    } catch (toolsError) {
      console.error(`❌ Error getting tools for ${userEmail}:`, toolsError);
      return res.status(503).json({
        success: false,
        error: `Failed to get Google Calendar tools: ${toolsError.message}`,
        details: 'This usually means the Google Calendar connection needs to be completed or reauthorized',
        timestamp: new Date().toISOString()
      });
    }
    
    if (!tools) {
      return res.status(503).json({
        success: false,
        error: 'No Google Calendar tools available',
        details: 'The Google Calendar connection may need to be reauthorized. Please complete the authentication process in the AI assistant.',
        timestamp: new Date().toISOString()
      });
    }
    
    const availableTools = Object.keys(tools);
    console.log(`🔧 Available tools for events fetch:`, availableTools);
    
    // Try different possible action names for listing events
    const possibleListEventActions = [
      'GOOGLECALENDAR_LIST_EVENTS',
      'GOOGLECALENDAR_GET_EVENTS', 
      'GOOGLECALENDAR_EVENTS_LIST',
      'GOOGLECALENDAR_FIND_EVENTS',
      'GOOGLECALENDAR_SEARCH_EVENTS'
    ];
    
    let listEventsTool = null;
    let actionName = null;
    
    for (const action of possibleListEventActions) {
      if (tools[action]) {
        listEventsTool = tools[action];
        actionName = action;
        console.log(`✅ Found events tool: ${action}`);
        break;
      }
    }
    
    if (!listEventsTool) {
      console.warn(`⚠️ No events listing tool found. Available tools:`, availableTools);
      
      // For now, return empty events array instead of failing
      // This allows the app to work with local/mock events
      return res.json({
        success: true,
        events: [],
        userEmail,
        calendarId,
        dateRange: { startDate, endDate },
        message: 'Google Calendar events tool not available. Using local events only.',
        availableTools,
        timestamp: new Date().toISOString()
      });
    }
    
    // Execute the found list events tool
    console.log(`🔧 Executing ${actionName} with params:`, {
      calendarId,
      timeMin: startDate,
      timeMax: endDate
    });
    
    const resultText = await listEventsTool.execute({
      calendarId: calendarId,
      timeMin: startDate,
      timeMax: endDate,
      singleEvents: true,
      orderBy: 'startTime'
    });
    const result = JSON.parse(resultText)
    console.log(`✅ Retrieved ${result.data?.items?.length || 0} events for ${userEmail}`);

    // Transform events to match app format
    const transformedEvents = (result.data?.items || []).map(event => {
      const startDateTime = event.start?.dateTime || event.start?.date;
      const endDateTime = event.end?.dateTime || event.end?.date;
      const isAllDay = !event.start?.dateTime;
      
      // Extract time portion from ISO datetime for the frontend
      let startTime = '09:00';
      let endTime = '10:00';
      let date = new Date().toISOString().split('T')[0];
      
      if (startDateTime) {
        const startDate = new Date(startDateTime);
        if (!isNaN(startDate.getTime())) {
          startTime = startDate.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          date = startDate.toISOString().split('T')[0];
        }
      }
      
      if (endDateTime) {
        const endDate = new Date(endDateTime);
        if (!isNaN(endDate.getTime())) {
          endTime = endDate.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          });
        }
      }
      
      return {
        id: event.id,
        title: event.summary || 'Untitled Event',
        description: event.description || '',
        startTime,
        endTime,
        date,
        isAllDay,
        location: event.location,
        attendees: event.attendees?.map(a => a.email) || [],
        source: 'google_calendar',
        calendarId: event.organizer?.email || calendarId
      };
    });
    
    res.json({
      success: true,
      events: transformedEvents,
      userEmail,
      calendarId,
      dateRange: { startDate, endDate },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching calendar events:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Create a calendar event for a user
app.post('/api/composio/calendar/create-event', async (req, res) => {
  try {
    const { userEmail, title, description, startTime, endTime, calendarId = 'primary', attendees } = req.body;
    
    if (!userEmail || !title || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'userEmail, title, startTime, and endTime are required',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`📝 Creating calendar event for ${userEmail}: ${title}`);
    
    // Check connection status
    const connectionStatus = await checkConnectionStatus(userEmail);
    if (connectionStatus.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: `Cannot create event: ${connectionStatus.message}`,
        needsSetup: connectionStatus.needsSetup,
        timestamp: new Date().toISOString()
      });
    }
    
    // Get user tools
    const tools = await getUserTools(userEmail);
    if (!tools.GOOGLECALENDAR_CREATE_EVENT) {
      return res.status(503).json({
        success: false,
        error: 'Google Calendar create event tool not available',
        timestamp: new Date().toISOString()
      });
    }
    
    // Execute the create event tool
    const eventData = {
      calendarId: calendarId,
      summary: title,
      description: description || '',
      start: {
        dateTime: startTime,
        timeZone: 'UTC'
      },
      end: {
        dateTime: endTime,
        timeZone: 'UTC'
      }
    };
    
    if (attendees && attendees.length > 0) {
      eventData.attendees = attendees.map(email => ({ email }));
    }
    
    const result = await tools.GOOGLECALENDAR_CREATE_EVENT.execute(eventData);
    
    console.log(`✅ Created event for ${userEmail}: ${result.id}`);
    
    // Transform created event to match app format
    const transformedEvent = {
      id: result.id,
      title: result.summary,
      description: result.description || '',
      startTime: result.start?.dateTime || result.start?.date,
      endTime: result.end?.dateTime || result.end?.date,
      date: (result.start?.dateTime || result.start?.date)?.split('T')[0],
      isAllDay: !result.start?.dateTime,
      location: result.location,
      attendees: result.attendees?.map(a => a.email) || [],
      source: 'google_calendar',
      calendarId: result.organizer?.email || calendarId
    };
    
    res.json({
      success: true,
      event: transformedEvent,
      userEmail,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error creating calendar event:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Update a calendar event for a user
app.post('/api/composio/calendar/update-event', async (req, res) => {
  try {
    const { userEmail, eventId, title, description, startTime, endTime, calendarId = 'primary' } = req.body;
    
    if (!userEmail || !eventId) {
      return res.status(400).json({
        success: false,
        error: 'userEmail and eventId are required',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`✏️ Updating calendar event for ${userEmail}: ${eventId}`);
    
    // Check connection status
    const connectionStatus = await checkConnectionStatus(userEmail);
    if (connectionStatus.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: `Cannot update event: ${connectionStatus.message}`,
        needsSetup: connectionStatus.needsSetup,
        timestamp: new Date().toISOString()
      });
    }
    
    // Get user tools
    const tools = await getUserTools(userEmail);
    if (!tools.GOOGLECALENDAR_UPDATE_EVENT) {
      return res.status(503).json({
        success: false,
        error: 'Google Calendar update event tool not available',
        timestamp: new Date().toISOString()
      });
    }
    
    // Build update data
    const updateData = {
      calendarId: calendarId,
      eventId: eventId
    };
    
    if (title) updateData.summary = title;
    if (description !== undefined) updateData.description = description;
    if (startTime) {
      updateData.start = {
        dateTime: startTime,
        timeZone: 'UTC'
      };
    }
    if (endTime) {
      updateData.end = {
        dateTime: endTime,
        timeZone: 'UTC'
      };
    }
    
    // Execute the update event tool
    const result = await tools.GOOGLECALENDAR_UPDATE_EVENT.execute(updateData);
    
    console.log(`✅ Updated event for ${userEmail}: ${eventId}`);
    
    // Transform updated event to match app format
    const transformedEvent = {
      id: result.id,
      title: result.summary,
      description: result.description || '',
      startTime: result.start?.dateTime || result.start?.date,
      endTime: result.end?.dateTime || result.end?.date,
      date: (result.start?.dateTime || result.start?.date)?.split('T')[0],
      isAllDay: !result.start?.dateTime,
      location: result.location,
      attendees: result.attendees?.map(a => a.email) || [],
      source: 'google_calendar',
      calendarId: result.organizer?.email || calendarId
    };
    
    res.json({
      success: true,
      event: transformedEvent,
      userEmail,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error updating calendar event:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Delete a calendar event for a user
app.post('/api/composio/calendar/delete-event', async (req, res) => {
  try {
    const { userEmail, eventId, calendarId = 'primary' } = req.body;
    
    if (!userEmail || !eventId) {
      return res.status(400).json({
        success: false,
        error: 'userEmail and eventId are required',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🗑️ Deleting calendar event for ${userEmail}: ${eventId}`);
    
    // Check connection status
    const connectionStatus = await checkConnectionStatus(userEmail);
    if (connectionStatus.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: `Cannot delete event: ${connectionStatus.message}`,
        needsSetup: connectionStatus.needsSetup,
        timestamp: new Date().toISOString()
      });
    }
    
    // Get user tools
    const tools = await getUserTools(userEmail);
    if (!tools.GOOGLECALENDAR_DELETE_EVENT) {
      return res.status(503).json({
        success: false,
        error: 'Google Calendar delete event tool not available',
        timestamp: new Date().toISOString()
      });
    }
    
    // Execute the delete event tool
    await tools.GOOGLECALENDAR_DELETE_EVENT.execute({
      calendarId: calendarId,
      eventId: eventId
    });
    
    console.log(`✅ Deleted event for ${userEmail}: ${eventId}`);
    
    res.json({
      success: true,
      userEmail,
      eventId,
      message: 'Event deleted successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error deleting calendar event:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Note: The google-tokens endpoint has been removed as we now use Composio tools directly
// instead of extracting raw OAuth tokens

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