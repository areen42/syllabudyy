const express = require('express');
const fetch = require('node-fetch');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json({ limit: '50mb' }));

const ZAMZAR_API_KEY = process.env.ZAMZAR_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post('/parse-syllabus', async (req, res) => {
  try {
    const base64 = req.body.file;
    const fileBuffer = Buffer.from(base64, 'base64');
    const tmpFilePath = path.join(__dirname, 'upload.pdf');
    fs.writeFileSync(tmpFilePath, fileBuffer);

    // Step 1: Create job + upload file to Zamzar
    const form = new FormData();
    form.append('source_file', fs.createReadStream(tmpFilePath));
    form.append('target_format', 'txt');

    const jobResp = await fetch('https://api.zamzar.com/v1/jobs', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(ZAMZAR_API_KEY + ':').toString('base64'),
      },
      body: form,
    });

    const jobData = await jobResp.json();
    const jobId = jobData.id;

    // Step 2: Poll until conversion finishes
    let fileId = null;
    for (let i = 0; i < 10; i++) {
      const check = await fetch(`https://api.zamzar.com/v1/jobs/${jobId}`, {
        headers: {
          Authorization: 'Basic ' + Buffer.from(ZAMZAR_API_KEY + ':').toString('base64'),
        },
      });
      const status = await check.json();
      if (status.status === 'successful') {
        fileId = status.target_files[0].id;
        break;
      }
      await new Promise(r => setTimeout(r, 2000)); // wait 2s
    }

    if (!fileId) throw new Error('Zamzar conversion timed out.');

    // Step 3: Download converted text
    const fileTextResp = await fetch(`https://api.zamzar.com/v1/files/${fileId}/content`, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(ZAMZAR_API_KEY + ':').toString('base64'),
      },
    });
    const text = await fileTextResp.text();

    // Step 4: Send to Gemini
    const geminiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Extract all assignment due dates and exam dates:\n\n${text}` }] }],
      }),
    });

    const geminiData = await geminiResp.json();
    fs.unlinkSync(tmpFilePath); // Clean up file
    return res.json(geminiData);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Koyeb Syllabus Parser running on port 3000'));
