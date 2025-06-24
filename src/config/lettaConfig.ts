/**
 * Letta Agent Configuration for Vite + React
 * 
 * This configuration is optimized for direct Letta client usage in a Vite environment.
 * For Next.js with Vercel AI SDK, see: https://docs.letta.ai/integrations/vercel-ai-sdk
 * 
 * Environment Variables (Vite requires VITE_ prefix):
 * - VITE_LETTA_BASE_URL: Base URL of your Letta server (default: https://api.letta.ai)
 * - VITE_LETTA_API_KEY: Your Letta API key (required for Letta Cloud)
 * - VITE_LETTA_PROJECT_SLUG: Your project slug (default: default-project)
 * - VITE_LETTA_AGENT_ID: Specific agent ID (optional, will create if not provided)
 * - VITE_LETTA_TEMPLATE_NAME: Template for agent creation (default: cal-planner-agent:latest)
 * 
 * Example .env file:
 * ```
 * VITE_LETTA_BASE_URL=https://api.letta.ai
 * VITE_LETTA_API_KEY=your-api-key-here
 * VITE_LETTA_PROJECT_SLUG=your-project-slug
 * VITE_LETTA_AGENT_ID=agent-id-if-exists
 * VITE_LETTA_TEMPLATE_NAME=cal-planner-agent:latest
 * ```
 */

export interface LettaConfig {
  baseUrl: string;
  apiKey: string;
  projectSlug: string;
  agentId?: string;
  templateName: string;
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
  baseUrl: getEnvVar('VITE_LETTA_BASE_URL', 'REACT_APP_LETTA_BASE_URL', 'https://api.letta.ai'),
  apiKey: getEnvVar('VITE_LETTA_API_KEY', 'REACT_APP_LETTA_API_KEY', '') || '',
  projectSlug: getEnvVar('VITE_LETTA_PROJECT_SLUG', 'REACT_APP_LETTA_PROJECT_SLUG', 'default-project'),
  agentId: getEnvVar('VITE_LETTA_AGENT_ID', 'REACT_APP_LETTA_AGENT_ID'),
  templateName: getEnvVar('VITE_LETTA_TEMPLATE_NAME', 'REACT_APP_LETTA_TEMPLATE_NAME', 'cal-planner-agent:latest'),
};

// Helper function to validate configuration
export const validateLettaConfig = (config: LettaConfig): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!config.baseUrl) {
    errors.push('Base URL is required');
  }

  if (!config.apiKey) {
    errors.push('API Key is required for Letta Cloud');
  }

  if (!config.projectSlug) {
    errors.push('Project slug is required');
  }

  if (!config.templateName) {
    errors.push('Template name is required for agent creation');
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
    console.log('- VITE_LETTA_API_KEY:', import.meta.env.VITE_LETTA_API_KEY ? '[REDACTED]' : 'Not set');
    console.log('- VITE_LETTA_PROJECT_SLUG:', import.meta.env.VITE_LETTA_PROJECT_SLUG || 'Not set');
    console.log('- VITE_LETTA_AGENT_ID:', import.meta.env.VITE_LETTA_AGENT_ID || 'Not set');
    console.log('- VITE_LETTA_TEMPLATE_NAME:', import.meta.env.VITE_LETTA_TEMPLATE_NAME || 'Not set');
    
    console.log('');
    console.log('⚙️ Final resolved config:', {
      baseUrl: defaultLettaConfig.baseUrl,
      apiKey: defaultLettaConfig.apiKey ? '[REDACTED]' : 'Not set',
      projectSlug: defaultLettaConfig.projectSlug,
      agentId: defaultLettaConfig.agentId || 'Will be created',
      templateName: defaultLettaConfig.templateName
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