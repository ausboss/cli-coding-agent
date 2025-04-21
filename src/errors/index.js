// src/errors/index.js
import * as config from "../config/index.js"; // Import config to access URLs if needed

/* ================================================================== */
/* ERROR HANDLING                           */
/* ================================================================== */

/**
 * Standard error types relevant to the agent
 */
export const ERROR_TYPES = {
  // API / Network related errors
  BAD_REQUEST: "bad_request", // 400
  API_AUTH_ERROR: "api_auth_error", // 401/403 (API key issues)
  NOT_FOUND: "not_found", // 404 (e.g., bad model name, invalid endpoint)
  TIMEOUT: "timeout", // 408 / 504 / fetch timeout
  CONFLICT: "conflict", // 409 (Less common for chat, but possible)
  RATE_LIMITED: "rate_limited", // 429
  API_ERROR: "api_error", // General 500 from API
  SERVICE_UNAVAILABLE: "service_unavailable", // 503 / 502
  NETWORK_ERROR: "network_error", // Client-side network issues (fetch failed)

  // Tool related errors
  TOOL_SERVER_ERROR: "tool_server_error", // Error communicating with or executing on the tool server
  TOOL_NOT_FOUND: "tool_not_found", // Model requested a tool that doesn't exist
  INVALID_TOOL_ARGS: "invalid_tool_args", // Failed to parse tool arguments

  // Local/Configuration errors
  CONFIG_ERROR: "config_error", // e.g., missing API key, bad file path
  PROMPT_FILE_ERROR: "prompt_file_error", // Error reading system prompt file

  // Generic fallback
  UNKNOWN_ERROR: "unknown_error",
};

/**
 * User-friendly error messages for each error type
 * @type {Object.<string, string>}
 */
export const ERROR_MESSAGES = {
  [ERROR_TYPES.BAD_REQUEST]:
    "Invalid request sent to the API. Please check the input or parameters.",
  [ERROR_TYPES.API_AUTH_ERROR]: `Authentication failed. Please check your API Key (${config.ENV_VAR_API_KEY}).`,
  [ERROR_TYPES.NOT_FOUND]:
    "The requested API endpoint or resource was not found.",
  [ERROR_TYPES.TIMEOUT]:
    "The request timed out. The network or API might be slow. Please try again.",
  [ERROR_TYPES.CONFLICT]:
    "A conflict occurred. This might be due to concurrent operations.",
  [ERROR_TYPES.RATE_LIMITED]:
    "API rate limit exceeded. Please wait a moment and try again.",
  [ERROR_TYPES.API_ERROR]:
    "An unexpected error occurred on the API server side. Please try again later.",
  [ERROR_TYPES.SERVICE_UNAVAILABLE]:
    "The API service is temporarily unavailable. Please try again later.",
  [ERROR_TYPES.NETWORK_ERROR]:
    "Network error. Please check your internet connection and try again.",
  [ERROR_TYPES.TOOL_SERVER_ERROR]:
    "Error communicating with or executing the tool server.",
  [ERROR_TYPES.TOOL_NOT_FOUND]: "The requested tool could not be found.",
  [ERROR_TYPES.INVALID_TOOL_ARGS]: "Invalid arguments provided for the tool.",
  [ERROR_TYPES.CONFIG_ERROR]:
    "Configuration error. Please check environment variables or setup.",
  [ERROR_TYPES.PROMPT_FILE_ERROR]: "Error reading the system prompt file.",
  [ERROR_TYPES.UNKNOWN_ERROR]:
    "An unexpected error occurred. Please try again.",
};

/**
 * Maps HTTP status codes to standard error types for API/Tool server errors
 */
