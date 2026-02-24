const https = require('https');

const apiKey = "process.env.GOOGLE_GENERATIVE_AI_API_KEY";
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        const list = JSON.parse(data).models;
        const filtered = list.filter(m => m.name.includes('gemini-1.5'));
        console.log(filtered.map(m => m.name));
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});
