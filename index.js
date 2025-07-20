const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { middleware, Client } = require('@line/bot-sdk');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const settingsPath = path.join(__dirname, 'setting.json');
const uploadDir = path.join(__dirname, 'public', 'uploads');

// โหลด settings
let settings = { keywords: [] };
if (fs.existsSync(settingsPath)) {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
}

// LINE config
const lineConfig = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new Client(lineConfig);

// Middleware
app.use(middleware(lineConfig));
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== LINE Webhook =====
app.post('/webhook', async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook Error:', err);
    res.sendStatus(500);
  }
});

// ===== จัดการข้อความที่ส่งมา =====
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const text = event.message.text.trim().toLowerCase();
  const match = settings.keywords.find(group =>
    group.keys.some(k => text.includes(k.toLowerCase()))
  );

  if (match && match.images.length > 0) {
    const messages = match.images.map(url => ({
      type: 'image',
      originalContentUrl: url,
      previewImageUrl: url,
    }));
    await lineClient.replyMessage(event.replyToken, messages);
  } else {
    await lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ขออภัย ระบบไม่สามารถตอบกลับได้ในขณะนี้',
    });
  }
}

// ===== อัปโหลดรูปภาพ =====
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + Math.random().toString(36).substring(2);
    const ext = path.extname(file.originalname);
    cb(null, uniqueName + ext);
  }
});
const upload = multer({ storage });

app.post('/upload', upload.array('images'), (req, res) => {
  const urls = req.files.map(file =>
    `${req.protocol}://${req.get('host')}/uploads/${file.filename}`
  );
  res.json({ urls });
});

// ===== API บันทึก setting.json =====
app.post('/admin/save', (req, res) => {
  fs.writeFileSync(settingsPath, JSON.stringify(req.body, null, 2));
  settings = req.body;
  res.sendStatus(200);
});

// ===== โหลดหน้า admin.html =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ===== Start =====
app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
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
