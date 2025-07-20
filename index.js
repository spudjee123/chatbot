const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
require('dotenv').config();

const OpenAI = require('openai');
const { Client } = require('@line/bot-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// === LINE Config ===
const lineConfig = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new Client(lineConfig);

// === OpenAI Config ===
const openai = new OpenAI({ apiKey: process.env.GPT_API_KEY });

// === Multer สำหรับอัปโหลด ===
const upload = multer({ dest: 'uploads/' });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === Middleware สำหรับ route อื่น ๆ ยกเว้น webhook
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === Settings ===
const settingsPath = path.resolve('setting.json');
let settings = { prompt: 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ', keywords: [] };

function loadSettings() {
  try {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    settings = JSON.parse(content);
    console.log('✅ Settings loaded');
  } catch (err) {
    console.error('❌ Load settings failed:', err.message);
  }
}
loadSettings();

// === Validate LINE Signature ===
function validateSignature(rawBody, secret, signature) {
  if (!Buffer.isBuffer(rawBody)) return false;
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return hash === signature;
}

// === LINE Webhook (ต้องใช้ raw body เท่านั้น) ===
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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
    res.status(200).json(results); // ✅ ต้องส่ง 200 กลับไป
  } catch (err) {
    console.error('❌ Webhook error:', err.stack || err.message);
    res.status(500).send('Server error');
  }
});

// === จัดการข้อความจากผู้ใช้ ===
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userMessage = event.message.text.toLowerCase();

  // === ตรวจสอบ keyword ที่ match ===
  for (const keywordObj of settings.keywords || []) {
    if (keywordObj.keywords.some(kw => userMessage.includes(kw.toLowerCase()))) {
      const imageMessages = keywordObj.images.map(url => ({
        type: 'image',
        originalContentUrl: url,
        previewImageUrl: url,
      }));

      try {
        return await lineClient.replyMessage(event.replyToken, imageMessages);
      } catch (err) {
        console.error('❌ LINE image reply failed:', err.response?.data || err.message);
        return lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: 'ขออภัย ไม่สามารถแสดงภาพได้ในขณะนี้',
        });
      }
    }
  }

  // === ตอบด้วย GPT ===
  const prompt = `${settings.prompt}\n\nลูกค้า: ${userMessage}\n\nตอบกลับ:`;
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });

    const reply = completion.choices[0].message.content;
    return lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: reply,
    });
  } catch (err) {
    console.error('❌ GPT error:', err.message);
    return lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ขออภัย ระบบไม่สามารถตอบกลับได้ในขณะนี้',
    });
  }
}

// === Admin UI ===
app.get('/admin', (req, res) => {
  res.sendFile(path.resolve('admin.html'));
});

app.get('/admin/settings', (req, res) => {
  res.json(settings);
});

app.post('/admin/settings', express.json(), (req, res) => {
  const { prompt, keywords } = req.body;
  if (prompt) settings.prompt = prompt;
  if (keywords) settings.keywords = keywords;

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    loadSettings();
    res.status(200).send('บันทึกแล้ว');
  } catch (err) {
    console.error('❌ Save settings failed:', err.message);
    res.status(500).send('Save failed');
  }
});

// === อัปโหลดรูป ===
app.post('/upload', upload.array('images'), (req, res) => {
  const urls = req.files.map(file => {
    return `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
  });
  res.json({ urls });
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
