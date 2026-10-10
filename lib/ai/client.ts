import { createOpenAI } from '@ai-sdk/openai';

export function getAiConfig() {
  let apiKey = (process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
  apiKey = apiKey.replace(/^=+/, '').trim();

  let baseURL = (process.env.AI_BASE_URL || '').trim();
  baseURL = baseURL.replace(/^=+/, '').trim();

  if (!baseURL) {
    baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
  }

  let modelName = (process.env.AI_MODEL || '').trim().replace(/^=+/, '').trim();
  if (!modelName) {
    modelName = 'gemini-2.0-flash';
  }

  return { apiKey, baseURL, modelName };
}

export function getLanguageModel() {
  const { apiKey, baseURL, modelName } = getAiConfig();

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error(
      'Missing or invalid AI_API_KEY in environment variables. Please check your .env or .env.local file.'
    );
  }

  const customOpenAi = createOpenAI({
    apiKey,
    baseURL,
  });

  return customOpenAi.chat(modelName);
}
