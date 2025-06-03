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
    
    // Try to extract JSON from markdown code blocks using string methods instead of regex
    let jsonData;
    try {
      let jsonString = geminiText;
      
      // Check if the response contains markdown code blocks
      if (geminiText.includes('```')) {
        // Find the start of the JSON block after the opening ```
        const startIndex = geminiText.indexOf('```') + 3;
        // Find where the code block ends
        const endIndex = geminiText.lastIndexOf('```');
        
        // Extract only the content between the markdown markers
        if (startIndex < endIndex) {
          // Skip the language identifier line if present
          let contentStart = startIndex;
          const nextLineBreak = geminiText.indexOf('\n', startIndex);
          if (nextLineBreak > startIndex && nextLineBreak < endIndex) {
            contentStart = nextLineBreak + 1;
          }
          
          jsonString = geminiText.substring(contentStart, endIndex).trim();
        }
      }
      
      // Parse the extracted or original text as JSON
      jsonData = JSON.parse(jsonString);
      
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
