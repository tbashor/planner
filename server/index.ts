import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { LettaServerService } from './services/lettaServerService.js';

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

// Initialize services
const lettaService = new LettaServerService();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    services: {
      letta: 'available',
      composio: 'available'
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
    
    const agentId = await lettaService.connectUserGoogleAccount(
      userEmail, 
      accessToken, 
      refreshToken, 
      expiresIn
    );
    
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
    const isHealthy = await lettaService.healthCheck(userEmail);
    
    res.json({ 
      healthy: isHealthy,
      agentId: lettaService.getCurrentAgentId(userEmail),
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

    const response = await lettaService.sendMessage(message, context);
    
    res.json({
      success: true,
      response,
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
    
    const suggestions = await lettaService.generateSuggestions(
      events, 
      preferences, 
      new Date(currentDate),
      userEmail
    );
    
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

// Composio endpoints
app.post('/api/composio/connect-google-calendar', async (req, res) => {
  try {
    console.log('🔄 Initiating Google Calendar connection via Composio...');
    
    const composioService = lettaService.getComposioService();
    const connection = await composioService.initiateGoogleCalendarConnection();
    
    console.log('✅ Google Calendar connection initiated successfully');
    console.log(`🔗 Redirect URL: ${connection.redirectUrl}`);
    
    res.json({
      success: true,
      redirectUrl: connection.redirectUrl,
      connectionId: connection.connectionId,
      message: 'Google Calendar connection initiated. Use the redirect URL to authenticate.',
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
    const composioService = lettaService.getComposioService();
    const connections = await composioService.getConnections();
    
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
    const composioService = lettaService.getComposioService();
    const testResult = await composioService.testConnection();
    
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
    const stats = lettaService.getServiceStats();
    
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
  
  // Test Composio connection on startup
  setTimeout(async () => {
    try {
      const composioService = lettaService.getComposioService();
      await composioService.testConnection();
      console.log('✅ Composio service initialized successfully');
    } catch (error) {
      console.error('⚠️ Composio service initialization failed:', error);
    }
  }, 1000);
});

export default app;