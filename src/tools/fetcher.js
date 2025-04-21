// src/tools/fetcher.js
import { ERROR_TYPES, isAlreadyProcessed, isNetworkError, processError } from '../errors/index.js';

/**
 * A wrapper around fetch that handles JSON parsing and integrates with processError.
 * @param {string} url - The URL to fetch.
 * @param {object} [opts={}] - Fetch options (method, headers, body, etc.).
 * @returns {Promise<object>} - The parsed JSON response.
 * @throws {object} - A *processed* error object on failure.
 */
export async function fetchJSON(url, opts = {}) {
  try {
    const r = await fetch(url, opts);
    const text = await r.text(); // Read text first

    if (!r.ok) {
      let detail = `Request to ${url} failed`;
      try {
        const jsonError = JSON.parse(text);
        // Prefer specific error messages from the server
        detail = jsonError.error?.message || jsonError.detail || jsonError.message || text || detail;
      } catch {
        detail = text || detail; // Fallback to raw text or default
      }
      // Create a more structured error object for processError
      const httpError = new Error(`HTTP ${r.status} ${r.statusText} - ${detail}`);
      httpError.status = r.status; // Attach status code
      httpError.response = { status: r.status, statusText: r.statusText, data: text }; // Mimic common structures
      httpError.details = detail; // Add extracted detail
      throw httpError; // Throw the structured error
    }
    return text ? JSON.parse(text) : {}; // Return empty object for empty valid responses
  } catch (error) {
     // If it's already processed (e.g. re-thrown from another layer), just pass it on
     if (isAlreadyProcessed(error)) {
        throw error;
     }
    // Process fetch-related errors (network, HTTP) before re-throwing
    // Determine default type based on context or error properties
    let defaultType = ERROR_TYPES.UNKNOWN_ERROR;
    if (isNetworkError(error)) { // Check for network errors specifically
        defaultType = ERROR_TYPES.NETWORK_ERROR;
    } else if (error.status) { // It's likely an HTTP error from the block above
        // processApiOrToolError inside processError will map the status code
        defaultType = ERROR_TYPES.API_ERROR; // Default for HTTP errors before specific mapping
    }
    // Ensure the error is processed and contains necessary context
    const processedError = processError(error, { defaultType });

    // Throw the *processed* error object so downstream catches get the standardized format
    throw processedError;
  }
}