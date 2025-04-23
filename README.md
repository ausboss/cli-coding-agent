# CLI Coding Agent

A command-line interface agent interacting with Google Gemini API (via OpenAI compatibility layer) and custom tools.

## Features

- CLI interface for interacting with Gemini AI
- Built-in tools integration via MCP FastAPI server
- Easy-to-use commands for daily development tasks

## Prerequisites

- Node.js >= 18.0.0
- Python (for running MCP FastAPI tools server)
- MCP FastAPI tools (in `C:\Users\admin\Documents\mcp-fastapi`)

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Copy `sample.env` to `.env` and update with your API key:
   ```
   cp sample.env .env
   ```

3. Edit `.env` and add your Gemini API key:
   ```
   API_KEY=your-api-key-here
   ```

## Usage

### Running Just the CLI Agent

If you've already started the MCP FastAPI server separately:

```
npm start
```

or

```
node agent.js
```

### Running Both CLI Agent and MCP FastAPI Server

To start both the CLI agent and the MCP FastAPI tools server with a single command:

```
npm run start:all
```

or use the batch file:

```
start-all.bat
```

This will:
1. Check if the MCP FastAPI server is already running
2. Start the server if it's not already running
3. Wait for the server to be ready
4. Start the CLI Coding Agent

The integration ensures you don't need to run two separate commands to start both components.

## Configuration

- The CLI agent connects to the MCP FastAPI server at the URL specified in `.env` (default: http://127.0.0.1:8080)
- The MCP FastAPI server requires its own configuration, which should be set up in the mcp-fastapi directory

## Tools

The CLI agent integrates with tools provided by the MCP FastAPI server, allowing for:
- File operations
- Web searches
- Code execution
- And more depending on configured tools

## License

MIT
