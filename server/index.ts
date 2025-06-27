import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

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

// Simple in-memory storage for user connections
const userConnections = new Map();
const userAgents = new Map();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    services: {
      letta: 'available',
      composio: 'simulated'
    }
  });
});

// User Google Account connection endpoint
app.post('/api/user/connect-google-calendar', async (req, res) => {
  try {
    const { userEmail, accessToken, refreshToken, expiresIn } = req.body;
    
    if (!userEmail || !accessToken) {
      return res.status(400).json({ 
        success: false,
        error: 'userEmail and accessToken are required',
        timestamp: new Date().toISOString()
      });
    }

    console.log('🔗 Connecting user Google Calendar:', userEmail);
    
    // Store user connection
    const connectionId = `conn_${userEmail}_${Date.now()}`;
    userConnections.set(userEmail, {
      connectionId,
      accessToken,
      refreshToken,
      expiresAt: Date.now() + (expiresIn || 3600) * 1000,
      status: 'active'
    });

    // Create/assign agent for user
    const agentId = `agent_${userEmail}_${Date.now()}`;
    userAgents.set(userEmail, agentId);
    
    console.log('✅ User Google Calendar connected:', { userEmail, connectionId, agentId });
    
    res.json({
      success: true,
      agentId,
      message: `Google Calendar connected successfully for ${userEmail}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to connect user Google Calendar:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Letta endpoints
app.post('/api/letta/health-check', async (req, res) => {
  try {
    const { userEmail } = req.body;
    
    // Simple health check
    const hasConnection = userConnections.has(userEmail);
    const agentId = userAgents.get(userEmail);
    
    console.log('🏥 Letta health check:', { userEmail, hasConnection, agentId });
    
    res.json({ 
      healthy: true,
      agentId: agentId || null,
      hasGoogleCalendar: hasConnection,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Letta health check failed:', error);
    res.status(500).json({ 
      healthy: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/letta/send-message', async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const userEmail = context?.userEmail || 'anonymous';
    const hasGoogleCalendar = userConnections.has(userEmail);
    
    console.log('💬 Processing message:', { 
      userEmail, 
      messageLength: message.length,
      hasGoogleCalendar 
    });

    // Simulate AI response
    let aiResponse = `I received your message: "${message}". `;
    
    if (hasGoogleCalendar) {
      aiResponse += "Since your Google Calendar is connected, I can help you create, update, and manage events directly in your calendar. ";
    } else {
      aiResponse += "To enable full Google Calendar integration, please connect your Google Calendar first. ";
    }
    
    if (message.toLowerCase().includes('schedule') || message.toLowerCase().includes('create')) {
      aiResponse += "I can help you schedule that! Would you like me to create a calendar event?";
    } else if (message.toLowerCase().includes('today') || message.toLowerCase().includes('schedule')) {
      aiResponse += "Let me help you with your schedule planning.";
    } else {
      aiResponse += "How can I help you manage your calendar today?";
    }
    
    res.json({
      success: true,
      response: {
        message: aiResponse,
        suggestions: [],
        events: [],
        action: undefined
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Letta send message failed:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/letta/generate-suggestions', async (req, res) => {
  try {
    const { events, preferences, currentDate, userEmail } = req.body;
    
    console.log('💡 Generating suggestions:', { 
      userEmail, 
      eventsCount: events?.length || 0,
      hasPreferences: !!preferences 
    });
    
    // Simulate suggestions
    const suggestions = [
      {
        id: `suggestion_${Date.now()}_1`,
        type: 'schedule',
        title: 'Morning Focus Session',
        description: 'Schedule a focused work session during your productive hours',
        action: 'create_event',
        priority: 1,
        createdAt: new Date().toISOString()
      },
      {
        id: `suggestion_${Date.now()}_2`,
        type: 'break',
        title: 'Take a Break',
        description: 'Add a 15-minute break between your meetings',
        action: 'schedule_break',
        priority: 2,
        createdAt: new Date().toISOString()
      }
    ];
    
    res.json({
      success: true,
      suggestions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Letta generate suggestions failed:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Composio endpoints (simulated)
app.post('/api/composio/connect-google-calendar', async (req, res) => {
  try {
    console.log('🔄 Simulating Google Calendar connection via Composio...');
    
    const connectionId = `composio_conn_${Date.now()}`;
    const redirectUrl = `https://accounts.google.com/oauth/authorize?client_id=example&redirect_uri=http://localhost:3001/callback&response_type=code&scope=https://www.googleapis.com/auth/calendar`;
    
    console.log('✅ Simulated Google Calendar connection initiated');
    console.log(`🔗 Redirect URL: ${redirectUrl}`);
    
    res.json({
      success: true,
      redirectUrl: redirectUrl,
      connectionId: connectionId,
      message: 'Google Calendar connection initiated (simulated). Use the redirect URL to authenticate.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Composio Google Calendar connection failed:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/composio/connections', async (req, res) => {
  try {
    const connections = Array.from(userConnections.entries()).map(([userEmail, conn]) => ({
      id: conn.connectionId,
      userEmail: userEmail,
      status: conn.status,
      expiresAt: new Date(conn.expiresAt).toISOString()
    }));
    
    res.json({
      success: true,
      connections,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to get Composio connections:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/composio/test-connection', async (req, res) => {
  try {
    const testResult = {
      status: 'success',
      message: 'Composio service is simulated and working',
      userConnections: userConnections.size,
      userAgents: userAgents.size,
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      testResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Composio connection test failed:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Service statistics endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const stats = {
      userConnections: userConnections.size,
      userAgents: userAgents.size,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
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
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 Server started successfully!');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 CORS enabled for: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
  console.log('');
  console.log('📋 Available endpoints:');
  console.log('  GET  /api/health');
  console.log('  POST /api/user/connect-google-calendar');
  console.log('  POST /api/letta/health-check');
  console.log('  POST /api/letta/send-message');
  console.log('  POST /api/letta/generate-suggestions');
  console.log('  POST /api/composio/connect-google-calendar');
  console.log('  GET  /api/composio/connections');
  console.log('  POST /api/composio/test-connection');
  console.log('  GET  /api/stats');
  console.log('');
  console.log('✅ Server is ready to handle requests!');
  console.log('💡 The server provides simulated AI responses until Letta is fully configured.');
});

export default app;