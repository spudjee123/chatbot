const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const { Configuration, OpenAIApi } = require('openai');
const { middleware, Client } = require('@line/bot-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// === LINE Bot config ===
const lineConfig = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new Client(lineConfig);

// === middleware
app.use(middleware(lineConfig));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === Multer สำหรับอัปโหลดรูป
const uploadPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
const upload = multer({ dest: uploadPath });

// === โหลด setting.json ===
const settingsPath = path.resolve('setting.json');
let settings = { prompt: 'สวัสดีค่ะ มีอะไรให้เราช่วยไหมคะ', keywords: [] };

try {
  if (fs.existsSync(settingsPath)) {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    settings = JSON.parse(content);
  }
} catch (err) {
  console.error('❌ โหลด setting.json ไม่สำเร็จ:', err.message);
}

// === LINE Webhook ===
app.post('/webhook', async (req, res) => {
  try {
    const events = req.body.events;
    const results = await Promise.all(events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error('❌ LINE Webhook error:', err.message);
    res.status(500).end();
  }
});

// === ฟังก์ชันตอบกลับ ===
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userText = event.message.text;

  const match = settings.keywords.find(entry =>
    entry.keywords.some(keyword => userText.includes(keyword))
  );

  if (match) {
    const imageMessages = match.images.map(url => ({
      type: 'image',
      originalContentUrl: url,
      previewImageUrl: url,
    }));

    return lineClient.replyMessage(event.replyToken, imageMessages);
  }

  try {
    const configuration = new Configuration({ apiKey: process.env.GPT_API_KEY });
    const openai = new OpenAIApi(configuration);

    const prompt = `${settings.prompt}\n\nลูกค้า: ${userText}\n\nตอบกลับ:`;
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });

    const reply = completion.data.choices[0].message.content;
    return lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: reply,
    });
  } catch (err) {
    console.error('❌ OpenAI error:', err.response?.data || err.message);
    return lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ขออภัย ระบบไม่สามารถตอบกลับได้ในขณะนี้',
    });
  }
}

// === Route admin ===
app.get('/admin', (req, res) => {
  const filePath = path.resolve('admin.html');
  res.sendFile(filePath, err => {
    if (err) {
      console.error('❌ admin.html ส่งไม่สำเร็จ:', err.message);
      res.status(500).send('Internal Server Error');
    }
  });
});

// === API โหลด settings ===
app.get('/admin/settings', (req, res) => {
  res.json(settings);
});

// === API บันทึก settings ใหม่ ===
app.post('/admin/settings', (req, res) => {
  const { prompt, keywords } = req.body;
  if (!prompt || !Array.isArray(keywords)) {
    return res.status(400).send('Invalid input');
  }

  settings.prompt = prompt;
  settings.keywords = keywords;

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    res.status(200).send('Settings saved');
  } catch (err) {
    console.error('❌ เขียนไฟล์ไม่สำเร็จ:', err.message);
    res.status(500).send('Failed to save');
  }
});

// ✅ === Route upload สำหรับรับรูปภาพจาก admin.html ===
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');

  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

// === Start server ===
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});



// const express = require('express');
// const fs = require('fs');
// const path = require('path');
// require('dotenv').config();

// const { Configuration, OpenAIApi } = require('openai');
// const { middleware, Client } = require('@line/bot-sdk');

// const app = express();
// const PORT = process.env.PORT || 3000;

// // === LINE Bot config ===
// const lineConfig = {
//   channelAccessToken: process.env.LINE_ACCESS_TOKEN,
//   channelSecret: process.env.LINE_CHANNEL_SECRET,
// };
// const lineClient = new Client(lineConfig);

// // === Middleware สำหรับ request ทั่วไป (ไม่รวม webhook)
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // === โหลด setting.json ===
// const settingsPath = path.resolve('setting.json');
// let settings = { prompt: 'สวัสดีค่ะ มีอะไรให้เราช่วยไหมคะ' };

// try {
//   if (fs.existsSync(settingsPath)) {
//     const content = fs.readFileSync(settingsPath, 'utf-8');
//     settings = JSON.parse(content);
//   }
// } catch (err) {
//   console.error('❌ โหลด setting.json ไม่สำเร็จ:', err.message);
// }

// // === Route: LINE Webhook (ใช้ middleware เฉพาะที่นี่) ===
// app.post('/webhook', middleware(lineConfig), async (req, res) => {
//   try {
//     const events = req.body.events;
//     const results = await Promise.all(events.map(handleEvent));
//     res.json(results);
//   } catch (err) {
//     console.error('❌ LINE Webhook error:', err.message);
//     res.status(500).end();
//   }
// });

// // === ฟังก์ชันตอบข้อความ ===
// async function handleEvent(event) {
//   if (event.type !== 'message' || event.message.type !== 'text') return null;

//   const userMessage = event.message.text;
//   const prompt = `${settings.prompt}\n\nลูกค้า: ${userMessage}\n\nตอบกลับ:`;

//   try {
//     const configuration = new Configuration({ apiKey: process.env.GPT_API_KEY });
//     const openai = new OpenAIApi(configuration);

//     const completion = await openai.createChatCompletion({
//       model: 'gpt-3.5-turbo',
//       messages: [{ role: 'user', content: prompt }],
//     });

//     const reply = completion.data.choices[0].message.content;

//     return lineClient.replyMessage(event.replyToken, {
//       type: 'text',
//       text: reply,
//     });
//   } catch (err) {
//     console.error('❌ OpenAI error:', err.response?.data || err.message);
//     return lineClient.replyMessage(event.replyToken, {
//       type: 'text',
//       text: 'ขออภัย ระบบไม่สามารถตอบกลับได้ในขณะนี้',
//     });
//   }
// }

// // === Route: หน้า admin UI ===
// app.get('/admin', (req, res) => {
//   const filePath = path.resolve('admin.html');
//   res.sendFile(filePath, err => {
//     if (err) {
//       console.error('❌ ส่งไฟล์ admin.html ไม่สำเร็จ:', err.message);
//       res.status(500).send('Internal Server Error');
//     }
//   });
// });

// // === API: โหลด prompt ปัจจุบัน ===
// app.get('/admin/settings', (req, res) => {
//   res.json({ prompt: settings.prompt });
// });

// // === API: บันทึก prompt ใหม่ ===
// app.post('/admin/settings', (req, res) => {
//   const { prompt } = req.body;
//   if (!prompt) return res.status(400).send('Missing prompt');

//   settings.prompt = prompt;

//   try {
//     fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
//     res.status(200).send('Prompt saved');
//   } catch (err) {
//     console.error('❌ เขียน setting.json ไม่สำเร็จ:', err.message);
//     res.status(500).send('Failed to save prompt');
//   }
// });

// // === เริ่มต้น server ===
// app.listen(PORT, () => {
//   console.log(`🚀 Server is running at http://localhost:${PORT}`);
// });




