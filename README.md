# WhatsApp AI Agent with Google Gemini

This application creates an AI-powered agent that can read and respond to your WhatsApp messages, perform web searches, and provide helpful information using Google's free Gemini models.

## Features

- Automatically reads incoming WhatsApp messages
- Uses Google Gemini AI to understand message content and intent
- Performs Google searches when additional information is needed
- Generates helpful responses based on search results or direct AI knowledge
- Responds to messages on your behalf
- **NEW**: Can learn and respond in your writing style
- **NEW**: Uses Google's Gemini free tier models (no payment required)
- **NEW**: Includes a style analyzer tool to understand your writing patterns
- **NEW**: Option to restrict responses to specific WhatsApp groups only

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- npm
- A Google Gemini API key (free)

### Getting a Google Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click on "Get API key" or "Create API key"
4. Copy the generated API key
5. Add it to your .env file as `GEMINI_API_KEY=your_key_here`

### Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file based on the `.env.example` template:
   ```
   # Copy the example file
   cp .env.example .env
   
   # Edit the file and add your Gemini API key
   ```

### Usage

1. Start the application:
   ```
   npm start
   ```
2. A QR code will be displayed in the terminal. Scan this QR code with your WhatsApp app:
   - Open WhatsApp on your phone
   - Go to Settings > WhatsApp Web/Desktop
   - Tap on "Link a Device"
   - Scan the QR code displayed in your terminal

3. Once connected, the agent will automatically respond to incoming messages.

### Group Restriction Feature

You can restrict the agent to only respond to specific WhatsApp groups:

1. Enable debug mode by setting `DEBUG_MODE=true` in your `.env` file
2. Run the agent and check the console logs to get the group IDs
3. Add the IDs to your `.env` file:
   ```
   GROUP_RESTRICTION_ENABLED=true
   ALLOWED_GROUP_IDS=123456789-123456789,987654321-987654321
   ```
4. Alternatively, use the command feature to add groups automatically:
   - In any group chat, send: `!agent allow`
   - The agent will add that group to the allowed list and update your .env file
   - To view all allowed groups, send: `!agent groups`

The agent will now only respond to messages in the specified groups, ignoring all other messages.

### User Persona Feature

This agent can learn your writing style and respond to messages in a way that sounds like you. To enable this:

1. Set `USER_PERSONA_LEARNING_MODE=true` in your `.env` file
2. Set `USER_PERSONA_ENABLED=true` in your `.env` file
3. Start sending messages from your WhatsApp account
4. After the agent has collected enough samples of your writing (at least 5 substantial messages), it will begin responding in your style

### Using the Style Analyzer Tool

The agent includes a tool to analyze your writing style:

1. Enable `USER_PERSONA_LEARNING_MODE=true` and send at least 5 messages
2. Run the analyzer:
   ```
   npm run analyze-style
   ```
3. The tool will:
   - Show samples of your messages
   - Analyze your writing style in detail
   - Save the analysis to `data/style_analysis.txt`

This analysis helps you understand how the agent perceives your writing style and can be useful for customizing the persona capabilities.

## Important Notes

- This agent connects to WhatsApp using the WhatsApp Web interface, not the official WhatsApp API.
- WhatsApp may detect and block automated tools that use their service, so use responsibly.
- The application uses Google's Gemini free tier models, so you don't need to pay for API usage.
- The application stores session data locally, so you don't need to scan the QR code every time.

## Customization

You can modify the `index.js` file to customize the agent's behavior:
- Change the AI model or system prompts
- Add more capabilities like file access or other external APIs
- Adjust how the agent decides when to search for information
- Modify the persona learning and mimicking behavior

## Security Considerations

- Your WhatsApp session is stored locally on your machine
- Your messages are processed through Google's Gemini API
- Keep your API keys secure and never commit them to version control
- The agent stores samples of your messages to learn your writing style
- When using group restrictions, your messages are still processed if they come from you

## Troubleshooting

If you encounter any issues:
1. Make sure your Google Gemini API key is set correctly
2. Check that WhatsApp Web is working properly in your browser
3. Ensure you have a stable internet connection
4. Restart the application if needed
5. Enable `DEBUG_MODE=true` to see detailed logs about message processing 