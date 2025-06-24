# Letta Agent Integration

This calendar app now integrates with your Letta agent for intelligent calendar management using the official Letta SDK (`@letta-ai/letta-client`).

## Setup

### 1. Environment Configuration

**IMPORTANT**: This project uses Vite, so environment variables must be prefixed with `VITE_` (not `REACT_APP_`).

Create a `.env` file in your project root:

```env
VITE_LETTA_BASE_URL=http://localhost:8000
VITE_LETTA_AGENT_ID=your-agent-id-here
VITE_LETTA_API_KEY=your-api-key-here
```

### 2. Environment Variable Requirements

#### Vite vs Create React App
- **Vite** (this project): Use `VITE_` prefix
- **Create React App**: Uses `REACT_APP_` prefix

This project supports both for compatibility:
- Primary: `VITE_LETTA_*` variables
- Fallback: `REACT_APP_LETTA_*` variables

#### Required Variables
- `VITE_LETTA_BASE_URL`: Your Letta server URL (default: http://localhost:8000)
- `VITE_LETTA_AGENT_ID`: Your specific agent ID (required)
- `VITE_LETTA_API_KEY`: Optional API key for authentication

### 3. Configuration Options

You can also configure the Letta connection programmatically by modifying `src/config/lettaConfig.ts`:

```typescript
export const defaultLettaConfig: LettaConfig = {
  baseUrl: 'http://your-letta-server:port',
  agentId: 'your-agent-id',
  apiKey: 'your-api-key', // Optional
};
```

### 4. Debugging Environment Variables

The app includes debugging tools to help you verify your environment variables are loaded correctly:

1. Open browser developer tools
2. Look for console messages starting with "🔧 Letta Configuration Debug"
3. Check if your variables are being detected

## Features

### ✅ **Real-time Chat**
- Send messages to your Letta agent
- Get responses with calendar context
- Conversation history tracking

### ✅ **Context-Aware Communication**
- Agent receives current date
- Today's events are shared as context
- User preferences (working hours, focus areas) included

### ✅ **Connection Monitoring**
- Real-time connection status
- Health check functionality
- Graceful error handling

### ✅ **Calendar Integration**
- Agent can understand calendar-related requests
- Context includes current events and preferences
- Support for event parsing and suggestions

## API Usage

The `LettaService` provides several methods:

### Send Message
```typescript
const response = await lettaService.sendMessage(
  "Schedule a meeting tomorrow at 2pm",
  {
    events: currentEvents,
    preferences: userPreferences,
    currentDate: new Date()
  }
);
```

### Generate Suggestions
```typescript
const suggestions = await lettaService.generateSuggestions(
  events,
  preferences,
  new Date()
);
```

### Health Check
```typescript
const isConnected = await lettaService.healthCheck();
```

## Agent Development

Your Letta agent will receive messages in this format:

### System Message (Context)
```
Current date: 2024-01-15
Today's events: 09:00 - Morning standup, 14:00 - Client meeting
User's focus areas: work-career, health-fitness
Working hours: 09:00 to 17:00
```

### User Message
```
Schedule a workout session for tomorrow
```

## File Structure

```
src/
├── services/
│   └── lettaService.ts          # Main Letta SDK integration
├── config/
│   └── lettaConfig.ts           # Configuration and validation
└── components/
    └── AiAssistant/
        └── AiSidebar.tsx        # Updated UI with Letta integration
```

## Error Handling

The integration includes comprehensive error handling:

- **Connection failures**: Graceful fallbacks with user-friendly messages
- **API errors**: Logged to console with fallback responses
- **Type safety**: Full TypeScript support with proper error types

## Troubleshooting

### Environment Variables Not Loading

1. **Check the prefix**: Use `VITE_` not `REACT_APP_`
2. **Restart the dev server**: Environment variables are loaded at startup
3. **Check the .env file location**: Must be in project root
4. **Verify syntax**: No spaces around the `=` sign

```env
# ✅ Correct
VITE_LETTA_BASE_URL=http://localhost:8000

# ❌ Incorrect
VITE_LETTA_BASE_URL = http://localhost:8000
```

### Connection Issues
1. Check that your Letta server is running
2. Verify the `baseUrl` in your configuration
3. Ensure the `agentId` exists
4. Check API key permissions (if using authentication)

### Agent Not Responding
1. Check agent status in Letta dashboard
2. Verify agent has proper calendar management capabilities
3. Check console for error messages

### UI Issues
1. Check browser console for JavaScript errors
2. Verify environment variables are loaded (see debugging section)
3. Test the health check endpoint manually

## Next Steps

To further enhance the integration:

1. **Event Parsing**: Implement structured event creation from agent responses
2. **Suggestions**: Parse agent suggestions into actionable calendar items
3. **Voice Integration**: Add voice commands for agent interaction
4. **Batch Operations**: Support multiple calendar operations in one request
5. **Learning**: Enable the agent to learn from user behavior and preferences

## Support

For issues with:
- **Letta SDK**: Check the [official Letta documentation](https://docs.letta.ai)
- **Integration**: Review the code in `src/services/lettaService.ts`
- **Configuration**: Check `src/config/lettaConfig.ts`
- **Environment Variables**: Use the debugging tools in the browser console