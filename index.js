const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const { Configuration, OpenAIApi } = require('openai');
const { middleware, Client } = require('@line/bot-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// LINE Bot config
const lineConfig = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new Client(lineConfig);

// === Multer สำหรับรับไฟล์ ===
const upload = multer({ dest: 'uploads/' });

// === Middleware ทั่วไป ===
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === โหลด setting.json ===
const settingsPath = path.resolve('setting.json');
let settings = { prompt: 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ', keywords: [] };
try {
  if (fs.existsSync(settingsPath)) {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    settings = JSON.parse(content);
  }
} catch (err) {
  console.error('❌ โหลด setting.json ไม่สำเร็จ:', err.message);
}

// === LINE Webhook เฉพาะ path นี้เท่านั้น ===
app.post('/webhook', middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    const results = await Promise.all(events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error('❌ LINE Webhook error:', err.message);
    res.status(500).end();
  }
});

// === ฟังก์ชันตอบกลับ LINE ===
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userMessage = event.message.text.toLowerCase();

  // === ตรวจจับ Keyword ===
  for (const keywordObj of settings.keywords || []) {
    if (userMessage.includes(keywordObj.keyword.toLowerCase())) {
      // ส่งรูปตาม keyword
      const imageMessages = keywordObj.images.map(url => ({
        type: 'image',
        originalContentUrl: url,
        previewImageUrl: url,
      }));
      return lineClient.replyMessage(event.replyToken, imageMessages);
    }
  }

  // === ตอบกลับด้วย GPT ถ้าไม่ตรง keyword ===
  const prompt = `${settings.prompt}\n\nลูกค้า: ${userMessage}\n\nตอบกลับ:`;
  try {
    const openai = new OpenAIApi(new Configuration({
      apiKey: process.env.GPT_API_KEY,
    }));
    const completion = await openai.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });

    const reply = completion.data.choices[0].message.content;
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

// === หน้า /admin สำหรับตั้งค่า prompt และ keywords ===
app.get('/admin', (req, res) => {
  res.sendFile(path.resolve('admin.html'));
});

// === API: ดึงค่า setting.json ===
app.get('/admin/settings', (req, res) => {
  res.json(settings);
});

// === API: บันทึกค่า setting.json ===
app.post('/admin/settings', (req, res) => {
  const { prompt, keywords } = req.body;
  if (prompt) settings.prompt = prompt;
  if (keywords) settings.keywords = keywords;

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    res.status(200).send('บันทึกแล้ว');
  } catch (err) {
    console.error('❌ เขียน setting.json ไม่สำเร็จ:', err.message);
    res.status(500).send('ไม่สามารถบันทึกได้');
  }
});

// === API: อัปโหลดภาพ ===
app.post('/upload', upload.array('images'), (req, res) => {
  const urls = req.files.map(file => {
    const filename = file.filename;
    return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
  });
  res.json({ urls });
});

// === เริ่มเซิร์ฟเวอร์ ===
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

