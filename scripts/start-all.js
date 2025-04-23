// start-all.js
// Script to start both MCP-FastAPI server and CLI Coding Agent

import chalk from "chalk";
import { exec, spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { createInterface } from "node:readline";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// Get the directory of the current script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths to the projects
const mcpFastApiPath = path.resolve(
  path.join(__dirname, "..", "..", "mcp-fastapi")
);
const cliCodingAgentPath = path.resolve(path.join(__dirname, ".."));

// Command to check if python process is running
const pythonProcessName = "python.exe";
const mcpServerPort = 8080;

console.log(chalk.cyan("Starting MCP FastAPI server and CLI Coding Agent..."));
console.log(chalk.gray(`MCP FastAPI path: ${mcpFastApiPath}`));
console.log(chalk.gray(`CLI Coding Agent path: ${cliCodingAgentPath}`));

// Check if a process is running on a specific port in LISTENING state
async function isPortInUse(port) {
  return new Promise((resolve) => {
    // Look specifically for LISTENING state on the port
    exec(
      `netstat -ano | findstr :${port} | findstr LISTENING`,
      (error, stdout, stderr) => {
        if (error || stderr || !stdout) {
          resolve(false);
          return;
        }

        // If we found the port in LISTENING state
        resolve(true);
      }
    );
  });
}

// Check if the MCP server is running and responding
async function isMcpServerRunning() {
  // First check if something is listening on the port
  const portInUse = await isPortInUse(mcpServerPort);

  if (!portInUse) {
    return false;
  }

  // Then try to make a request to the server to see if it's actually the MCP API
  try {
    return new Promise((resolve) => {
      // Simple HTTP request to check if server responds
      const req = http.get(`http://127.0.0.1:${mcpServerPort}/tools`, (res) => {
        if (res.statusCode === 200) {
          resolve(true); // Server is up and responding
        } else {
          resolve(false); // Server responded but with error
        }
        // Consume response data to free up memory
        res.resume();
      });

      req.on("error", () => {
        resolve(false); // Request failed, server not responding
      });

      // Set timeout to 2 seconds
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false); // Timeout, server not responding
      });
    });
  } catch (error) {
    console.error(chalk.red(`Error checking MCP server: ${error.message}`));
    return false;
  }
}

// Start the MCP FastAPI server
async function startMcpServer() {
  console.log(chalk.yellow("Starting MCP FastAPI server..."));

  const pythonProcess = spawn("python", ["main_api.py"], {
    cwd: mcpFastApiPath,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    detached: false, // Keep attached to the parent process
  });

  // Create readline interface to process the output line by line
  const stdout = createInterface({ input: pythonProcess.stdout });
  const stderr = createInterface({ input: pythonProcess.stderr });

  return new Promise((resolve, reject) => {
    // Flag to track if the server is ready
    let serverReady = false;

    // When the server logs that it's running
    stdout.on("line", (line) => {
      console.log(chalk.blue(`[MCP-API] ${line}`));

      // Check for indicators that the server is running
      if (
        line.includes("Application startup complete") ||
        line.includes("Uvicorn running") ||
        line.includes("Successfully connected to servers")
      ) {
        serverReady = true;
        console.log(chalk.green("MCP FastAPI server is ready!"));
        resolve(pythonProcess);
      }
    });

    stderr.on("line", (line) => {
      console.error(chalk.red(`[MCP-API Error] ${line}`));
      // Check stderr as well since many applications log to stderr during normal operation
      if (
        line.includes("Application startup complete") ||
        line.includes("Uvicorn running") ||
        line.includes("Successfully connected to servers")
      ) {
        serverReady = true;
        console.log(chalk.green("MCP FastAPI server is ready!"));
        resolve(pythonProcess);
      }
    });

    // Start a background health check process separate from log monitoring
    const healthCheckInterval = setInterval(async () => {
      try {
        const http = require("node:http");
        const req = http.get("http://127.0.0.1:8080/tools", (res) => {
          if (res.statusCode === 200) {
            console.log(
              chalk.green("MCP FastAPI server is responding to requests!")
            );
            clearInterval(healthCheckInterval);
            serverReady = true;
            resolve(pythonProcess);
          }
          // Consume response data to free up memory
          res.resume();
        });

        req.on("error", () => {
          // Server not ready yet, continue waiting
        });

        // Set a short timeout for each health check request
        req.setTimeout(1000, () => {
          req.destroy();
        });
      } catch (error) {
        // Ignore errors during health checks
      }
    }, 1000); // Check every second

    // Set a timeout for server startup
    setTimeout(30000).then(() => {
      clearInterval(healthCheckInterval);
      if (!serverReady) {
        console.error(
          chalk.red("MCP FastAPI server startup timed out after 30 seconds")
        );
        pythonProcess.kill();
        reject(new Error("Server startup timed out"));
      }
    });

    // Handle process exit
    pythonProcess.on("close", (code) => {
      if (!serverReady) {
        console.error(
          chalk.red(
            `MCP FastAPI server process exited with code ${code} before becoming ready`
          )
        );
        reject(new Error(`Server process exited with code ${code}`));
      }
    });
  });
}

// Start the CLI Coding Agent
async function startCliAgent() {
  console.log(chalk.yellow("Starting CLI Coding Agent..."));

  // Import fs for file operations
  const fs = await import("node:fs");

  const nodeProcess = spawn("node", ["agent.js"], {
    cwd: cliCodingAgentPath,
    stdio: "inherit", // Inherit all stdio from parent
    shell: true,
    env: {
      ...process.env,
      // Force reload the .env file
      DOTENV_CONFIG_OVERRIDE: "true",
    },
  });

  // The process will take over the terminal, so we don't need to do much here
  nodeProcess.on("close", (code) => {
    console.log(chalk.cyan(`CLI Coding Agent exited with code ${code}`));
    // Optionally kill the MCP server when the agent exits
    // mcpProcess.kill();
  });

  return nodeProcess;
}

// Main function to orchestrate the startup
async function main() {
  try {
    // Check if MCP server is already running
    const mcpRunning = await isMcpServerRunning();

    let mcpProcess = null;

    if (mcpRunning) {
      console.log(
        chalk.green("MCP FastAPI server is already running on port 8080")
      );
    } else {
      // Start MCP server
      mcpProcess = await startMcpServer();

      // Give a moment for the server to stabilize
      await setTimeout(1000);
    }

    // Start CLI agent
    await startCliAgent();
  } catch (error) {
    console.error(chalk.red(`Error during startup: ${error.message}`));
    process.exit(1);
  }
}

// Run the main function
main().catch((err) => {
  console.error(chalk.red(`Unhandled error: ${err.message}`));
  process.exit(1);
});
