// Load environment variables
try {
  require('dotenv').config();
} catch (error) {
  console.warn('dotenv not found, using process.env variables');
}

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const PhoneIntegration = require('./phone-integration');
const fs = require('fs').promises;
const path = require('path');

// Initialize Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configuration from environment variables
const MAX_SEARCH_RESULTS = parseInt(process.env.MAX_SEARCH_RESULTS || '3');
const SEARCH_ENABLED = process.env.SEARCH_ENABLED !== 'false';
const AI_MODEL = process.env.AI_MODEL || 'gemini-1.0-pro';
const PHONE_INTEGRATION_ENABLED = process.env.PHONE_INTEGRATION_ENABLED === 'true';
const USER_PERSONA_ENABLED = process.env.USER_PERSONA_ENABLED === 'true';
const USER_PERSONA_LEARNING_MODE = process.env.USER_PERSONA_LEARNING_MODE === 'true';
const GROUP_RESTRICTION_ENABLED = process.env.GROUP_RESTRICTION_ENABLED === 'true';
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

// Parse allowed group IDs if restriction is enabled
let ALLOWED_GROUP_IDS = [];
if (GROUP_RESTRICTION_ENABLED && process.env.ALLOWED_GROUP_IDS) {
  ALLOWED_GROUP_IDS = process.env.ALLOWED_GROUP_IDS.split(',').map(id => id.trim());
  console.log(`Group restriction enabled. Will only respond to ${ALLOWED_GROUP_IDS.length} groups.`);
}

// User persona storage
const PERSONA_DIR = path.join(__dirname, 'data');
const PERSONA_FILE = path.join(PERSONA_DIR, 'user_persona.json');
let userPersona = {
  messageHistory: [],
  styleSamples: []
};

// Load user persona data if it exists
async function loadUserPersona() {
  try {
    await fs.mkdir(PERSONA_DIR, { recursive: true });
    try {
      const data = await fs.readFile(PERSONA_FILE, 'utf8');
      userPersona = JSON.parse(data);
      console.log('Loaded user persona data');
    } catch (error) {
      // If file doesn't exist, we'll create it later
      console.log('No existing user persona found, starting fresh');
    }
  } catch (error) {
    console.error('Error loading user persona:', error);
  }
}

// Save user persona data
async function saveUserPersona() {
  try {
    await fs.mkdir(PERSONA_DIR, { recursive: true });
    await fs.writeFile(PERSONA_FILE, JSON.stringify(userPersona, null, 2));
  } catch (error) {
    console.error('Error saving user persona:', error);
  }
}

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox'],
  }
});

