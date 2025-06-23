# Letta Agent Integration

This calendar app now integrates with your Letta agent for intelligent calendar management using the official Letta SDK (`@letta-ai/letta-client`).

## Setup

### 1. Environment Configuration

Create a `.env` file in your project root:

```env
REACT_APP_LETTA_BASE_URL=http://localhost:8000
REACT_APP_LETTA_AGENT_ID=your-agent-id-here
REACT_APP_LETTA_API_KEY=your-api-key-here
```

### 2. Configuration Options

You can also configure the Letta connection programmatically by modifying `src/config/lettaConfig.ts`:

```typescript
export const defaultLettaConfig: LettaConfig = {
  baseUrl: 'http://your-letta-server:port',
  agentId: 'your-agent-id',
  apiKey: 'your-api-key', // Optional
};
```

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

## Extending the Integration

### Custom Message Processing

Modify `processLettaResponse()` in `lettaService.ts` to parse structured responses:

```typescript
private processLettaResponse(response: string): LettaResponse {
  // Parse response for events, suggestions, etc.
  // Return structured data for the calendar app
}
```

### Additional Agent Methods

Add new methods to `LettaService` for specific agent capabilities:

```typescript
async customAgentMethod(params: any) {
  const response = await this.client.agents.messages.create(
    this.config.agentId,
    { messages: [{ role: 'user', content: 'custom prompt' }] }
  );
  // Process response
}
```

## Troubleshooting

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
2. Verify environment variables are loaded
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