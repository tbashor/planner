# Smart Calendar & Planner App

A beautiful, AI-powered calendar and planner application designed to help students manage their time effectively with intelligent scheduling suggestions and motivational feedback.

## Features

- **Interactive Weekly Calendar**: Time-block based planning with drag-and-drop functionality
- **AI Assistant**: Smart scheduling suggestions and motivational feedback
- **Google Calendar Integration**: Sync events from your Google Calendar
- **Voice Input**: Use voice commands to interact with the AI assistant
- **Dark Mode**: Beautiful dark theme support
- **Responsive Design**: Optimized for desktop with mobile considerations

## Google Calendar Setup

To enable Google Calendar integration, you'll need to set up Google Calendar API credentials:

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
   - `https://www.googleapis.com/auth/calendar.readonly`
5. Add test users (your email) if the app is in testing mode

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
2. You'll be redirected to Google's authorization page
3. Grant permission to read your calendar
4. You'll be redirected back to the app
5. Click "Sync" to import your Google Calendar events

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

## Development

### Project Structure

```
src/
├── components/          # React components
│   ├── AiAssistant/    # AI chat and suggestions
│   ├── Calendar/       # Calendar views and events
│   ├── GoogleCalendar/ # Google Calendar integration
│   └── Layout/         # Layout components
├── contexts/           # React context providers
├── hooks/              # Custom React hooks
├── services/           # API services
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── data/               # Mock data and constants
```

### Key Technologies

- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **date-fns** for date manipulation
- **react-dnd** for drag-and-drop functionality
- **Google Calendar API** for calendar integration
- **Lucide React** for icons

## Security Notes

- Never commit your `.env` file to version control
- Use environment variables for all sensitive credentials
- Consider implementing proper OAuth flow for production
- Restrict API keys to specific domains in production

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.