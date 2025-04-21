// src/api/client.js
import chalk from 'chalk';
import OpenAI from 'openai';
import * as config from '../config/index.js';
import { ERROR_TYPES, getErrorMessage, processError } from '../errors/index.js';

// Initialize OpenAI client here
const openai = new OpenAI({
  apiKey: config.API_KEY,
  baseURL: config.BASE_URL,
});

/**
 * Makes a chat completion request to the configured API endpoint with retry logic.
 * @param {Array<object>} messages - The message history array.
 * @param {Array<object>} toolsSpecs - The tool specifications for the API.
 * @returns {Promise<object>} The API response object (specifically `response.choices[0].message`).
 * @throws {object} A processed error object if the API call ultimately fails.
 */
export async function callChatApi(messages, toolsSpecs) {
    let response = null;
    let lastError = null;

    for (let attempt = 1; attempt <= config.MAX_RETRIES + 1; attempt++) { // +1 for final error check
        if (attempt > 1) {
             console.log(chalk.yellow(`\n⏳ Retrying API Call (Attempt ${attempt}/${config.MAX_RETRIES})...`));
        } else {
             console.log(chalk.blue(`\n⏳ Calling API (Model: ${config.MODEL})...`));
        }
        try {
            response = await openai.chat.completions.create({
                model: config.MODEL,
                messages: messages,
                tools: toolsSpecs.length > 0 ? toolsSpecs : undefined, // Only send tools if available
                tool_choice: toolsSpecs.length > 0 ? "auto" : undefined, // Only send tool_choice if tools are present
                // temperature: 0.7, // Optional: Add if needed
            });
            lastError = null; // Reset error on success
            console.log(chalk.green("✅ API Call Successful."));
            break; // Exit retry loop on success

        } catch (error) {
            lastError = processError(error); // Process error immediately
            console.error(chalk.red(`🚨 API Call Error (Attempt ${attempt}):`), getErrorMessage(lastError));

            if (lastError.isRetryable && attempt < config.MAX_RETRIES) {
                const delay = config.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                console.log(chalk.yellow(`   Retrying in ${delay / 1000}s...`));
                await new Promise(resolve => setTimeout(resolve, delay));
                // Continue to the next attempt
            } else {
                if (!lastError.isRetryable) console.log(chalk.magenta("   Error is not retryable."));
                else console.log(chalk.magenta(`   Max retries (${config.MAX_RETRIES}) reached.`));
                // No more retries, exit loop, lastError will be handled below
                break;
            }
        }
    } // --- End Retry Loop ---

    // After the loop, check if we ended with an error
    if (lastError) {
        console.error(chalk.red(`🚨 Failed to get response from API after ${config.MAX_RETRIES} retries.`));
        // Throw the processed error to be handled by the caller (CLI loop)
        throw lastError;
    }

    // Return the core message part of the response
    if (response && response.choices && response.choices.length > 0) {
        return response.choices[0].message;
    } else {
        // Should not happen with successful API call, but handle defensively
        const unexpectedRespError = new Error("API returned an unexpected response structure.");
        throw processError(unexpectedRespError, { defaultType: ERROR_TYPES.API_ERROR });
    }
}