// Generate QR code for WhatsApp Web authentication
client.on('qr', (qr) => {
  console.log('QR RECEIVED. Scan this with your WhatsApp app:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('Client is ready!');
  loadUserPersona();
});

// Handle incoming messages
client.on('message', async (message) => {
  try {
    // Get chat info to identify if it's a group
    const chat = await message.getChat();
    const chatId = chat.id._serialized;
    
    if (DEBUG_MODE) {
      console.log('Message received:');
      console.log(`- From: ${message.from}`);
      console.log(`- Chat ID: ${chatId}`);
      console.log(`- Is Group: ${chat.isGroup}`);
      console.log(`- Content: ${message.body}`);
    }
    
    // If message is from yourself, learn from it if enabled and return
    if (message.fromMe) {
      if (USER_PERSONA_LEARNING_MODE) {
        await learnFromUserMessage(message.body);
      }
      return;
    }
    
    // Check if group restriction is enabled and if this is an allowed group
    if (GROUP_RESTRICTION_ENABLED) {
      // Only process messages from allowed groups
      if (!chat.isGroup || !ALLOWED_GROUP_IDS.includes(chatId)) {
        if (DEBUG_MODE) {
          console.log(`Ignoring message from non-allowed chat: ${chatId}`);
        }
        return; // Silently ignore messages from non-allowed groups
      }
    }

    console.log(`Processing message: ${message.body}`);
    
    // Process the message using AI and generate a response
    const response = await processMessage(message.body);
    
    // Reply to the message
    await message.reply(response);
  } catch (error) {
    console.error('Error processing message:', error);
    if (!GROUP_RESTRICTION_ENABLED) {
      // Only send error messages if not in restricted mode
      await message.reply('Sorry, I encountered an error while processing your message.');
    }
  }
});

// Add a way to save chat IDs to allowed list
client.on('message_create', async (message) => {
  // Only process messages from yourself
  if (!message.fromMe) return;
  
  const commandPrefix = '!agent';
  
  if (message.body.startsWith(`${commandPrefix} allow`)) {
    try {
      const chat = await message.getChat();
      const chatId = chat.id._serialized;
      
      if (!chat.isGroup) {
        await message.reply('This command only works in group chats.');
        return;
      }
      
      // Add to allowed groups
      if (!ALLOWED_GROUP_IDS.includes(chatId)) {
        ALLOWED_GROUP_IDS.push(chatId);
        
        // Update the .env file if possible
        try {
          const envPath = path.join(__dirname, '.env');
          let envContent = await fs.readFile(envPath, 'utf8').catch(() => '');
          
          // Update or add the GROUP_RESTRICTION_ENABLED and ALLOWED_GROUP_IDS variables
          const groupIdsString = ALLOWED_GROUP_IDS.join(',');
          
          if (envContent.includes('ALLOWED_GROUP_IDS=')) {
            envContent = envContent.replace(
              /ALLOWED_GROUP_IDS=.*/,
              `ALLOWED_GROUP_IDS=${groupIdsString}`
            );
          } else {
            envContent += `\nALLOWED_GROUP_IDS=${groupIdsString}`;
          }
          
          if (!envContent.includes('GROUP_RESTRICTION_ENABLED=')) {
            envContent += '\nGROUP_RESTRICTION_ENABLED=true';
          } else if (!GROUP_RESTRICTION_ENABLED) {
            envContent = envContent.replace(
              /GROUP_RESTRICTION_ENABLED=.*/,
              'GROUP_RESTRICTION_ENABLED=true'
            );
          }
          
          await fs.writeFile(envPath, envContent);
          console.log(`Added group ${chatId} to allowed list and updated .env file`);
          await message.reply('✅ This group has been added to my allowed groups list. I will now respond to messages here.');
        } catch (err) {
          console.error('Error updating .env file:', err);
          await message.reply(`✅ Group added to allowed list for this session, but couldn't update .env file. You'll need to manually add this group ID: ${chatId}`);
        }
      } else {
        await message.reply('This group is already in my allowed list.');
      }
    } catch (error) {
      console.error('Error processing allow command:', error);
      await message.reply('Error processing command.');
    }
  } else if (message.body === `${commandPrefix} groups`) {
    // List all allowed groups
    const allowedGroups = [];
    
    for (const id of ALLOWED_GROUP_IDS) {
      try {
        const chat = await client.getChatById(id);
        allowedGroups.push(`- ${chat.name} (${id})`);
      } catch (err) {
        allowedGroups.push(`- Unknown group (${id})`);
      }
    }
    
    if (allowedGroups.length === 0) {
      await message.reply('No groups are currently allowed.');
    } else {
      await message.reply(`Currently allowed groups:\n${allowedGroups.join('\n')}`);
    }
  }
});

// Learn from user's outgoing messages to build persona
async function learnFromUserMessage(messageText) {
  if (messageText.length < 10) return; // Ignore very short messages
  
  // Add to style samples if it's a substantial message
  if (messageText.length > 30) {
    userPersona.styleSamples.push(messageText);
    // Keep only the most recent 50 samples
    if (userPersona.styleSamples.length > 50) {
      userPersona.styleSamples.shift();
    }
  }
  
  // Add to message history
  userPersona.messageHistory.push({
    role: 'user',
    content: messageText,
    timestamp: Date.now()
  });
  
  // Keep only the most recent 100 messages
  if (userPersona.messageHistory.length > 100) {
    userPersona.messageHistory.shift();
  }
  
  // Save user persona data
  await saveUserPersona();
}

// Process messages with AI and additional capabilities
async function processMessage(messageText) {
  // Use AI to understand the message and determine if search or phone access is needed
  const aiAnalysis = await analyzeWithAI(messageText);
  
  // If the AI determines we need to search for information and search is enabled
  if (aiAnalysis.needsSearch && SEARCH_ENABLED) {
    const searchResults = await googleSearch(aiAnalysis.searchQuery);
    // Generate response based on search results
    return await generateResponseWithContext(messageText, searchResults);
  }
  
  // If the AI determines we need phone access and phone integration is enabled
  if (aiAnalysis.needsPhoneAccess && PHONE_INTEGRATION_ENABLED) {
    const phoneData = await getPhoneData(aiAnalysis.phoneAccessType, aiAnalysis.phoneAccessQuery);
    // Generate response based on phone data
    return await generateResponseWithPhoneData(messageText, phoneData);
  }
  
  // If user persona is enabled and there are enough style samples, respond like the user
  if (USER_PERSONA_ENABLED && userPersona.styleSamples.length >= 5) {
    return await generatePersonaResponse(messageText);
  }
  
  // Generate a response directly if no special actions are needed
  return aiAnalysis.response;
}

// Analyze the message with Gemini AI to understand intent and context
async function analyzeWithAI(text) {
  try {
    const model = genAI.getGenerativeModel({ model: AI_MODEL });
    
    const prompt = `You are a helpful WhatsApp assistant that understands user messages and determines what action to take.
                 You can either provide a direct response, indicate a need to search for information online,
                 or indicate a need to access phone data (contacts, files, calendar, or location).
                 
                 Analyze this message and decide what action to take: "${text}".
                 If web search is needed, respond with "SEARCH: <search query>".
                 If phone data access is needed, respond with "PHONE: <type>:<query>" where type is contacts, files, calendar, or location.
                 If neither is needed, provide a direct helpful response.`;
    
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    // Parse the AI response to determine what action is needed
    if (response.toUpperCase().startsWith("SEARCH:")) {
      const searchQuery = response.substring("SEARCH:".length).trim();
      return {
        needsSearch: true,
        needsPhoneAccess: false,
        searchQuery: searchQuery,
        response: null
      };
    } else if (response.toUpperCase().startsWith("PHONE:")) {
      const phoneCommand = response.substring("PHONE:".length).trim();
      const [phoneAccessType, ...queryParts] = phoneCommand.split(":");
      const phoneAccessQuery = queryParts.join(":").trim();
      
      return {
        needsSearch: false,
        needsPhoneAccess: true,
        phoneAccessType: phoneAccessType.toLowerCase(),
        phoneAccessQuery: phoneAccessQuery,
        response: null
      };
    } else {
      return {
        needsSearch: false,
        needsPhoneAccess: false,
        response: response
      };
    }
  } catch (error) {
    console.error('Error analyzing with Gemini AI:', error);
    return {
      needsSearch: false,
      needsPhoneAccess: false,
      response: "I'm having trouble understanding your message right now. Could you please try again?"
    };
  }
}

// Generate a response in the user's style
async function generatePersonaResponse(messageText) {
  try {
    const model = genAI.getGenerativeModel({ model: AI_MODEL });
    
    // Create a prompt that instructs Gemini to mimic the user's style
    let prompt = `You need to respond to this message in a way that mimics the user's writing style.
                 Here are examples of how the user writes:
                 
                 `;
    
    // Add a selection of the user's style samples
    const sampleCount = Math.min(userPersona.styleSamples.length, 5);
    for (let i = 0; i < sampleCount; i++) {
      prompt += `Example ${i+1}: "${userPersona.styleSamples[i]}"\n\n`;
    }
    
    prompt += `Message to respond to: "${messageText}"\n\n`;
    prompt += `Write a response that sounds exactly like it was written by the same person who wrote the example messages.
               Match their tone, formality level, sentence structure, vocabulary, and any distinctive patterns.`;
    
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Error generating persona response:', error);
    return "I'm having trouble responding in your style right now. I'll get back to normal mode.";
  }
}

// Perform a Google search and extract relevant information
async function googleSearch(query) {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    const { data } = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(data);
    const results = [];

    // Extract search results
    $('.g').each((i, element) => {
      const titleElement = $(element).find('h3');
      const linkElement = $(element).find('a');
      const snippetElement = $(element).find('.VwiC3b');

      if (titleElement.length && linkElement.length) {
        results.push({
          title: titleElement.text(),
          link: linkElement.attr('href'),
          snippet: snippetElement.text()
        });
      }
    });

    return results.slice(0, MAX_SEARCH_RESULTS); // Return top results based on configuration
  } catch (error) {
    console.error('Error performing Google search:', error);
    return [];
  }
}

