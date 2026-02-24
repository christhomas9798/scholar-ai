const https = require('https');

const apiKey = "AIzaSyBcfPYBxEqT0T24oAGGaCOohwpCdronA18";
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log(JSON.parse(data));
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});
