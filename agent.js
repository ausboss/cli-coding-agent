// agent.js
// Run:  API_KEY=your-gemini-api-key node agent.js
// Deps: npm i openai dotenv chalk tiktoken marked marked-terminal

import chalk from "chalk";
import { runCLI } from "./src/cli/interface.js";
import * as config from "./src/config/index.js"; // Import config
import {
  ERROR_TYPES,
  getErrorMessage,
  processError,
} from "./src/errors/index.js";

// Initial check for API key
if (!config.API_KEY) {
  console.error(
    chalk.red(
      `🚨 Error: ${config.ENV_VAR_API_KEY} environment variable not set. Please provide your API Key.`
    )
  );
  console.error(
    chalk.yellow(
      `Set it in your .env file or run with: API_KEY=your-api-key node agent.js`
    )
  );
  process.exit(1);
}

console.log(chalk.cyan("Starting CLI Agent with Gemini API via OpenAI compatibility layer..."));

// --- Run the Agent ---
runCLI().catch((err) => {
  // Catch any truly unhandled exceptions during async execution or setup
  const finalError = processError(err); // Process final uncaught error
  console.error(
    chalk.red("\n🚨 A critical unhandled error occurred:"),
    getErrorMessage(finalError)
  );
  console.error("Original Error:", finalError.originalError); // Log original for debugging

  // Specific check for auth errors on startup
  if (finalError.type === ERROR_TYPES.API_AUTH_ERROR) {
    console.error(
      chalk.yellow(
        `Ensure the ${config.ENV_VAR_API_KEY} environment variable is set correctly.`
      )
    );
  } else if (finalError.message.includes(config.TOOL_SERVER_BASE_URL)) {
    console.error(
      chalk.yellow(
        `Ensure the tool server is running at ${config.TOOL_SERVER_BASE_URL} and accessible.`
      )
    );
  }

  process.exit(1);
});