const STATUS_CODE_MAP = {
  400: ERROR_TYPES.BAD_REQUEST,
  401: ERROR_TYPES.API_AUTH_ERROR, // Unauthorized
  403: ERROR_TYPES.API_AUTH_ERROR, // Forbidden
  404: ERROR_TYPES.NOT_FOUND,
  408: ERROR_TYPES.TIMEOUT,
  409: ERROR_TYPES.CONFLICT,
  429: ERROR_TYPES.RATE_LIMITED,
  500: ERROR_TYPES.API_ERROR, // Internal Server Error mapped generally
  502: ERROR_TYPES.SERVICE_UNAVAILABLE, // Bad Gateway
  503: ERROR_TYPES.SERVICE_UNAVAILABLE,
  504: ERROR_TYPES.TIMEOUT, // Gateway Timeout
};

/**
 * Checks if an error object has already been processed by this service.
 * @param {any} error - The error object to check
 * @returns {boolean}
 */
export const isAlreadyProcessed = (error) => {
  // Export if needed elsewhere, otherwise keep internal
  return (
    error &&
    typeof error === "object" &&
    error.isProcessed === true &&
    error.type
  );
};

/**
 * Creates a standardised error object with consistent structure.
 * @param {Error|Object|any} error - The original error object
 * @param {string} defaultType - The default error type to assign if none detected
 * @returns {Object} A standardised error object
 */
export const createStandardError = (
  error,
  defaultType = ERROR_TYPES.UNKNOWN_ERROR
) => {
  // Ensure we capture the original error, even if it's not a standard Error instance
  const originalError =
    error instanceof Error ? error : new Error(String(error));

  return {
    type: defaultType,
    message:
      ERROR_MESSAGES[defaultType] || ERROR_MESSAGES[ERROR_TYPES.UNKNOWN_ERROR],
    details: null, // Specific details from the error response
    status: error?.status || error?.response?.status || null, // HTTP status if available
    originalError: originalError, // Keep the original error object
    isProcessed: true, // Mark as processed
    isRetryable: false, // Default to not retryable
    isOffline: false, // Network specific flag
  };
};

/**
 * Detects network errors caused by connectivity issues.
 * @param {Error|Object|any} error - The error object to check
 * @returns {boolean}
 */
export const isNetworkError = (error) => {
  // Standard fetch network error (often a TypeError)
  if (
    error instanceof TypeError &&
    (error.message.includes("fetch") ||
      error.message.includes("Network request failed"))
  ) {
    return true;
  }
  // Node.js specific network errors
  if (
    error.code &&
    (error.code.startsWith("ECONN") ||
      error.code === "ENOTFOUND" ||
      error.code === "EAI_AGAIN")
  ) {
    return true;
  }
  // Check if it was already marked as network error
  if (error?.type === ERROR_TYPES.NETWORK_ERROR || error?.isOffline === true) {
    return true;
  }
  // Check messages explicitly (less reliable but fallback)
  const msg = String(error.message || "").toLowerCase();
  if (msg.includes("failed to fetch") || msg.includes("connection refused")) {
    return true;
  }

  return false;
};

/**
 * Enhances a standard error object for network errors.
 * @param {Object} standardError - The standardised error object
 * @returns {Object} Error object with network information
 */
const handleNetworkError = (standardError) => {
  return {
    ...standardError,
    type: ERROR_TYPES.NETWORK_ERROR,
    message: ERROR_MESSAGES[ERROR_TYPES.NETWORK_ERROR],
    isRetryable: true, // Network errors are usually retryable
    // Assume offline in Node.js if network error occurs, check navigator in browser env
    isOffline: typeof navigator !== "undefined" ? !navigator.onLine : true,
  };
};

/**
 * Processes errors potentially originating from API calls or the tool server.
 * @param {Object} standardError - The standardised error object
 * @param {Error|Object|any} originalError - The original error
 * @returns {Object} Updated error object with API/Tool-specific information
 */
