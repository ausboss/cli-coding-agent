// src/config/index.js
import path from 'node:path';

// --- Configuration ---
// Make ENV var names constants for easier finding
export const ENV_VAR_BASE_URL = "BASE_URL";
export const ENV_VAR_MODEL = "MODEL_CHOICE";
export const ENV_VAR_PROMPT_FILE = "SYSTEM_PROMPT_FILE";
export const ENV_VAR_API_KEY = "GEMINI_API_KEY"; // Changed for clarity
export const ENV_VAR_TOOL_SERVER = "TOOL_SERVER_BASE_URL";

export const BASE_URL = process.env[ENV_VAR_BASE_URL] ?? "https://generativelanguage.googleapis.com/v1beta/openai/";
export const MODEL = process.env[ENV_VAR_MODEL] ?? "gemini-2.5-pro-preview-03-25"; // Verify this model name is valid for BASE_URL
export const PROMPT_FILE = process.env[ENV_VAR_PROMPT_FILE] ?? path.resolve("system_prompt.txt");
export const API_KEY = process.env[ENV_VAR_API_KEY];
export const TOOL_SERVER_BASE_URL = process.env[ENV_VAR_TOOL_SERVER] ?? "http://127.0.0.1:8080";

// --- Retry Configuration ---
export const MAX_RETRIES = 3; // Maximum number of retries for API calls
export const INITIAL_RETRY_DELAY_MS = 1000; // Initial delay in milliseconds

// --- Pricing Configuration ---
// !!! IMPORTANT: VERIFY AND UPDATE THESE VALUES WITH CURRENT GOOGLE CLOUD PRICING !!!
export const MODEL_PRICING = {
    'gemini-2.5-pro-preview-03-25': { // Ensure this key matches your MODEL const
        // Prices per MILLION tokens (example values, replace with actuals)
        inputCostPerMillionTokens: 1.25,  // Price for prompts <= 200k tokens
        outputCostPerMillionTokens: 10.00, // Price for prompts <= 200k tokens
        currency: 'USD'
    },
    // Add other models if you switch between them
    // 'gemini-1.5-flash-latest': {
    //     inputCostPerMillionTokens: 0.35,
    //     outputCostPerMillionTokens: 0.70,
    //     currency: 'USD'
    // },
};

// --- Validate required config ---
// Example: Could add more checks here if needed
// if (!API_KEY) { ... } // Or handle this in the main entry point as done currently