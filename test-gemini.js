require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const { generateText } = require('ai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

async function main() {
    try {
        const { text } = await generateText({
            model: google('gemini-flash-latest'),
            prompt: 'Hello, world!',
        });
        console.log('Response:', text);
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
