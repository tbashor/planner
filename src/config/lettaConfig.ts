/**
 * Letta Agent Configuration
 * 
 * To configure your Letta agent connection, you can either:
 * 1. Set environment variables (recommended)
 * 2. Modify the values in this file directly
 * 
 * Environment Variables:
 * For Vite (this project): Use VITE_ prefix
 * - VITE_LETTA_BASE_URL: Base URL of your Letta agent server (default: http://localhost:8000)
 * - VITE_LETTA_AGENT_ID: Your Letta agent ID (required)
 * - VITE_LETTA_API_KEY: Optional API key for authentication
 * 
 * Legacy support: Also checks REACT_APP_ prefix for compatibility
 * - REACT_APP_LETTA_BASE_URL
 * - REACT_APP_LETTA_AGENT_ID  
 * - REACT_APP_LETTA_API_KEY
 * 
 * Example .env file:
 * ```
 * VITE_LETTA_BASE_URL=http://localhost:8000
 * VITE_LETTA_AGENT_ID=your-agent-id-here
 * VITE_LETTA_API_KEY=your-api-key-here
 * ```
 */

export interface LettaConfig {
  baseUrl: string;
  agentId: string;
  apiKey?: string;
}

// Helper function to get environment variable with fallback support
const getEnvVar = (viteKey: string, reactKey: string, defaultValue?: string): string | undefined => {
  // First try Vite prefix (current standard)
  const viteValue = import.meta.env[viteKey];
  if (viteValue) return viteValue;
  
  // Fallback to React prefix for compatibility
  const reactValue = import.meta.env[reactKey];
  if (reactValue) return reactValue;
  
  return defaultValue;
};

export const defaultLettaConfig: LettaConfig = {
  baseUrl: getEnvVar('VITE_LETTA_BASE_URL', 'REACT_APP_LETTA_BASE_URL', 'http://localhost:8000'),
  agentId: getEnvVar('VITE_LETTA_AGENT_ID', 'REACT_APP_LETTA_AGENT_ID', 'default-agent'),
  apiKey: getEnvVar('VITE_LETTA_API_KEY', 'REACT_APP_LETTA_API_KEY'),
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

// Debug function to check environment variables (development only)
export const debugEnvironmentVariables = () => {
  if (import.meta.env.DEV) {
    console.log('🔧 Letta Configuration Debug:');
    console.log('📋 Available environment variables:');
    
    // Check all available env vars
    const allEnvVars = import.meta.env;
    const lettaVars = Object.keys(allEnvVars).filter(key => 
      key.includes('LETTA') || key.includes('letta')
    );
    
    if (lettaVars.length > 0) {
      console.log('🔍 Found Letta-related variables:', lettaVars);
      lettaVars.forEach(key => {
        const value = allEnvVars[key];
        console.log(`  - ${key}:`, value ? (key.includes('API_KEY') ? '[REDACTED]' : value) : 'Not set');
      });
    } else {
      console.log('❌ No Letta-related environment variables found');
    }
    
    console.log('');
    console.log('🎯 Checking specific variables:');
    console.log('- VITE_LETTA_BASE_URL:', import.meta.env.VITE_LETTA_BASE_URL || 'Not set');
    console.log('- VITE_LETTA_AGENT_ID:', import.meta.env.VITE_LETTA_AGENT_ID || 'Not set');
    console.log('- VITE_LETTA_API_KEY:', import.meta.env.VITE_LETTA_API_KEY ? '[REDACTED]' : 'Not set');
    console.log('- REACT_APP_LETTA_BASE_URL:', import.meta.env.REACT_APP_LETTA_BASE_URL || 'Not set');
    console.log('- REACT_APP_LETTA_AGENT_ID:', import.meta.env.REACT_APP_LETTA_AGENT_ID || 'Not set');
    console.log('- REACT_APP_LETTA_API_KEY:', import.meta.env.REACT_APP_LETTA_API_KEY ? '[REDACTED]' : 'Not set');
    
    console.log('');
    console.log('⚙️ Final resolved config:', {
      baseUrl: defaultLettaConfig.baseUrl,
      agentId: defaultLettaConfig.agentId,
      apiKey: defaultLettaConfig.apiKey ? '[REDACTED]' : 'Not set'
    });
    
    const validation = validateLettaConfig(defaultLettaConfig);
    if (!validation.isValid) {
      console.log('❌ Configuration errors:', validation.errors);
    } else {
      console.log('✅ Configuration is valid');
    }
  }
};

export default defaultLettaConfig;