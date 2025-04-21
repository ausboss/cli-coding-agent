// src/cli/interface.js
import chalk from 'chalk';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { stdin as input, stdout as output } from 'node:process';
import readline from 'node:readline/promises';

import { callChatApi } from '../api/client.js';
import * as config from '../config/index.js';
import { calculateApiCallCost, estimateMessagesTokens, estimateTokens, getTokenizer } from '../costing/index.js';
import { ERROR_TYPES, getErrorMessage, isAlreadyProcessed, processError } from '../errors/index.js';
import { buildSystemPrompt } from '../prompts/builder.js';
import { loadTools, toolsToOpenAISpec } from '../tools/index.js';

// Setup markdown rendering
marked.use(markedTerminal());

/**
 * Runs the main interactive Command Line Interface loop.
 */
export async function runCLI() {
  let tools = [];
  let openAIToolSpecs = [];
  let systemPrompt = "";
  let tokenizer = getTokenizer(); // Get the loaded tokenizer status

  try {
      tools = await loadTools();
      openAIToolSpecs = toolsToOpenAISpec(tools);
      systemPrompt = await buildSystemPrompt(tools);
  } catch (error) {
      // loadTools and buildSystemPrompt already log specific errors
      // The main entry point's catch block will handle final exit
      console.error(chalk.red("🚨 Agent initialization failed due to errors during setup."));
      throw error; // Re-throw to be caught by the main agent.js catch block
  }

  const messages = [{ role: "system", content: systemPrompt }];

  let totalSessionCost = 0;
  let sessionCurrency = config.MODEL_PRICING[config.MODEL]?.currency || 'USD';

  const rl = readline.createInterface({ input, output, prompt: chalk.green("You: ") });
  console.log(chalk.bold("\n✅ Gemini CLI Agent Initialized"));
  console.log(`   Model: ${chalk.blue(config.MODEL)}`);
  console.log(`   Endpoint: ${chalk.blue(config.BASE_URL)}`);
  console.log(`   Tools: ${chalk.blue(tools.length)} (${tools.map(t=>t.name).join(', ') || 'None'})`);
  console.log(`   System Prompt: ${config.PROMPT_FILE} ${ chalk.dim(`(${estimateTokens(systemPrompt)} tokens)`) }`);
  console.log(chalk.yellow("   Type '/cost' to see estimated session cost."));
  console.log(chalk.yellow("   Type 'quit' or press Ctrl+C to exit."));
  rl.prompt();

  rl.on('line', async (userInput) => {
    const trimmedInput = userInput.trim();

    if (trimmedInput.toLowerCase() === "quit") {
      rl.close();
      return;
    }

    // --- Handle /cost command ---
    if (trimmedInput.toLowerCase() === '/cost') {
        console.log(chalk.blue(`\n---\n📊 Estimated total session cost: ${totalSessionCost.toFixed(6)} ${sessionCurrency}\n---`));
        rl.prompt(); // Ask for next input
        return; // Don't process as a message to the API
    }

    if (!trimmedInput) {
      rl.prompt(); // Don't send empty messages
      return;
    }

    messages.push({ role: "user", content: trimmedInput });

    let waitingForExecution = true; // Controls the inner loop for API calls and tool responses
    while (waitingForExecution) {
        let inputTokens = 0;
        let outputTokens = 0;
        let responseMessage = null; // Will hold the message object from the API

        try {
             // --- Estimate input tokens ---
             if (tokenizer) {
                 inputTokens = estimateMessagesTokens(messages);
                 // TODO: Could add estimateToolsTokens(openAIToolSpecs) if needed
             }

             // --- Call the API ---
             responseMessage = await callChatApi(messages, openAIToolSpecs);
             messages.push(responseMessage); // Add assistant's response (or tool request) to history

             // --- Estimate Output Tokens & Calculate Cost ---
             let callCost = 0;
             let costString = "";
             if (tokenizer) {
                 // Estimate tokens for the response content
                 if (responseMessage.content) {
                     outputTokens += estimateTokens(responseMessage.content);
                 }
                 // Estimate tokens for any tool calls requested *by the model*
                 if (responseMessage.tool_calls) {
                     responseMessage.tool_calls.forEach(tc => {
                         if(tc.function?.name) outputTokens += estimateTokens(tc.function.name);
                         if(tc.function?.arguments) outputTokens += estimateTokens(tc.function.arguments);
                     });
                 }

                 const { cost, currency } = calculateApiCallCost(inputTokens, outputTokens, config.MODEL);
                 callCost = cost;
                 sessionCurrency = currency; // Update session currency just in case
                 totalSessionCost += callCost; // Add to session total
                 costString = chalk.dim(`[Est. Cost: ${callCost.toFixed(6)} ${currency} (+${inputTokens}i/+${outputTokens}o)]`);
             }

             // --- Process Response: Check for Tool Calls ---
             const toolCalls = responseMessage.tool_calls;
             if (toolCalls && toolCalls.length > 0) {
                console.log(chalk.yellow(`\n⚙️ Assistant wants to call ${toolCalls.length} tool(s)... ${costString}`));

                const toolResultsPromises = toolCalls.map(async (call) => {
                    if (call.type !== "function") {
                        console.warn(`Unsupported tool call type: ${call.type}. Skipping.`);
                        return { // Return error result for unsupported type
                            tool_call_id: call.id,
                            role: "tool",
                            name: call.function?.name || "unknown_function",
                            content: JSON.stringify({ error: true, message: `Unsupported tool call type: ${call.type}` }),
                        };
                    }

                    const functionToCall = call.function;
                    const tool = tools.find((t) => t.name === functionToCall.name);
                    let resultJson;

                    if (!tool) {
                        console.error(chalk.red(`🚨 Unknown tool requested: ${functionToCall.name}`));
                        const toolNotFoundError = processError({ // Create a structured error
                            message: `Tool '${functionToCall.name}' not found. Available: ${tools.map(t=>t.name).join(', ')}`,
                        }, { defaultType: ERROR_TYPES.TOOL_NOT_FOUND });
                        resultJson = JSON.stringify({ error: true, message: getErrorMessage(toolNotFoundError) });
                    } else {
                        try {
                            console.log(
                                chalk.cyan(`  ▶️ Calling local tool: ${tool.name} with args: ${functionToCall.arguments}`)
                            );
                            let args = {};
                            try {
                                args = JSON.parse(functionToCall.arguments || "{}");
                            } catch (parseError) {
                                console.error(chalk.red(`  🚨 Error parsing arguments for ${tool.name}: ${parseError.message}`));
                                console.error(`  Raw arguments string: ${functionToCall.arguments}`);
                                const invalidArgsError = processError({ // Structured error
                                    message: `Invalid JSON arguments provided for tool ${tool.name}. Check the format.`,
                                    details: parseError.message,
                                }, { defaultType: ERROR_TYPES.INVALID_TOOL_ARGS });
                                throw invalidArgsError; // Throw structured error to be caught below
                            }

                            // Call the tool's function (which includes fetchJSON error handling)
                            const result = await tool.call(args);
                            resultJson = JSON.stringify(result ?? null); // Ensure null results are stringified
                            // Log snippet, handle potential large results
                            const resultSnippet = resultJson.length > 200 ? resultJson.substring(0, 190) + '... (truncated)' : resultJson;
                            console.log(chalk.green(`  ◀️ Result from ${tool.name}:`), resultSnippet);

                        } catch (err) { // Catch errors from tool.call or arg parsing
                            // Ensure the error is processed if it wasn't already
                            const processedToolError = isAlreadyProcessed(err) ? err : processError(err, { defaultType: ERROR_TYPES.TOOL_SERVER_ERROR });
                            console.error(chalk.red(`  🚨 Error executing tool ${tool.name}:`), getErrorMessage(processedToolError));
                            resultJson = JSON.stringify({ error: true, message: `Error in tool ${tool.name}: ${getErrorMessage(processedToolError)}` });
                        }
                    }

                    // Return the message object expected by the API for a tool result
                    return {
                        tool_call_id: call.id,
                        role: "tool",
                        name: functionToCall.name, // Use the requested name even if not found
                        content: resultJson,
                    };
                }); // End map over toolCalls

                const toolResults = await Promise.all(toolResultsPromises);
                messages.push(...toolResults); // Add results to history

                console.log(chalk.blue("✅ Tool calls processed. Sending results back to API..."));
                // Loop back: Continue the 'while(waitingForExecution)' loop
                // waitingForExecution remains true
             } else {
                 /* Normal assistant text reply */
                 if (responseMessage.content) {
                     console.log(`\n${costString}`); // Display cost estimate first
                     // Use marked to render markdown in the terminal
                     console.log(marked.parse(`🤖 ${chalk.bold('Assistant:')}\n${responseMessage.content}`));
                 } else {
                      console.log(`\n${costString}`); // Still show cost
                      console.log(chalk.dim("🤖 Assistant: (Received response with no text content)"));
                 }
                 waitingForExecution = false; // Exit the while loop, API call finished without tools
             }

        } catch (error) {
            // Catch errors from callChatApi or tool execution/parsing
            const processedError = isAlreadyProcessed(error) ? error : processError(error); // Ensure it's processed
            const errorMessageForUser = getErrorMessage(processedError);
            const errorType = processedError.type || ERROR_TYPES.UNKNOWN_ERROR;

            let specificAssistantMessage = `Sorry, I encountered an issue: ${errorMessageForUser}. `;

            // Add specific advice based on error type
           switch (errorType) {
               case ERROR_TYPES.RATE_LIMITED:
                   specificAssistantMessage += "This usually means too many requests were sent quickly. ";
                   break;
               case ERROR_TYPES.NETWORK_ERROR:
               case ERROR_TYPES.TIMEOUT:
                   specificAssistantMessage += "This seems like a network or connection problem. ";
                   break;
               case ERROR_TYPES.SERVICE_UNAVAILABLE:
               case ERROR_TYPES.API_ERROR:
                   specificAssistantMessage += "The API service might be temporarily down or experiencing issues. ";
                   break;
                case ERROR_TYPES.TOOL_SERVER_ERROR:
                case ERROR_TYPES.TOOL_NOT_FOUND:
                case ERROR_TYPES.INVALID_TOOL_ARGS:
                    specificAssistantMessage += "There was a problem using one of the tools. ";
                    break;
               case ERROR_TYPES.API_AUTH_ERROR:
                    specificAssistantMessage = `Authentication failed (${errorMessageForUser}). Please check your ${config.ENV_VAR_API_KEY} environment variable. You'll need to restart the agent after fixing it.`;
                    console.error(chalk.red(`\n🚨 FATAL ERROR: ${specificAssistantMessage}`));
                    rl.close(); // Exit agent
                    return; // Stop processing immediately
           }

            // Add the "Continue" prompt unless it's a fatal error like auth
           if (errorType !== ERROR_TYPES.API_AUTH_ERROR) {
              specificAssistantMessage += "Please check the error details above. You can try again or enter a new request.";
           }

            console.error( // Log the detailed error for debugging
                chalk.red(`\n🚨 Error during execution loop. Type: ${errorType}`),
                processedError // Log the full processed error object
           );

           // Add specific error message to history AND display it
           console.log(marked.parse(`🤖 ${chalk.bold('Assistant:')}\n${chalk.red(specificAssistantMessage)}`));
           messages.push({ role: "assistant", content: specificAssistantMessage }); // Add error message to history

           waitingForExecution = false; // Exit the inner while loop after handling the error
        }

    } // End while(waitingForExecution)

    rl.prompt(); // Show prompt for next user input

  }).on('close', () => {
    // Display final session cost on exit
    console.log(chalk.blue(`\n---\n📊 Estimated total session cost: ${totalSessionCost.toFixed(6)} ${sessionCurrency}\n---`));
    console.log(chalk.bold('\n👋 Exiting CLI Agent. Goodbye!'));
    process.exit(0);
  });
}