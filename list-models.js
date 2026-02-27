require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const https = require('https');

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => { console.log(JSON.parse(data)); });
}).on('error', (err) => { console.error('Error:', err.message); });
