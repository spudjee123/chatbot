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

// === Handle LINE Message (Updated for Multiple Responses) ===
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userMsg = event.message.text.toLowerCase();

  // === ตอบด้วย Flex Message ถ้าข้อความตรงกับ Keyword ที่ตั้งค่าไว้
  for (const item of settings.keywords) {
    const match = item.keywords.find((kw) => userMsg.includes(kw.toLowerCase()));
    // ตรวจสอบว่ามี "ชุดคำตอบ" (responses) และมีข้อมูลข้างในหรือไม่
    if (match && item.responses && item.responses.length > 0 && settings.flex_templates[item.type]) {
      // สร้าง Flex Message จากแต่ละชุดคำตอบ
      const messages = item.responses.map(response => ({
        type: 'flex',
        altText: response.text || 'ข้อความตอบกลับใหม่', // Alt text สำหรับการแจ้งเตือน
        contents: JSON.parse(
          JSON.stringify(settings.flex_templates[item.type])
            .replace(/{{image}}/g, response.image || '') // ใช้รูปภาพของแต่ละชุด
            .replace(/{{text}}/g, response.text || '')   // ใช้ข้อความของแต่ละชุด
        ),
      }));
      // ส่งข้อความทั้งหมดในครั้งเดียว (สูงสุด 5 bubbles)
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


// const express = require('express');
// const fs = require('fs');
// const path = require('path');
// const multer = require('multer');
// const crypto = require('crypto');
// const { Client } = require('@line/bot-sdk');
// const OpenAI = require('openai');
// require('dotenv').config();

// const app = express();
// const PORT = process.env.PORT || 3000;

// // === LINE Config ===
// // ดึงค่า Access Token และ Channel Secret จาก Environment Variables
// const lineConfig = {
//   channelAccessToken: process.env.LINE_ACCESS_TOKEN,
//   channelSecret: process.env.LINE_CHANNEL_SECRET,
// };
// const lineClient = new Client(lineConfig);

// // === OpenAI Config (Updated for v4 and Railway) ===
// // สร้าง Client ของ OpenAI โดยดึง API Key จาก Environment Variables
// // แก้ไขชื่อเป็น GPT_API_KEY ให้ตรงกับไฟล์ .env ของคุณ
// const openai = new OpenAI({
//   apiKey: process.env.GPT_API_KEY,
// });

// // === Middlewares ===
// // ตั้งค่าให้สามารถเข้าถึงไฟล์ในโฟลเดอร์ uploads ได้
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// const upload = multer({ dest: 'uploads/' });

// // Middleware สำหรับบันทึก raw body เพื่อใช้ในการตรวจสอบลายเซ็นของ LINE
// const rawBodySaver = (req, res, buf) => {
//   req.rawBody = buf;
// };
// app.use('/webhook', express.raw({ type: '*/*', verify: rawBodySaver }));
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // === Settings ===
// // โหลดการตั้งค่าจากไฟล์ setting.json
// const settingsPath = path.join(__dirname, 'setting.json');
// let settings = { prompt: '', keywords: [], flex_templates: {} };
// function loadSettings() {
//   try {
//     const data = fs.readFileSync(settingsPath, 'utf8');
//     settings = JSON.parse(data);
//     console.log('✅ Settings loaded successfully');
//   } catch (err) {
//     console.error('❌ Error loading settings.json:', err.message);
//   }
// }
// loadSettings(); // เรียกใช้ฟังก์ชันเพื่อโหลดการตั้งค่าเมื่อเซิร์ฟเวอร์เริ่มทำงาน

// // === Validate LINE Signature ===
// // ฟังก์ชันสำหรับตรวจสอบลายเซ็น (Signature) ที่ส่งมาจาก LINE
// function validateSignature(rawBody, secret, signature) {
//   const hash = crypto
//     .createHmac('SHA256', secret)
//     .update(rawBody)
//     .digest('base64');
//   return hash === signature;
// }

// // === Webhook ===
// // path หลักสำหรับรับข้อความจาก LINE
// app.post('/webhook', async (req, res) => {
//   const signature = req.headers['x-line-signature'];
//   if (!validateSignature(req.rawBody, lineConfig.channelSecret, signature)) {
//     return res.status(401).send('Invalid signature');
//   }

//   let body;
//   try {
//     body = JSON.parse(req.rawBody.toString());
//   } catch (err) {
//     return res.status(400).send('Invalid JSON');
//   }

//   // จัดการกับทุก event ที่ LINE ส่งมา
//   Promise.all(body.events.map(handleEvent))
//     .then((result) => res.json(result))
//     .catch((err) => {
//       console.error('❌ Webhook Error:', err);
//       res.status(500).end();
//     });
// });

// // === Handle LINE Message (Updated) ===
// // ฟังก์ชันหลักสำหรับจัดการกับข้อความที่ผู้ใช้ส่งมา
// async function handleEvent(event) {
//   if (event.type !== 'message' || event.message.type !== 'text') return;

//   const userMsg = event.message.text.toLowerCase();

//   // === ตอบด้วย Flex Message ถ้าข้อความตรงกับ Keyword ที่ตั้งค่าไว้
//   for (const item of settings.keywords) {
//     const match = item.keywords.find((kw) => userMsg.includes(kw.toLowerCase()));
//     if (match && settings.flex_templates[item.type]) {
//       const messages = item.images.map((imgUrl) => ({
//         type: 'flex',
//         altText: item.text || 'Flex message',
//         contents: JSON.parse(
//           JSON.stringify(settings.flex_templates[item.type])
//             .replace(/{{image}}/g, imgUrl)
//             .replace(/{{text}}/g, item.text || '')
//         ),
//       }));
//       return lineClient.replyMessage(event.replyToken, messages);
//     }
//   }

//   // === ถ้าไม่เจอ keyword → ใช้ GPT สร้างข้อความตอบกลับ
//   try {
//     // แก้ไขการเรียกใช้ API ของ OpenAI ให้เป็นเวอร์ชันล่าสุด
//     const gptRes = await openai.chat.completions.create({
//       model: 'gpt-4o-mini',
//       messages: [
//         { role: 'system', content: settings.prompt || 'คุณคือพนักงานบริการลูกค้า PG DOG' },
//         { role: 'user', content: event.message.text },
//       ],
//     });

//     // แก้ไขวิธีการเข้าถึงข้อความตอบกลับ
//     const gptReply = gptRes.choices[0].message.content;

//     return lineClient.replyMessage(event.replyToken, {
//       type: 'text',
//       text: gptReply,
//     });

//   } catch (err) {
//     console.error('❌ GPT API Error:', err.message);
//     return lineClient.replyMessage(event.replyToken, {
//       type: 'text',
//       text: 'ขออภัย ระบบตอบกลับไม่สามารถทำงานได้ในขณะนี้ กรุณาติดต่อแอดมินค่ะ',
//     });
//   }
// }

// // === Admin Panel ===
// // หน้าเว็บสำหรับตั้งค่าระบบ
// app.get('/admin', (req, res) => {
//   res.sendFile(path.join(__dirname, 'admin.html'));
// });

// // API สำหรับดึงข้อมูลการตั้งค่าปัจจุบัน
// app.get('/admin/settings', (req, res) => {
//   res.json(settings);
// });

// // API สำหรับบันทึกการตั้งค่าใหม่
// app.post('/admin/settings', (req, res) => {
//   const { prompt, keywords, flex_templates } = req.body;
//   settings.prompt = prompt || settings.prompt;
//   settings.keywords = keywords || settings.keywords;
//   settings.flex_templates = flex_templates || settings.flex_templates;

//   try {
//     fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
//     loadSettings(); // โหลดการตั้งค่าใหม่หลังจากบันทึก
//     res.sendStatus(200);
//   } catch (err) {
//     console.error('❌ Save settings error:', err.message);
//     res.status(500).send('Save failed');
//   }
// });

// // === Upload Route ===
// // (Optional) path สำหรับอัปโหลดไฟล์
// app.post('/upload', upload.array('images'), (req, res) => {
//   const urls = req.files.map((file) => {
//     return `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
//   });
//   res.json({ urls });
// });

// // === Start Server ===
// // เริ่มการทำงานของเซิร์ฟเวอร์
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });
