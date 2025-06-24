# Letta Agent Integration (Vite + React)

This calendar app integrates with Letta agents for intelligent calendar management using the official Letta SDK (`@letta-ai/letta-client`).

## 🏗️ **Architecture Overview**

This project uses a **direct client-side integration** with Letta, which is different from Letta's Next.js recommendations:

### **This Project (Vite + React)**
- ✅ Direct Letta client SDK (`@letta-ai/letta-client`)
- ✅ Client-side only (no server components needed)
- ✅ Direct API calls to Letta Cloud
- ✅ Manual message handling with full control
- ✅ Local state management

### **Letta's Next.js Approach**
- Uses `@letta-ai/vercel-ai-sdk-provider` + Vercel AI SDK
- Requires Next.js App Router with server components
- Uses server-side API routes for streaming
- Cookie-based session management

## 🚀 **Setup**

### 1. Get Letta Credentials

1. **Sign up** for Letta Cloud at [https://app.letta.ai](https://app.letta.ai)
2. **Create a project** or use the default project
3. **Get your API key** from the dashboard
4. **Note your project slug** (usually `default-project`)

### 2. Environment Configuration

**IMPORTANT**: This project uses Vite, so environment variables must be prefixed with `VITE_`.

Create a `.env` file in your project root:

```env
VITE_LETTA_BASE_URL=https://api.letta.ai
VITE_LETTA_API_KEY=your_letta_api_key_here
VITE_LETTA_PROJECT_SLUG=default-project
VITE_LETTA_AGENT_ID=your_agent_id_here
VITE_LETTA_TEMPLATE_NAME=cal-planner-agent:latest
```

### 3. Environment Variables Explained

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `VITE_LETTA_BASE_URL` | No | Letta API endpoint | `https://api.letta.ai` |
| `VITE_LETTA_API_KEY` | **Yes** | Your Letta API key | None |
| `VITE_LETTA_PROJECT_SLUG` | No | Your project slug | `default-project` |
| `VITE_LETTA_AGENT_ID` | No | Specific agent ID (optional) | Will create new |
| `VITE_LETTA_TEMPLATE_NAME` | No | Template for agent creation | `cal-planner-agent:latest` |

### 4. Agent Management

The service automatically handles agent creation:

- **If `VITE_LETTA_AGENT_ID` is provided**: Uses that specific agent
- **If not provided**: Creates a new agent from the template
- **Agent persistence**: The created agent ID is stored in the session

## 🔧 **Configuration Options**

### Programmatic Configuration

You can also configure Letta by modifying `src/config/lettaConfig.ts`:

```typescript
export const defaultLettaConfig: LettaConfig = {
  baseUrl: 'https://api.letta.ai',
  apiKey: 'your-api-key',
  projectSlug: 'your-project-slug',
  agentId: 'optional-agent-id',
  templateName: 'cal-planner-agent:latest',
};
```

### Debugging Environment Variables

The app includes debugging tools to verify your configuration:

1. Open browser developer tools
2. Look for console messages starting with "🔧 Letta Configuration Debug"
3. Check if your variables are being detected correctly

## 🎯 **Features**

### ✅ **Intelligent Chat**
- Send messages to your Letta agent
- Get contextual responses about calendar management
- Conversation history tracking

### ✅ **Context-Aware Communication**
- Agent receives current date and time
- Today's events are shared as context
- User preferences (working hours, focus areas) included
- Smart calendar suggestions

### ✅ **Agent Management**
- Automatic agent creation from templates
- Session-based agent persistence
- Health check functionality
- Graceful error handling

### ✅ **Calendar Integration**
- Agent understands calendar-related requests
- Context includes current events and preferences
- Support for event parsing and suggestions

## 📚 **API Usage**

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

### Get Agent Info
```typescript
const agentInfo = await lettaService.getAgentInfo();
const currentAgentId = lettaService.getCurrentAgentId();
```

## 🏗️ **File Structure**

```
src/
├── services/
│   └── lettaService.ts          # Enhanced Letta SDK integration
├── config/
│   └── lettaConfig.ts           # Configuration and validation
└── components/
    └── AiAssistant/
        └── AiSidebar.tsx        # UI with Letta integration
```

## 🔍 **Agent Development**

Your Letta agent receives messages in this format:

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

## 🛠️ **Troubleshooting**

### Environment Variables Not Loading

1. **Check the prefix**: Use `VITE_` not `REACT_APP_`
2. **Restart the dev server**: Environment variables are loaded at startup
3. **Check the .env file location**: Must be in project root
4. **Verify syntax**: No spaces around the `=` sign

```env
# ✅ Correct
VITE_LETTA_API_KEY=your_api_key_here

# ❌ Incorrect
VITE_LETTA_API_KEY = your_api_key_here
```

### Connection Issues

1. **Check API key**: Ensure it's valid and has proper permissions
2. **Verify base URL**: Should be `https://api.letta.ai` for Letta Cloud
3. **Check project slug**: Must match your Letta project
4. **Network issues**: Check if you can access Letta Cloud directly

### Agent Creation Issues

1. **Template not found**: Verify `VITE_LETTA_TEMPLATE_NAME` exists
2. **Project permissions**: Ensure your API key has access to the project
3. **Quota limits**: Check if you've reached agent creation limits

### Debug Console Messages

Look for these console messages:

- `🤖 Letta Service initialized` - Service startup
- `✅ Using existing agent` - Found existing agent
- `🔄 Creating new agent from template` - Creating new agent
- `✅ Created new agent` - Agent creation success
- `❌ Failed to create agent` - Agent creation failed

## 🔄 **Migration from Next.js Approach**

If you want to use Letta's exact Next.js recommendations, you would need to:

1. **Migrate to Next.js** with App Router
2. **Install Vercel AI SDK packages**:
   ```bash
   npm install @letta-ai/vercel-ai-sdk-provider ai @ai-sdk/react
   ```
3. **Create server-side API routes** for streaming
4. **Implement server components** for agent management
5. **Use cookie-based sessions** instead of local state

However, the current Vite approach offers more flexibility and direct control over the Letta integration.

## 🎯 **Next Steps**

To enhance the integration further:

1. **Structured Response Parsing**: Parse agent responses for calendar events
2. **Advanced Context**: Include more calendar context (conflicts, preferences)
3. **Event Creation**: Let agents create calendar events directly
4. **Batch Operations**: Support multiple calendar operations
5. **Learning**: Enable agents to learn from user behavior

## 📞 **Support**

For issues with:
- **Letta SDK**: Check [Letta documentation](https://docs.letta.ai)
- **Integration**: Review `src/services/lettaService.ts`
- **Configuration**: Check `src/config/lettaConfig.ts`
- **Environment Variables**: Use browser console debugging tools