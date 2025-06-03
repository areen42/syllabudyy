const express = require('express');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const fetch = require('node-fetch');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.get('/', (req, res) => {
  res.send('✅ Syllabuddy Parser is running');
});

app.post('/parse-syllabus', async (req, res) => {
  const base64 = req.body.file;
  if (!base64) {
    return res.status(400).json({ error: 'Missing Base64 file' });
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    const prompt = `
    From the following syllabus text, return structured JSON in exactly this format:
    {
      "courseTitle": "...",
      "courseCode": "...",
      "instructor": "...",
      "contactInfo": "...",
      "officeHours": "...",
      "gradingPolicy": "...",
      "importantDates": [
        {"title": "...", "date": "...", "description": "..."}
      ],
      "importantNotes": ["..."]
    }

    Syllabus Text:
    ${text}
    `;

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

    if (!geminiRes.ok) {
      console.error('Gemini API Error:', await geminiRes.text());
      return res.status(500).json({ error: 'Gemini API request failed' });
    }

    const geminiData = await geminiRes.json();

    if (!geminiData.candidates || !geminiData.candidates[0].content.parts[0].text) {
      throw new Error('Invalid Gemini response structure');
    }

    const rawText = geminiData.candidates[0].content.parts[0].text;

    let structuredData;
    try {
      structuredData = JSON.parse(rawText);
    } catch (parseError) {
      console.error('JSON Parsing Error:', parseError, rawText);
      return res.status(500).json({ error: 'Failed to parse Gemini response', details: rawText });
    }

    res.status(200).json(structuredData);
  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

