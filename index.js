const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
require('dotenv').config();

const { Client } = require('@line/bot-sdk');
const app = express();
const PORT = process.env.PORT || 3000;

// LINE Config
const lineConfig = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new Client(lineConfig);

// Uploads & Static
const upload = multer({ dest: 'uploads/' });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Load settings
const settingsPath = path.resolve('setting.json');
let settings = { prompt: 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ', keywords: [], flex_templates: {} };
function loadSettings() {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    console.log('✅ Settings loaded');
  } catch (e) {
    console.error('❌ Failed to load settings:', e.message);
  }
}
loadSettings();

// LINE Signature Validation
function validateSignature(body, secret, signature) {
  const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64');
  return hash === signature;
}

// ✅ GET for webhook verification
app.get('/webhook', (req, res) => {
  res.status(200).send('LINE Webhook verified');
});

// ✅ Webhook endpoint (POST)
app.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const signature = req.headers['x-line-signature'];
  if (!validateSignature(req.body, lineConfig.channelSecret, signature)) {
    console.error('❌ Invalid LINE signature');
    return res.status(401).send('Invalid signature');
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf-8'));
  } catch (err) {
    console.error('❌ JSON parse error:', err.message);
    return res.status(400).send('Invalid JSON');
  }

  try {
    const results = await Promise.all(body.events.map(handleEvent));
    res.status(200).json(results);
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.status(500).send('Server error');
  }
});

// Flex message renderer
function renderFlexTemplate(template, data) {
  const str = JSON.stringify(template);
  const replaced = str
    .replace(/{{\s*image\s*}}/g, data.image)
    .replace(/{{\s*text\s*}}/g, data.text);
  return JSON.parse(replaced);
}

// LINE message handler
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;
  const userMessage = event.message.text.toLowerCase();

  for (const item of settings.keywords || []) {
    if (item.keywords.some(kw => userMessage.includes(kw.toLowerCase()))) {
      const type = item.type || 'flex1';
      const template = settings.flex_templates?.[type];
      if (template && item.images?.length) {
        const flex = renderFlexTemplate(template, {
          text: item.text || '',
          image: item.images[0],
        });
        return lineClient.replyMessage(event.replyToken, {
          type: 'flex',
          altText: item.text || 'ข้อความจากระบบ',
          contents: flex,
        });
      }
    }
  }

  return lineClient.replyMessage(event.replyToken, {
    type: 'text',
    text: settings.prompt || 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ',
  });
}

// Admin interface
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin/settings', (req, res) => {
  res.json(settings);
});

app.post('/admin/settings', (req, res) => {
  const { prompt, keywords, flex_templates } = req.body;
  if (prompt) settings.prompt = prompt;
  if (keywords) settings.keywords = keywords;
  if (flex_templates) settings.flex_templates = flex_templates;

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    loadSettings();
    res.status(200).send('✅ บันทึกสำเร็จ');
  } catch (e) {
    console.error('❌ Failed to save settings:', e.message);
    res.status(500).send('Save failed');
  }
});

// Upload images
app.post('/upload', upload.array('images'), (req, res) => {
  const urls = req.files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`);
  res.json({ urls });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
