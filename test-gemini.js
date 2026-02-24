const { generateText } = require('ai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');

const google = createGoogleGenerativeAI({
    apiKey: "AIzaSyBcfPYBxEqT0T24oAGGaCOohwpCdronA18",
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
