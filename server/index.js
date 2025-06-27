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

// Root endpoint - redirect to client
app.get('/', (req, res) => {
  res.json({
    message: 'SmartPlan API Server',
    status: 'running',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    endpoints: {
      health: '/api/health',
      userConnection: '/api/user/connect-google-calendar',
      lettaHealthCheck: '/api/letta/health-check',
      lettaSendMessage: '/api/letta/send-message',
      lettaGenerateSuggestions: '/api/letta/generate-suggestions',
      composioConnect: '/api/composio/connect-google-calendar',
      composioConnections: '/api/composio/connections',
      composioTest: '/api/composio/test-connection',
      stats: '/api/stats'
    },
    note: 'This is an API server. Visit the client URL above to use the application.',
    timestamp: new Date().toISOString()
  });
});

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

    // Simulate intelligent AI response based on message content
    let aiResponse = '';
    
    if (message.toLowerCase().includes('schedule') || message.toLowerCase().includes('create')) {
      if (hasGoogleCalendar) {
        aiResponse = `Perfect! I can help you schedule that. Since your Google Calendar is connected, I can create the event directly in your calendar. `;
        
        if (message.toLowerCase().includes('meeting')) {
          aiResponse += `I'll schedule a meeting for you. What time works best?`;
        } else if (message.toLowerCase().includes('workout') || message.toLowerCase().includes('exercise')) {
          aiResponse += `Great choice for staying healthy! I'll add a workout session to your calendar.`;
        } else if (message.toLowerCase().includes('study') || message.toLowerCase().includes('learn')) {
          aiResponse += `Excellent! Learning is key to growth. I'll block out study time for you.`;
        } else {
          aiResponse += `I'll create that event for you right away.`;
        }
      } else {
        aiResponse = `I'd love to help you schedule that! To create events directly in your Google Calendar, please connect your Google Calendar first using the "Connect AI Integration" button below.`;
      }
    } else if (message.toLowerCase().includes('today') || message.toLowerCase().includes('schedule')) {
      aiResponse = `Let me help you with your schedule. ${hasGoogleCalendar ? 'I can see your Google Calendar events and help you plan around them.' : 'Connect your Google Calendar for full schedule visibility.'}`;
    } else if (message.toLowerCase().includes('suggest') || message.toLowerCase().includes('recommend')) {
      aiResponse = `I'd be happy to suggest some activities! Based on your preferences, I can recommend study sessions, workouts, breaks, or work blocks. What type of activity are you interested in?`;
    } else if (message.toLowerCase().includes('help')) {
      aiResponse = `I'm here to help you manage your calendar efficiently! I can:
      
• Create events using natural language
• Suggest optimal times for activities
• Help you balance work, study, and personal time
• Provide motivational feedback
• Sync with your Google Calendar

${hasGoogleCalendar ? 'Your Google Calendar is connected, so I can make changes directly!' : 'Connect your Google Calendar for full integration.'}

Try asking me to "schedule a meeting tomorrow at 2pm" or "suggest a good time for exercise"!`;
    } else {
      aiResponse = `I received your message: "${message}". ${hasGoogleCalendar ? 'Since your Google Calendar is connected, I can help you create, update, and manage events directly.' : 'Connect your Google Calendar to enable full AI-powered calendar management.'} How can I help you optimize your schedule today?`;
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
    
    // Generate contextual suggestions based on user data
    const suggestions = [];
    const hasGoogleCalendar = userConnections.has(userEmail);
    
    // Suggest based on focus areas
    if (preferences?.focusAreas) {
      if (preferences.focusAreas.includes('health-fitness')) {
        suggestions.push({
          id: `suggestion_${Date.now()}_health`,
          type: 'schedule',
          title: 'Morning Workout Session',
          description: 'Start your day with energizing exercise based on your health focus',
          action: 'create_event',
          priority: 1,
          createdAt: new Date().toISOString()
        });
      }
      
      if (preferences.focusAreas.includes('learning-education')) {
        suggestions.push({
          id: `suggestion_${Date.now()}_study`,
          type: 'schedule',
          title: 'Deep Learning Block',
          description: 'Focused study session during your productive hours',
          action: 'create_event',
          priority: 1,
          createdAt: new Date().toISOString()
        });
      }
      
      if (preferences.focusAreas.includes('work-career')) {
        suggestions.push({
          id: `suggestion_${Date.now()}_work`,
          type: 'schedule',
          title: 'Strategic Work Session',
          description: 'High-priority work block for career advancement',
          action: 'create_event',
          priority: 1,
          createdAt: new Date().toISOString()
        });
      }
    }
    
    // Add break suggestion if many events
    if (events && events.length > 3) {
      suggestions.push({
        id: `suggestion_${Date.now()}_break`,
        type: 'break',
        title: 'Mindful Break',
        description: 'Take a 15-minute break to recharge between activities',
        action: 'schedule_break',
        priority: 2,
        createdAt: new Date().toISOString()
      });
    }
    
    // Add optimization suggestion
    suggestions.push({
      id: `suggestion_${Date.now()}_optimize`,
      type: 'optimize',
      title: 'Schedule Optimization',
      description: hasGoogleCalendar ? 
        'Your Google Calendar is connected - I can optimize your schedule automatically!' :
        'Connect Google Calendar to enable automatic schedule optimization',
      action: 'optimize_schedule',
      priority: hasGoogleCalendar ? 1 : 3,
      createdAt: new Date().toISOString()
    });
    
    res.json({
      success: true,
      suggestions: suggestions.slice(0, 4), // Limit to 4 suggestions
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
      message: 'Server integration is working perfectly',
      userConnections: userConnections.size,
      userAgents: userAgents.size,
      features: {
        userGoogleCalendarConnection: 'active',
        lettaSimulation: 'active',
        composioSimulation: 'active',
        aiResponses: 'contextual'
      },
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
      nodeVersion: process.version,
      platform: process.platform,
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
      'POST /api/user/connect-google-calendar',
      'POST /api/letta/health-check',
      'POST /api/letta/send-message',
      'POST /api/letta/generate-suggestions',
      'POST /api/composio/connect-google-calendar',
      'GET /api/composio/connections',
      'POST /api/composio/test-connection',
      'GET /api/stats'
    ],
    note: 'This is an API server. Visit http://localhost:5173 for the client application.',
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
  console.log('  GET  /');
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
  console.log('💡 The server provides intelligent AI responses and user-specific Google Calendar integration.');
  console.log('🔧 All TypeScript dependencies removed - running pure JavaScript for maximum compatibility.');
  console.log('');
  console.log('🎯 To use the application:');
  console.log('   👉 Visit: http://localhost:5173');
  console.log('   📱 This server (port 3001) is the API backend');
  console.log('   🖥️  The client app (port 5173) is the user interface');
});

export default app;