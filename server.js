const express = require('express');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const fetch = require('node-fetch');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post('/parse-syllabus', async (req, res) => {
  try {
    const base64 = req.body.file;
    if (!base64) {
      return res.status(400).json({ error: 'Missing Base64 file' });
    }

    const buffer = Buffer.from(base64, 'base64');
    const data = await pdfParse(buffer);
    const text = data.text;

    const prompt = `
    Extract structured syllabus details from the following text.
    Return JSON in this format exactly:
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
    
    Text:
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

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates[0].content.parts[0].text;

    try {
      const structuredData = JSON.parse(rawText);
      res.json(structuredData);
    } catch (parseError) {
      console.error("JSON Parsing error:", parseError);
      res.status(500).json({ error: "Gemini response parsing failed", rawText });
    }

  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.send('✅ Syllabuddy Parser is running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
