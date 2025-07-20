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

// === OpenAI Config (Updated) ===
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
    console.log('✅ Settings loaded');
  } catch (err) {
    console.error('❌ Error loading settings.json:', err.message);
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

// === Handle LINE Message (Updated) ===
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userMsg = event.message.text.toLowerCase();

  // === ตอบด้วย Flex ถ้าตรง keyword
  for (const item of settings.keywords) {
    const match = item.keywords.find((kw) => userMsg.includes(kw.toLowerCase()));
    if (match && settings.flex_templates[item.type]) {
      const messages = item.images.map((imgUrl) => ({
        type: 'flex',
        altText: item.text || 'Flex message',
        contents: JSON.parse(
          JSON.stringify(settings.flex_templates[item.type])
            .replace(/{{image}}/g, imgUrl)
            .replace(/{{text}}/g, item.text || '')
        ),
      }));
      return lineClient.replyMessage(event.replyToken, messages);
    }
  }

  // === ถ้าไม่เจอ keyword → ใช้ GPT สร้างข้อความตอบกลับ
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
  res.sendFile(path.join(__dirname, 'admin.html'));
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
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    loadSettings();
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Save settings error:', err.message);
    res.status(500).send('Save failed');
  }
});

// === Upload Route ===
app.post('/upload', upload.array('images'), (req, res) => {
  const urls = req.files.map((file) => {
    return `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
  });
  res.json({ urls });
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});