export const processApiOrToolError = (standardError, originalError) => {
  const error = { ...standardError };
  const status =
    originalError?.status ?? originalError?.response?.status ?? null;
  error.status = status; // Ensure status is set

  // Try to get detailed message from common error structures
  const responseData = originalError?.response?.data;
  const errorDetails =
    responseData?.error?.message ||
    responseData?.error ||
    originalError?.response?.error?.message ||
    originalError?.details ||
    null;

  if (errorDetails) {
    error.details =
      typeof errorDetails === "string"
        ? errorDetails
        : JSON.stringify(errorDetails);
    // Use detail as message if more specific than the default
    error.message = errorDetails;
  } else if (
    originalError instanceof Error &&
    originalError.message !== error.message
  ) {
    // Fallback to original error message if no details found and it's different
    error.details = originalError.message;
  }

  // Set error type based on HTTP status code
  if (status && STATUS_CODE_MAP[status]) {
    error.type = STATUS_CODE_MAP[status];
    // Update message only if we didn't get a more specific detail above
    if (!errorDetails) {
      error.message = ERROR_MESSAGES[error.type];
    }
  }

  // Specific logic based on type
  switch (error.type) {
    case ERROR_TYPES.RATE_LIMITED:
    case ERROR_TYPES.TIMEOUT:
    case ERROR_TYPES.SERVICE_UNAVAILABLE:
    case ERROR_TYPES.API_ERROR: // Consider retrying generic 500s carefully
      error.isRetryable = true;
      break;
    // Add other specific handling if needed
  }

  // If it came from the tool server (identified by URL in fetchJSON or specific logic)
  // Use the configured TOOL_SERVER_BASE_URL for detection
  if (
    config.TOOL_SERVER_BASE_URL &&
    originalError?.message?.includes(config.TOOL_SERVER_BASE_URL) &&
    error.type !== ERROR_TYPES.NETWORK_ERROR
  ) {
    error.type = ERROR_TYPES.TOOL_SERVER_ERROR;
    error.message = ERROR_MESSAGES[ERROR_TYPES.TOOL_SERVER_ERROR];
    if (error.details) error.message += ` Details: ${error.details}`;
    error.isRetryable = false; // Usually don't retry tool server errors automatically here
  }

  return error;
};

/**
 * Transforms various error objects into a standardised format. Main entry point.
 * @param {Error|Object|any} error - Original error object
 * @param {Object} [options={}] - Processing options
 * @param {string} [options.defaultType] - Fallback error type if detection fails
 * @returns {Object} Standardised error object
 */
export const processError = (error, options = {}) => {
  const { defaultType = ERROR_TYPES.UNKNOWN_ERROR } = options;

  // Return early if already processed to avoid loops
  if (isAlreadyProcessed(error)) {
    return error;
  }

  const standardError = createStandardError(error, defaultType);

  if (isNetworkError(error)) {
    return handleNetworkError(standardError);
  }

  // Process as potential API or Tool Server error (checks status, details etc.)
  return processApiOrToolError(standardError, error);
};

/**
 * Extract a user-friendly error message from a processed error object.
 * @param {Object} processedError - The *standardised* error object from processError
 * @param {string} [fallback] - Fallback message if none is found
 * @returns {string} User-friendly error message
 */
export const getErrorMessage = (
  processedError,
  fallback = ERROR_MESSAGES[ERROR_TYPES.UNKNOWN_ERROR]
) => {
  if (!processedError || !processedError.isProcessed) {
    // If not processed, try processing it now or return fallback
    if (processedError instanceof Error || typeof processedError === "object") {
      const newlyProcessed = processError(processedError);
      return newlyProcessed.message || newlyProcessed.details || fallback;
    }
    return fallback;
  }

  let message =
    processedError.message || ERROR_MESSAGES[processedError.type] || fallback;

  // Append details if they exist and aren't identical to the message
  if (processedError.details && processedError.details !== message) {
    // Avoid overly long messages in CLI output
    const detailSnippet = String(processedError.details).substring(0, 150);
    message += ` (Details: ${detailSnippet}${
      processedError.details.length > 150 ? "..." : ""
    })`;
  }

  return message;
};
