const express = require('express');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const fetch = require('node-fetch');

const app = express();

// Enable CORS for all origins
app.use(cors());

// Parse incoming JSON requests
app.use(express.json({ limit: '50mb' }));

// Environment variable for Gemini API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Endpoint to parse syllabus PDF
app.post('/parse-syllabus', async (req, res) => {
  try {
    const base64 = req.body.file;
    if (!base64) {
      return res.status(400).json({ error: 'Missing Base64 file' });
    }

    const buffer = Buffer.from(base64, 'base64');
    const data = await pdfParse(buffer);
    const text = data.text;

    const prompt = `Extract all assignment names, due dates, and exam dates from this syllabus:\n\n${text}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const geminiData = await geminiRes.json();
    res.json(geminiData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('✅ Syllabuddy Parser is running');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
