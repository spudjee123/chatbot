const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bodyParser = require('body-parser');
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

// === Upload Config ===
const upload = multer({ dest: 'uploads/' });

// === Middleware ===
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === Load Settings ===
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

// === Validate Signature ===
function validateLineSignature(body, secret, signature) {
  const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64');
  return hash === signature;
}

// === Webhook ===
app.post('/webhook', bodyParser.raw({ type: '*/*' }), (req, res, next) => {
  const signature = req.headers['x-line-signature'];
  if (!signature || !validateLineSignature(req.body, lineConfig.channelSecret, signature)) {
    console.error('❌ Invalid signature');
    return res.status(401).send('Invalid signature');
  }
  try {
    req.body = JSON.parse(req.body.toString());
  } catch (err) {
    console.error('❌ JSON parse error:', err.message);
    return res.status(400).send('Invalid JSON');
  }
  next();
}, async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error('❌ Webhook error:', err);
    res.status(500).send('Server error');
  }
});

// === Handle LINE Messages ===
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;
  const userMessage = event.message.text.toLowerCase();

  // ตรวจสอบ keyword
  for (const keywordObj of settings.keywords || []) {
    if (keywordObj.keywords.some(kw => userMessage.includes(kw.toLowerCase()))) {
      const imageMessages = keywordObj.images.map(url => ({
        type: 'image',
        originalContentUrl: url,
        previewImageUrl: url,
      }));
      return lineClient.replyMessage(event.replyToken, imageMessages);
    }
  }

  // Fallback ไปใช้ GPT
  const prompt = `${settings.prompt}\n\nลูกค้า: ${userMessage}\n\nตอบกลับ:`;
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    });

    const reply = completion.choices?.[0]?.message?.content || 'ขออภัย ไม่สามารถตอบได้';
    const trimmedReply = reply.length > 4999 ? reply.slice(0, 4999) : reply;

    return await lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: trimmedReply,
    });

  } catch (err) {
    console.error('❌ GPT or LINE Reply error:', err.response?.data || err.message);
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
    loadSettings(); // รีโหลดใหม่ทันที
    res.status(200).send('บันทึกแล้ว');
  } catch (err) {
    console.error('❌ Save settings failed:', err.message);
    res.status(500).send('Save failed');
  }
});

// === Upload Images ===
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


// const express = require('express');
// const fs = require('fs');
// const path = require('path');
// const multer = require('multer');
// const bodyParser = require('body-parser');
// const crypto = require('crypto');
// require('dotenv').config();

// const OpenAI = require('openai');
// const { Client } = require('@line/bot-sdk');

// const app = express();
// const PORT = process.env.PORT || 3000;

// // === LINE Bot Config ===
// const lineConfig = {
//   channelAccessToken: process.env.LINE_ACCESS_TOKEN,
//   channelSecret: process.env.LINE_CHANNEL_SECRET,
// };
// const lineClient = new Client(lineConfig);

// // === OpenAI Config ===
// const openai = new OpenAI({ apiKey: process.env.GPT_API_KEY });

// // === Upload Middleware ===
// const upload = multer({ dest: 'uploads/' });
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// app.use(express.urlencoded({ extended: true }));

// // === Load Settings ===
// const settingsPath = path.resolve('setting.json');
// let settings = { prompt: 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ', keywords: [] };
// function loadSettings() {
//   try {
//     const content = fs.readFileSync(settingsPath, 'utf-8');
//     settings = JSON.parse(content);
//     console.log('✅ Settings loaded');
//   } catch (err) {
//     console.error('❌ Load settings failed:', err.message);
//   }
// }
// loadSettings();

// // === Validate Signature ===
// function validateLineSignature(body, secret, signature) {
//   const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64');
//   return hash === signature;
// }

// // === Webhook Route ===
// app.post('/webhook', bodyParser.raw({ type: '*/*' }), async (req, res) => {
//   const signature = req.headers['x-line-signature'];
//   if (!signature || !validateLineSignature(req.body, lineConfig.channelSecret, signature)) {
//     console.error('❌ Invalid signature');
//     return res.status(401).send('Invalid signature');
//   }

//   let body;
//   try {
//     body = JSON.parse(req.body.toString());
//   } catch (err) {
//     console.error('❌ JSON parse error:', err.message);
//     return res.status(400).send('Invalid JSON');
//   }

//   try {
//     const results = await Promise.all(body.events.map(handleEvent));
//     res.json(results);
//   } catch (err) {
//     console.error('❌ Webhook error:', err);
//     res.status(500).send('Server error');
//   }
// });

// // === Event Handler ===
// async function handleEvent(event) {
//   if (event.type !== 'message' || event.message.type !== 'text') return null;

//   const userMessage = event.message.text.toLowerCase();

//   for (const keywordObj of settings.keywords || []) {
//     if (keywordObj.keywords.some(kw => userMessage.includes(kw.toLowerCase()))) {
//       const imageMessages = keywordObj.images.map(url => ({
//         type: 'image',
//         originalContentUrl: url,
//         previewImageUrl: url,
//       }));
//       return lineClient.replyMessage(event.replyToken, imageMessages);
//     }
//   }

//   const prompt = `${settings.prompt}\n\nลูกค้า: ${userMessage}\n\nตอบกลับ:`;
//   try {
//     const completion = await openai.chat.completions.create({
//       model: 'gpt-4o',
//       messages: [{ role: 'user', content: prompt }],
//     });
//     const reply = completion.choices[0].message.content;
//     return lineClient.replyMessage(event.replyToken, {
//       type: 'text',
//       text: reply,
//     });
//   } catch (err) {
//     console.error('❌ GPT error:', err.message);
//     return lineClient.replyMessage(event.replyToken, {
//       type: 'text',
//       text: 'ขออภัย ระบบไม่สามารถตอบกลับได้ในขณะนี้',
//     });
//   }
// }

// // === Admin UI ===
// app.get('/admin', (req, res) => {
//   res.sendFile(path.resolve('admin.html'));
// });

// app.get('/admin/settings', (req, res) => {
//   res.json(settings);
// });

// app.post('/admin/settings', express.json(), (req, res) => {
//   const { prompt, keywords } = req.body;
//   if (typeof prompt === 'string') settings.prompt = prompt;
//   if (Array.isArray(keywords)) settings.keywords = keywords;

//   try {
//     fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
//     loadSettings(); // ✅ reload after save
//     res.status(200).send('บันทึกแล้ว');
//   } catch (err) {
//     console.error('❌ Save settings failed:', err.message);
//     res.status(500).send('Save failed');
//   }
// });

// // === Upload API ===
// app.post('/upload', upload.array('images'), (req, res) => {
//   const urls = req.files.map(file => {
//     return `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
//   });
//   res.json({ urls });
// });

// // === Start Server ===
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });
