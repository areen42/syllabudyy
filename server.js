const express = require('express');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const fetch = require('node-fetch');

const app = express();

// Enable CORS
app.use(cors());

// Parse JSON requests (increase limit for large base64)
app.use(express.json({ limit: '50mb' }));

// Load environment variable
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// PDF parsing endpoint
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

    const geminiText = await geminiRes.text();

    console.log('📦 Gemini raw response:', geminiText.substring(0, 500));

    let parsed;
    try {
      const cleaned = geminiText.trim().startsWith('`')
        ? geminiText.trim().slice(1, -1)
        : geminiText;
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('❌ JSON parsing error from Gemini:', parseErr.message);
      return res.status(500).json({ error: 'Failed to parse Gemini response as JSON.' });
    }

    return res.json(parsed);
  } catch (err) {
    console.error('🚨 Server error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('✅ Syllabuddy Parser is running');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

