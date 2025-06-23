/**
 * Letta Agent Configuration
 * 
 * To configure your Letta agent connection, you can either:
 * 1. Set environment variables (recommended)
 * 2. Modify the values in this file directly
 * 
 * Environment Variables:
 * - REACT_APP_LETTA_BASE_URL: Base URL of your Letta agent server (default: http://localhost:8000)
 * - REACT_APP_LETTA_AGENT_ID: Your Letta agent ID (required)
 * - REACT_APP_LETTA_API_KEY: Optional API key for authentication
 * 
 * Example .env file:
 * ```
 * REACT_APP_LETTA_BASE_URL=http://localhost:8000
 * REACT_APP_LETTA_AGENT_ID=your-agent-id-here
 * REACT_APP_LETTA_API_KEY=your-api-key-here
 * ```
 */

export interface LettaConfig {
  baseUrl: string;
  agentId: string;
  apiKey?: string;
}

// Get environment variables safely
const getEnvVar = (key: string, defaultValue?: string): string | undefined => {
  if (typeof window !== 'undefined') {
    // Client-side: environment variables are injected at build time
    const windowEnv = (window as { __ENV__?: Record<string, string> }).__ENV__;
    return windowEnv?.[key] || defaultValue;
  }
  // For development/build time
  return defaultValue;
};

export const defaultLettaConfig: LettaConfig = {
  baseUrl: getEnvVar('REACT_APP_LETTA_BASE_URL') || 'http://localhost:8000',
  agentId: getEnvVar('REACT_APP_LETTA_AGENT_ID') || 'default-agent',
  apiKey: getEnvVar('REACT_APP_LETTA_API_KEY') || undefined,
};

// Helper function to validate configuration
export const validateLettaConfig = (config: LettaConfig): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!config.baseUrl) {
    errors.push('Base URL is required');
  }

  if (!config.agentId) {
    errors.push('Agent ID is required');
  }

  // Validate URL format
  try {
    new URL(config.baseUrl);
  } catch {
    errors.push('Base URL must be a valid URL');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export default defaultLettaConfig; 