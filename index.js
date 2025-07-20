const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const { Client, middleware } = require('@line/bot-sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// === LINE Config ===
const lineConfig = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new Client(lineConfig);

// === Middlewares ===
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const upload = multer({ dest: 'uploads/' });

// === Custom Raw Body Parser for /webhook ===
const rawBodySaver = (req, res, buf) => {
  req.rawBody = buf;
};
app.use('/webhook', express.raw({ type: '*/*', verify: rawBodySaver }));

// === JSON Body Parser for other routes ===
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

// === Handle LINE Message ===
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userMsg = event.message.text.toLowerCase();

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

  // Default response if no keyword matched
  return lineClient.replyMessage(event.replyToken, {
    type: 'text',
    text: settings.prompt || 'ขอบคุณที่ติดต่อเรา',
  });
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
