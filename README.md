# Smart Calendar & Planner App

A beautiful, AI-powered calendar and planner application designed to help students manage their time effectively with intelligent scheduling suggestions and motivational feedback.

## Features

- **Interactive Weekly Calendar**: Time-block based planning with drag-and-drop functionality
- **AI Assistant**: Smart scheduling suggestions and motivational feedback
- **Google Calendar Integration**: Secure OAuth 2.0 integration with full editing capabilities
- **Voice Input**: Use voice commands to interact with the AI assistant
- **Dark Mode**: Beautiful dark theme support
- **Responsive Design**: Optimized for desktop with mobile considerations
- **Undo/Redo**: Full undo/redo support for all calendar operations
- **Event Management**: Create, edit, delete, and manage events with natural language

## Google Calendar Setup

To enable Google Calendar integration, you'll need to set up Google Calendar API credentials with OAuth 2.0:

### 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click on it and press "Enable"

### 2. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Configure the OAuth consent screen if prompted
4. Choose "Web application" as the application type
5. Add authorized redirect URIs:
   - For development: `http://localhost:5173/auth/callback`
   - For production: `https://yourdomain.com/auth/callback`
   - For Bolt.new: `https://your-bolt-url.webcontainer-api.io/auth/callback`
6. Save and copy the Client ID and Client Secret

### 3. Create an API Key

1. In "Credentials", click "Create Credentials" > "API Key"
2. Copy the API key
3. (Optional) Restrict the API key to Google Calendar API for security

### 4. Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your Google Calendar credentials in `.env`:
   ```env
   VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
   VITE_GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback
   VITE_GOOGLE_API_KEY=your_google_api_key_here
   ```

### 5. OAuth Consent Screen Setup

1. Go to "APIs & Services" > "OAuth consent screen"
2. Choose "External" user type (unless you have a Google Workspace)
3. Fill in the required information:
   - App name: "Smart Calendar Planner"
   - User support email: Your email
   - Developer contact information: Your email
4. Add scopes:
   - `https://www.googleapis.com/auth/calendar` (full access)
5. Add test users (your email) if the app is in testing mode

## OAuth 2.0 Security Features

Our implementation includes industry-standard security measures:

- **PKCE (Proof Key for Code Exchange)**: Prevents authorization code interception attacks
- **State Parameter**: Protects against CSRF attacks with cryptographically secure random values
- **Secure Token Storage**: Tokens are stored securely in localStorage with proper validation
- **Automatic Token Refresh**: Seamless token renewal without user intervention
- **Proper Error Handling**: Comprehensive error handling with user-friendly messages
- **HTTPS Enforcement**: All OAuth flows use secure HTTPS connections

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your `.env` file with Google Calendar credentials (see above)
4. Start the development server:
   ```bash
   npm run dev
   ```

## Usage

### Connecting Google Calendar

1. Click the "Connect Google Calendar" button in the AI sidebar
2. You'll be redirected to Google's secure authorization page
3. Grant permission to access your calendar
4. You'll be redirected back to the app automatically
5. Your Google Calendar events will sync automatically

### OAuth Flow Details

The application uses a secure OAuth 2.0 flow:

1. **Authorization Request**: User clicks connect, app generates secure authorization URL
2. **User Consent**: User is redirected to Google's authorization server
3. **Authorization Code**: Google redirects back with authorization code
4. **Token Exchange**: App exchanges code for access and refresh tokens
5. **API Access**: App uses tokens to make authenticated requests

### Using the AI Assistant

- Type messages in the chat input to get scheduling suggestions
- Use voice input (if enabled) by clicking the microphone button
- Accept or reject AI suggestions using the action buttons
- The AI will provide motivational feedback when you complete tasks

### Managing Events

- Click on time slots to create new events
- Drag and drop events to reschedule them
- Click on events to mark them as complete or delete them
- Events are color-coded by category and priority
- Use Ctrl+Z/Ctrl+Y for undo/redo operations
- Use Ctrl+N for quick event creation

## Development

### Project Structure

```
src/
├── components/          # React components
│   ├── AiAssistant/    # AI chat and suggestions
│   ├── Calendar/       # Calendar views and events
│   ├── GoogleCalendar/ # Google Calendar integration
│   ├── EventManagement/# Event creation and editing
│   └── Layout/         # Layout components
├── contexts/           # React context providers
├── hooks/              # Custom React hooks
├── services/           # API services
│   ├── oauthService.ts # OAuth 2.0 implementation
│   └── googleCalendarService.ts # Google Calendar API
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── data/               # Mock data and constants
```

### Key Technologies

- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **date-fns** for date manipulation
- **react-dnd** for drag-and-drop functionality
- **Google Calendar API** with OAuth 2.0
- **Toast UI Calendar** for advanced calendar features
- **Lucide React** for icons

### OAuth 2.0 Implementation

The OAuth implementation (`src/services/oauthService.ts`) includes:

- **Secure State Management**: Cryptographically secure state parameters
- **PKCE Support**: Code challenge/verifier for enhanced security
- **Token Management**: Automatic refresh and secure storage
- **Error Handling**: Comprehensive error handling and validation
- **Configuration Validation**: Ensures all required credentials are present

## Security Notes

- Never commit your `.env` file to version control
- Use environment variables for all sensitive credentials
- The redirect URI must match EXACTLY between Google Cloud Console and your configuration
- Use HTTPS in production for security
- Restrict API keys to specific domains in production
- The OAuth flow uses PKCE and state parameters for maximum security

## Troubleshooting

### Common OAuth Issues

1. **redirect_uri_mismatch**: Ensure the redirect URI in Google Cloud Console matches exactly
2. **invalid_client**: Check that your client ID and secret are correct
3. **access_denied**: User denied permission or OAuth consent screen needs configuration
4. **Token expired**: The app automatically handles token refresh

### Debug Information

In development mode, the app provides detailed logging for OAuth operations:
- Authorization URL generation
- Token exchange process
- API request/response details
- Error messages with specific guidance

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly, especially OAuth flows
5. Submit a pull request

## License

This project is licensed under the MIT License.