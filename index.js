const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const { Client } = require('@line/bot-sdk');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// === LINE Config ===
const lineConfig = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new Client(lineConfig);

// === OpenAI Config ===
const openai = new OpenAI({
  apiKey: process.env.GPT_API_KEY,
});

// === Middlewares ===
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const upload = multer({ dest: 'uploads/' });

const rawBodySaver = (req, res, buf) => {
  req.rawBody = buf;
};
app.use('/webhook', express.raw({ type: '*/*', verify: rawBodySaver }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === Settings ===
const settingsPath = path.join(__dirname, 'setting.json');
let settings = { prompt: '', keywords: [], flex_templates: {} };
function loadSettings() {
  try {
    const data = fs.readFileSync(settingsPath, 'utf8');
    settings = JSON.parse(data);
    console.log('✅ Settings loaded successfully');
  } catch (err) {
    // Don't log error if the file simply doesn't exist on first start
    if (err.code !== 'ENOENT') {
      console.error('❌ Error loading settings.json:', err.message);
    } else {
      console.log('ℹ️ settings.json not found. A new one will be created on first save.');
    }
  }
}
loadSettings();

// === Validate LINE Signature ===
function validateSignature(rawBody, secret, signature) {
  const hash = crypto
    .createHmac('SHA256', secret)
    .update(rawBody)
    .digest('base64');
  return hash === signature;
}

// === Webhook ===
app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-line-signature'];
  if (!validateSignature(req.rawBody, lineConfig.channelSecret, signature)) {
    return res.status(401).send('Invalid signature');
  }
  let body;
  try {
    body = JSON.parse(req.rawBody.toString());
  } catch (err) {
    return res.status(400).send('Invalid JSON');
  }
  Promise.all(body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('❌ Webhook Error:', err);
      res.status(500).end();
    });
});

// === Handle LINE Message ===
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userMsg = event.message.text.toLowerCase();

  for (const item of settings.keywords) {
    const match = item.keywords.find((kw) => userMsg.includes(kw.toLowerCase()));
    if (match && item.responses && item.responses.length > 0 && settings.flex_templates[item.type]) {
      const messages = item.responses.map(response => ({
        type: 'flex',
        altText: response.text || 'ข้อความตอบกลับใหม่',
        contents: JSON.parse(
          JSON.stringify(settings.flex_templates[item.type])
            .replace(/{{image}}/g, response.image || '')
            .replace(/{{text}}/g, response.text || '')
        ),
      }));
      return lineClient.replyMessage(event.replyToken, messages);
    }
  }

  try {
    const gptRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: settings.prompt || 'คุณคือพนักงานบริการลูกค้า PG DOG' },
        { role: 'user', content: event.message.text },
      ],
    });
    const gptReply = gptRes.choices[0].message.content;
    return lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: gptReply,
    });
  } catch (err) {
    console.error('❌ GPT API Error:', err.message);
    return lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ขออภัย ระบบตอบกลับไม่สามารถทำงานได้ในขณะนี้ กรุณาติดต่อแอดมินค่ะ',
    });
  }
}

// === Admin Panel ===
app.get('/admin', (req, res) => {
  fs.readFile(path.join(__dirname, 'admin.html'), 'utf8', (err, html) => {
    if (err) {
      console.error("Could not read admin.html", err);
      return res.status(500).send("Could not load admin page.");
    }
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const backendUrl = `${protocol}://${req.get('host')}`;
    
    const modifiedHtml = html.replace(
      '</head>',
      `<script>window.API_BASE_URL = '${backendUrl}';</script></head>`
    );
    res.send(modifiedHtml);
  });
});

app.get('/admin/settings', (req, res) => {
  res.json(settings);
});

app.post('/admin/settings', (req, res) => {
  const { prompt, keywords, flex_templates } = req.body;
  settings.prompt = prompt || settings.prompt;
  settings.keywords = keywords || settings.keywords;
  settings.flex_templates = flex_templates || settings.flex_templates;

  try {
    // --- Added more detailed logging for debugging persistence issues ---
    const fullPath = path.resolve(settingsPath);
    console.log(`Attempting to write to persistent storage at: ${fullPath}`);
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    console.log(`✅ Successfully wrote to ${fullPath}`);
    loadSettings();
    res.sendStatus(200);
  } catch (err) {
    const fullPath = path.resolve(settingsPath);
    console.error(`❌❌❌ CRITICAL: Failed to write settings to ${fullPath}. Data will be lost on restart.`, err);
    res.status(500).send('Save failed. Check server logs for details.');
  }
});

// === Upload Route ===
app.post('/upload', upload.array('images'), (req, res) => {
  const urls = req.files.map((file) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    return `${protocol}://${req.get('host')}/uploads/${file.filename}`;
  });
  res.json({ urls });
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
