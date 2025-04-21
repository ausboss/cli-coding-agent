// src/tools/index.js
import chalk from 'chalk';
import * as config from '../config/index.js';
import { ERROR_TYPES, getErrorMessage, isAlreadyProcessed, processError } from '../errors/index.js';
import { fetchJSON } from './fetcher.js';

/* ------------------------------------------------------------------ */
/* Tool Discovery and Execution                                       */
/* ------------------------------------------------------------------ */

/**
 * Loads tool definitions from the tool server.
 * @returns {Promise<Array<object>>} A promise resolving to an array of tool objects.
 * @throws {Error} If loading fails (error object will be processed).
 */
export async function loadTools() {
  console.log(`⏳ Loading tools from ${config.TOOL_SERVER_BASE_URL}...`);
  let names = [];
  try {
    names = await fetchJSON(`${config.TOOL_SERVER_BASE_URL}/tools`);
    if (!Array.isArray(names)) {
       // Create a structured error for processing
       const formatError = new Error("Tool server did not return a list of tool names.");
       formatError.type = ERROR_TYPES.TOOL_SERVER_ERROR; // Assign specific type
       throw formatError;
    }
    console.log(`Found ${names.length} potential tools: ${names.join(', ')}`);
    const tools = [];

    for (const name of names) {
       const { description, parametersSchema } = await fetchJSON(
         `${config.TOOL_SERVER_BASE_URL}/tools/${name}`
       );

       // Define the call function specific to this tool
       async function call(args = {}) {
         console.log(chalk.cyan(`  ➡️ Calling tool server: ${config.TOOL_SERVER_BASE_URL}/tools/${name}/call with args:`), args);
         // Inner try-catch to specifically handle tool *call* errors
         try {
             const res = await fetchJSON(`${config.TOOL_SERVER_BASE_URL}/tools/${name}/call`, {
                 method: "POST",
                 headers: { "content-type": "application/json" },
                 body: JSON.stringify({ parameters: args }),
             });
             // Ensure result exists before logging/returning
             const result = res?.result;
             console.log(chalk.green(`  ✅ Tool server response for ${name}:`), result ?? '(No result field)');
             return result; // Return only the result field if present

         } catch (toolCallError) {
             // fetchJSON already provides a processed error
             // Re-tag or enhance if needed, but it should be processed
             toolCallError.type = ERROR_TYPES.TOOL_SERVER_ERROR; // Ensure type reflects tool error
             console.error(chalk.red(`  🚨 Error calling tool ${name}:`), getErrorMessage(toolCallError));
             // Re-throw the processed error so the main loop catches it as a tool execution failure
             throw toolCallError;
         }
       }

       tools.push({ name, description, parametersSchema, call });
       console.log(`   👍 Loaded tool: ${name}`);
    }
    console.log(chalk.green(`✅ Successfully loaded ${tools.length} tools.`));
    return tools;
  } catch (error) {
     // Catch errors during the *loading* process (fetchJSON already processed)
     const processedError = isAlreadyProcessed(error) ? error : processError(error, { defaultType: ERROR_TYPES.TOOL_SERVER_ERROR });
     console.error(chalk.red(`🚨 Failed to load tools from ${config.TOOL_SERVER_BASE_URL}:`), getErrorMessage(processedError));
     // Throw a new error with a clear message for agent initialization failure
     const initError = new Error(`Could not load tools. Is the tool server running at ${config.TOOL_SERVER_BASE_URL}? Original error: ${getErrorMessage(processedError)}`);
     initError.originalError = processedError; // Attach original processed error
     throw initError; // Throw the new higher-level error
  }
}

/**
 * Converts loaded tools into the format expected by the OpenAI API 'tools' parameter.
 * @param {Array<object>} tools - The array of tool objects loaded by loadTools.
 * @returns {Array<object>} An array formatted for the OpenAI API.
 */
export function toolsToOpenAISpec(tools) {
  if (!Array.isArray(tools)) return [];
  // Add validation for parametersSchema format if needed
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || "(No description provided)",
      // Ensure parameters is always a valid JSON schema object
      parameters: t.parametersSchema && typeof t.parametersSchema === 'object'
                    ? t.parametersSchema
                    : { type: "object", properties: {} },
    },
  }));
}