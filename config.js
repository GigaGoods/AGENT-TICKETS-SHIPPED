/**
 * Environment-based configuration.
 * Copy .env.example → .env and fill in your API keys.
 */

/** @returns {{ vision: { provider: string, openaiApiKey?: string, openaiModel?: string, googleApiKey?: string, googleModel?: string }, port: number }} */
export function loadConfig() {
  const provider = process.env.VISION_PROVIDER ?? 'google';

  return {
    vision: {
      provider,
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiModel: process.env.OPENAI_VISION_MODEL ?? 'gpt-4o',
      googleApiKey: process.env.GOOGLE_API_KEY,
      googleModel: process.env.GOOGLE_VISION_MODEL ?? 'gemini-2.0-flash',
    },
    port: Number(process.env.PORT ?? 3000),
  };
}