// Get data from the phone based on the requested type and query
async function getPhoneData(type, query) {
  try {
    switch (type) {
      case 'contacts':
        return await PhoneIntegration.getContacts();
      case 'files':
        return await PhoneIntegration.searchFiles(query);
      case 'calendar':
        return await PhoneIntegration.getCalendarEvents();
      case 'location':
        return await PhoneIntegration.getLocation();
      default:
        return { error: `Unknown phone data type: ${type}` };
    }
  } catch (error) {
    console.error(`Error accessing phone data (${type}):`, error);
    return { error: `Failed to access ${type} data: ${error.message}` };
  }
}

// Generate a response with context from search results
async function generateResponseWithContext(originalMessage, searchResults) {
  try {
    const model = genAI.getGenerativeModel({ model: AI_MODEL });
    
    // Create a context string from search results
    let context = "Search results:\n";
    searchResults.forEach((result, index) => {
      context += `${index + 1}. ${result.title}: ${result.snippet}\n`;
    });
    
    // Generate a response with the search context
    const prompt = `Original message: "${originalMessage}"\n\n${context}\n\nProvide a helpful response based on these search results.`;
    
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Error generating response with search context:', error);
    return "I found some information online, but I'm having trouble processing it. Could you try asking in a different way?";
  }
}

// Generate a response with phone data context
async function generateResponseWithPhoneData(originalMessage, phoneData) {
  try {
    const model = genAI.getGenerativeModel({ model: AI_MODEL });
    
    // Create a context string from phone data
    let context = "Phone data:\n";
    if (phoneData.error) {
      context += `Error: ${phoneData.error}\n`;
    } else if (Array.isArray(phoneData)) {
      phoneData.forEach((item, index) => {
        context += `${index + 1}. ${JSON.stringify(item)}\n`;
      });
    } else {
      context += JSON.stringify(phoneData, null, 2);
    }
    
    // Generate a response with the phone data context
    const prompt = `Original message: "${originalMessage}"\n\n${context}\n\nProvide a helpful response based on this phone data.`;
    
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Error generating response with phone data:', error);
    return "I found some information on your phone, but I'm having trouble processing it. Could you try asking in a different way?";
  }
}

// Initialize WhatsApp client
client.initialize(); 