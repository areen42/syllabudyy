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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAqiI6mRGI42uFANmxVfmVVE_UKtciL7_A';

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

    const prompt = `Extract the following information from this syllabus into a structured JSON format:
1. Course title
2. Course code
3. Instructor name
4. Contact information
5. Office hours
6. Grading policy
7. Important dates including assignments, exams, and project due dates
8. Important notes or policies

Format the response as valid JSON with the following structure:
{
  "courseTitle": "string",
  "courseCode": "string",
  "instructor": "string",
  "contactInfo": "string",
  "officeHours": "string",
  "gradingPolicy": "string",
  "importantDates": [
    { "title": "string", "date": "string", "description": "string" }
  ],
  "importantNotes": ["string"]
}

Here's the syllabus content:\n\n${text}`;

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
    
    // Log the structure of the response for debugging
    console.log('📦 Gemini response structure:', Object.keys(geminiData));
    
    // Extract the text from the Gemini response
    let geminiText = '';
    try {
      geminiText = geminiData.candidates[0].content.parts[0].text;
      console.log('📝 Gemini text:', geminiText.substring(0, 200) + '...');
    } catch (err) {
      console.error('❌ Failed to extract text from Gemini response:', err);
      return res.status(500).json({ 
        error: 'Failed to extract text from Gemini response',
        rawResponse: geminiData
      });
    }
    
    // Try to extract JSON from markdown code blocks
    let jsonData;
    try {
      // First check if it's a markdown code block
      const codeBlockRegex = /``[(?:json)?\s*([\s\S]*?)\s*](cci:1://file:///c:/Users/shamz/OneDrive/Desktop/syllabuddy2.0/src/screens/main/SyllabusUploadScreen.tsx:429:26-429:69)``/;
      const jsonMatch = geminiText.match(codeBlockRegex);
      
      if (jsonMatch && jsonMatch[1]) {
        // Extract the JSON from the code block
        jsonData = JSON.parse(jsonMatch[1].trim());
      } else {
        // If not in a code block, try parsing directly
        jsonData = JSON.parse(geminiText.trim());
      }
      
      return res.status(200).json(jsonData);
    } catch (parseErr) {
      console.error('❌ JSON parsing error:', parseErr.message);
      // Return the error with the raw text so client can try to parse
      return res.status(500).json({ 
        error: 'Gemini response parsing failed',
        rawText: geminiText 
      });
    }
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
