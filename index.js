const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bodyParser = require('body-parser');
require('dotenv').config();

const { Configuration, OpenAIApi } = require('openai');
const { middleware, Client, validateSignature } = require('@line/bot-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// LINE Bot config
const lineConfig = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new Client(lineConfig);

// รับ raw body สำหรับ LINE signature validation
app.use('/webhook', bodyParser.raw({ type: '*/*' }));

// Static files และหน้า admin
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer config
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// โหลด setting.json
const settingsPath = path.resolve('setting.json');
let settings = { prompt: 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ', keywords: [] };
if (fs.existsSync(settingsPath)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch (err) {
    console.error('❌ โหลด setting.json ล้มเหลว:', err.message);
  }
}

// ✅ Webhook (พร้อม validate signature)
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-line-signature'];
  const isValid = validateSignature(req.body, lineConfig.channelSecret, signature);

  if (!isValid) {
    console.error('❌ SignatureValidationFailed: no signature');
    return res.status(401).send('Invalid signature');
  }

  const json = JSON.parse(req.body.toString());
  Promise.all(json.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('❌ Webhook handler error:', err.message);
      res.status(500).end();
    });
});

// ✅ ฟังก์ชันตอบกลับ LINE
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const text = event.message.text.toLowerCase();

  for (const keywordObj of settings.keywords || []) {
    if (keywordObj.keywords.some(k => text.includes(k.toLowerCase()))) {
      const messages = keywordObj.images.map(url => ({
        type: 'image',
        originalContentUrl: url,
        previewImageUrl: url,
      }));
      return lineClient.replyMessage(event.replyToken, messages);
    }
  }

  // ถ้าไม่เจอ keyword → ใช้ GPT ตอบ
  const prompt = `${settings.prompt}\n\nลูกค้า: ${text}\n\nตอบกลับ:`;
  try {
    const openai = new OpenAIApi(new Configuration({ apiKey: process.env.GPT_API_KEY }));
    const gpt = await openai.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    return lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: gpt.data.choices[0].message.content,
    });
  } catch (err) {
    console.error('❌ GPT Error:', err.message);
    return lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ขออภัย ระบบไม่สามารถตอบกลับได้ในขณะนี้',
    });
  }
}

// ✅ admin.html
app.get('/admin', (req, res) => {
  res.sendFile(path.resolve('admin.html'));
});

// ✅ โหลด / บันทึก settings
app.get('/admin/settings', (req, res) => {
  res.json(settings);
});

app.post('/admin/settings', (req, res) => {
  try {
    const { prompt, keywords } = req.body;
    settings.prompt = prompt || '';
    settings.keywords = keywords || [];
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    res.status(200).send('saved');
  } catch (err) {
    console.error('❌ บันทึก settings ผิดพลาด:', err.message);
    res.status(500).send('save failed');
  }
});

// ✅ Upload รูป
app.post('/upload', upload.array('images'), (req, res) => {
  const urls = req.files.map(file =>
    `${req.protocol}://${req.get('host')}/uploads/${file.filename}`
  );
  res.json({ urls });
});

// ✅ Start
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});


// const express = require('express');
// const fs = require('fs');
// const path = require('path');
// const multer = require('multer');
// const bodyParser = require('body-parser');
// require('dotenv').config();

// const { Configuration, OpenAIApi } = require('openai');
// const { middleware, Client } = require('@line/bot-sdk');

// const app = express();
// const PORT = process.env.PORT || 3000;

// // LINE Bot config
// const lineConfig = {
//   channelAccessToken: process.env.LINE_ACCESS_TOKEN,
//   channelSecret: process.env.LINE_CHANNEL_SECRET,
// };
// const lineClient = new Client(lineConfig);

// // Multer สำหรับรับไฟล์
// const upload = multer({ dest: 'uploads/' });

// // Static files (ไม่ใช้ express.json() เพื่อไม่ให้กระทบ req.rawBody)
// app.use(express.urlencoded({ extended: true }));
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// // โหลด setting.json
// const settingsPath = path.resolve('setting.json');
// let settings = { prompt: 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ', keywords: [] };
// try {
//   if (fs.existsSync(settingsPath)) {
//     const content = fs.readFileSync(settingsPath, 'utf-8');
//     settings = JSON.parse(content);
//   }
// } catch (err) {
//   console.error('❌ โหลด setting.json ไม่สำเร็จ:', err.message);
// }

// // ✅ LINE Webhook: ต้องใช้ body-parser แบบ raw
// app.post(
//   '/webhook',
//   bodyParser.json({
//     verify: (req, res, buf) => {
//       req.rawBody = buf;
//     },
//   }),
//   middleware(lineConfig),
//   async (req, res) => {
//     try {
//       const events = req.body.events;
//       const results = await Promise.all(events.map(handleEvent));
//       res.json(results);
//     } catch (err) {
//       console.error('❌ LINE Webhook error:', err.message);
//       res.status(500).send('Server Error');
//     }
//   }
// );

// // ฟังก์ชันตอบกลับ LINE
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
//     const openai = new OpenAIApi(
//       new Configuration({ apiKey: process.env.GPT_API_KEY })
//     );
//     const completion = await openai.createChatCompletion({
//       model: 'gpt-4o-mini',
//       messages: [{ role: 'user', content: prompt }],
//     });

//     const reply = completion.data.choices[0].message.content;
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

// // หน้า admin
// app.get('/admin', (req, res) => {
//   res.sendFile(path.resolve('admin.html'));
// });

// // ดึง/บันทึก setting.json
// app.get('/admin/settings', (req, res) => {
//   res.json(settings);
// });

// app.post('/admin/settings', (req, res) => {
//   const { prompt, keywords } = req.body;
//   if (prompt) settings.prompt = prompt;
//   if (keywords) settings.keywords = keywords;

//   try {
//     fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
//     res.status(200).send('บันทึกแล้ว');
//   } catch (err) {
//     console.error('❌ เขียน setting.json ไม่สำเร็จ:', err.message);
//     res.status(500).send('ไม่สามารถบันทึกได้');
//   }
// });

// // อัปโหลดรูป
// app.post('/upload', upload.array('images'), (req, res) => {
//   const urls = req.files.map(file => {
//     const filename = file.filename;
//     return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
//   });
//   res.json({ urls });
// });

// // เริ่มเซิร์ฟเวอร์
// app.listen(PORT, () => {
//   console.log(`🚀 Server is running on http://localhost:${PORT}`);
// });
