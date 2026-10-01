const https = require('https');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const key = env.match(/GOOGLE_GENERATIVE_AI_API_KEY=\`"?([^\"'\n]+)\`"?/)?.[1] || env.split('=')[1].replace(/[\"']/g, '').trim();

console.log("Using Key ending in:", key.substring(key.length - 4));

https.get('https://generativelanguage.googleapis.com/v1beta/models?key=' + key, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.error) {
        console.error("API ERROR:", parsed.error);
        return;
      }
      const generateModels = parsed.models.filter(m => m.supportedGenerationMethods.includes('generateContent'));
      console.log('Supported Models:');
      console.log(generateModels.map(m => m.name).join('\n'));
    } catch(e) {
      console.log("PARSE ERROR", data);
    }
  });
});
