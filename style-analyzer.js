/**
 * Style Analyzer Tool
 * 
 * This tool analyzes the user's writing style to help the agent mimic it better.
 * It can be run separately to generate insights about the user's writing patterns.
 */

const fs = require('fs').promises;
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const AI_MODEL = process.env.AI_MODEL || 'gemini-1.0-pro';

const PERSONA_DIR = path.join(__dirname, 'data');
const PERSONA_FILE = path.join(PERSONA_DIR, 'user_persona.json');

async function main() {
  try {
    // Check if persona file exists
    try {
      await fs.access(PERSONA_FILE);
    } catch (error) {
      console.error('Error: No user persona data found. Please enable USER_PERSONA_LEARNING_MODE and send some messages first.');
      return;
    }

    // Load user persona data
    const data = await fs.readFile(PERSONA_FILE, 'utf8');
    const userPersona = JSON.parse(data);

    if (!userPersona.styleSamples || userPersona.styleSamples.length < 5) {
      console.error('Error: Not enough style samples collected. Please send more messages with USER_PERSONA_LEARNING_MODE enabled.');
      console.log(`Current samples: ${userPersona.styleSamples ? userPersona.styleSamples.length : 0}/5 required`);
      return;
    }

    console.log(`Analyzing ${userPersona.styleSamples.length} writing samples...`);

    // Get a few sample messages to show
    const sampleMessages = userPersona.styleSamples.slice(0, 3).map(sample => 
      sample.length > 50 ? sample.substring(0, 50) + '...' : sample
    );
    console.log('\nSample messages:');
    sampleMessages.forEach((sample, i) => console.log(`${i+1}. "${sample}"`));

    // Analyze the writing style
    const styleAnalysis = await analyzeWritingStyle(userPersona.styleSamples);
    console.log('\nWriting Style Analysis:');
    console.log(styleAnalysis);

    // Ask if user wants to save the analysis
    await fs.writeFile(
      path.join(PERSONA_DIR, 'style_analysis.txt'), 
      `Writing Style Analysis:\n${styleAnalysis}\n\nBased on ${userPersona.styleSamples.length} samples`,
      'utf8'
    );
    console.log('\nAnalysis saved to data/style_analysis.txt');

  } catch (error) {
    console.error('Error analyzing writing style:', error);
  }
}

async function analyzeWritingStyle(samples) {
  try {
    const model = genAI.getGenerativeModel({ model: AI_MODEL });
    
    // Join a few samples together
    const sampleText = samples.slice(0, 10).join('\n\n');
    
    // Create a prompt that instructs Gemini to analyze the writing style
    const prompt = `Analyze the following writing samples from the same person and describe their writing style in detail:

${sampleText}

Provide a detailed analysis of:
1. Formality level
2. Typical sentence length and structure
3. Common phrases or expressions
4. Punctuation patterns
5. Vocabulary choices
6. Any other distinctive elements`;
    
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Error in style analysis:', error);
    return "Error analyzing writing style. Please check your API key and internet connection.";
  }
}

// Only run directly if this script is called directly (not required)
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { analyzeWritingStyle }; 