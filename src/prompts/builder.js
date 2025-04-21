// src/prompts/builder.js
import chalk from 'chalk';
import fs from 'node:fs/promises';
import os from 'node:os';
import * as config from '../config/index.js'; // Import config for PROMPT_FILE path
import { ERROR_TYPES, getErrorMessage, processError } from '../errors/index.js';

/**
 * Reads the system prompt template, replaces placeholders, and appends tool info.
 * @param {Array<object>} tools - The array of loaded tool objects.
 * @returns {Promise<string>} The fully constructed system prompt.
 * @throws {object} - Processed error object if file reading fails.
 */
export async function buildSystemPrompt(tools = []) {
  let rawPrompt = "";
  try {
      rawPrompt = await fs.readFile(config.PROMPT_FILE, "utf8");
  } catch (error) {
      const processedError = processError(error, { defaultType: ERROR_TYPES.PROMPT_FILE_ERROR });
      if (error.code === 'ENOENT') {
          console.error(chalk.red(`🚨 Error: System prompt file not found at ${config.PROMPT_FILE}`));
          console.error(`Please create this file or specify a correct path via ${config.ENV_VAR_PROMPT_FILE} environment variable.`);
          console.warn(chalk.yellow("⚠️ Using a default fallback system prompt."));
          // Define a simple default prompt
          rawPrompt = `You are a helpful assistant.
Current directory: {cwd}
User: {username}
OS: {os_info}
Tools available: {tool_count}
Date: {current_date}`;
          // Don't re-throw here, proceed with the default
      } else {
          console.error(chalk.red(`🚨 Error reading system prompt file ${config.PROMPT_FILE}:`), getErrorMessage(processedError));
          throw processedError; // Re-throw processed error for other file errors
      }
  }

  const vars = {
    username: os.userInfo().username || 'unknown_user',
    os_info: `${os.type()} ${os.release()}` || 'unknown_os',
    cwd: process.cwd() || 'unknown_directory',
    home: os.homedir() || 'unknown_home',
    tool_count: tools.length,
    current_date: new Date().toLocaleDateString(undefined, { // More robust date formatting
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }),
  };

  // Replace placeholders like {variable_name}
  const body = rawPrompt.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`); // Keep unknown placeholders

  // Build tool inventory string
  const inventory = tools.length > 0
    ? tools
      .map(
        (t, i) =>
          `### ${i + 1}. \`${t.name}\`\n` +
          `${t.description || "(No description provided)"}\n` +
          // Safely access nested properties
          `*Params*: ${
             Object.keys(t.parametersSchema?.properties || {}).join(", ") || "None"
           }\n`
      )
      .join("\n")
    : "No tools available.";


  return `${body}\n\n---\n## Tools Available (${tools.length})\n${inventory}`;
}