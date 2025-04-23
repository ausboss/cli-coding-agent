# Gemini API Setup Guide

This document explains how to set up and troubleshoot the Gemini API integration for the CLI Coding Agent.

## Configuration

The CLI Coding Agent uses the Google Gemini API through its OpenAI compatibility layer. The following configuration settings in `.env` are critical:

```
API_KEY="your-gemini-api-key-here"
MODEL_CHOICE="gemini-1.5-flash"
BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai"
```

### Important Notes:

1. **No trailing slash** in the BASE_URL - this will cause 400 errors
2. Use `gemini-1.5-flash` as the model (not 2.0 yet, which has compatibility issues)
3. The API key must be a valid Google AI Studio API key

## Troubleshooting

If you encounter the error "400 Bad Request (no body)", check the following:

1. Ensure your `.env` file has the correct settings as shown above
2. Check that your API key is valid and has access to the Gemini models
3. Verify no trailing slash in the BASE_URL
4. Use the `test-api.js` script to diagnose connection issues:
   ```
   node test-api.js
   ```

## Common Errors

### 400 Bad Request (no body)

This error typically indicates one of the following issues:
- Incorrect BASE_URL format (check for trailing slash)
- Incompatible model version
- Missing API key or authentication parameter

### 404 Not Found

This error suggests that the endpoint URL is incorrect. Double-check the BASE_URL value.

## Updates

The `scripts/start-all.js` script now automatically:
1. Checks for a valid API key in the `.env` file
2. Updates the model version and BASE_URL if needed
3. Ensures both the MCP server and CLI agent start correctly

## How It Works

The OpenAI client is configured with these special settings for Gemini compatibility:

```javascript
const openai = new OpenAI({
  apiKey: config.API_KEY,
  baseURL: config.BASE_URL,
  defaultQuery: { "key": config.API_KEY },
  defaultHeaders: { "x-goog-api-key": config.API_KEY },
});
```

This ensures that the API key is sent both in headers and as a query parameter, which seems to be required by the Gemini OpenAI compatibility layer.
