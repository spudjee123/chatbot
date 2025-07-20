const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
require('dotenv').config();

const { Client } = require('@line/bot-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// === LINE Config ===
const lineConfig = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new Client(lineConfig);

// === Multer Upload ===
const upload = multer({ dest: 'uploads/' });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === Static JSON Parser สำหรับ route อื่นๆ
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === Raw body parser for webhook ===
app.use('/webhook', express.raw({ type: '*/*' }));

// === Settings ===
const settingsPath = path.resolve('setting.json');
let settings = { prompt: 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ', keywords: [], flexTemplates: {} };

function loadSettings() {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    console.log('✅ Settings loaded');
  } catch (e) {
    console.error('❌ Failed to load settings:', e.message);
  }
}
loadSettings();

// === Validate LINE Signature ===
function validateSignature(body, secret, signature) {
  const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64');
  return hash === signature;
}

// === LINE Webhook ===
app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-line-signature'];
  const isValid = validateSignature(req.body, lineConfig.channelSecret, signature);
  if (!isValid) return res.status(401).send('Invalid signature');

  let body;
  try {
    body = JSON.parse(req.body.toString('utf-8'));
  } catch (e) {
    return res.status(400).send('Invalid JSON');
  }

  try {
    await Promise.all(body.events.map(handleEvent));
    res.status(200).send('OK');
  } catch (e) {
    console.error('❌ Webhook error:', e);
    res.status(500).send('Server Error');
  }
});

// === Handle LINE Message ===
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const msg = event.message.text.toLowerCase();

  for (const item of settings.keywords) {
    if (item.keywords.some(k => msg.includes(k.toLowerCase()))) {
      if (item.type === 'text') {
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: item.text });
      }

      if (item.type.startsWith('flex')) {
        const template = settings.flexTemplates[item.type];
        if (template) {
          return lineClient.replyMessage(event.replyToken, {
            type: 'flex',
            altText: 'ข้อความจากระบบ',
            contents: template,
          });
        }
      }
    }
  }

  // fallback
  return lineClient.replyMessage(event.replyToken, {
    type: 'text',
    text: settings.prompt || 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ',
  });
}

// === Upload ===
app.post('/upload', upload.array('images'), (req, res) => {
  const urls = req.files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`);
  res.json({ urls });
});

// === Admin UI ===
app.get('/admin', (req, res) => res.sendFile(path.resolve('admin.html')));
app.get('/admin/settings', (req, res) => res.json(settings));
app.post('/admin/settings', express.json(), (req, res) => {
  settings = req.body;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  loadSettings();
  res.send('OK');
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});


// // === index.js ===
// const express = require('express');
// const fs = require('fs');
// const path = require('path');
// const multer = require('multer');
// const crypto = require('crypto');
// require('dotenv').config();

// const { Client } = require('@line/bot-sdk');
// const app = express();
// const PORT = process.env.PORT || 3000;

// // === LINE Config ===
// const lineConfig = {
//   channelAccessToken: process.env.LINE_ACCESS_TOKEN,
//   channelSecret: process.env.LINE_CHANNEL_SECRET,
// };
// const lineClient = new Client(lineConfig);

// // === Upload ===
// const upload = multer({ dest: 'uploads/' });
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// // === Middlewares ===
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // === Settings ===
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

// // === LINE Signature Validate ===
// function validateSignature(body, secret, signature) {
//   const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64');
//   return hash === signature;
// }

// // === Webhook ===
// app.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
//   const signature = req.headers['x-line-signature'];
//   if (!validateSignature(req.body, lineConfig.channelSecret, signature)) {
//     console.error('❌ Invalid LINE signature');
//     return res.status(401).send('Invalid signature');
//   }

//   let body;
//   try {
//     body = JSON.parse(req.body.toString('utf-8'));
//   } catch (err) {
//     console.error('❌ JSON parse error:', err.message);
//     return res.status(400).send('Invalid JSON');
//   }

//   try {
//     const results = await Promise.all(body.events.map(handleEvent));
//     res.status(200).json(results);
//   } catch (err) {
//     console.error('❌ Webhook error:', err.message);
//     res.status(500).send('Server error');
//   }
// });

// // === Flex Template Generator ===
// function generateFlex(type, title, images) {
//   switch (type) {
//     case 'flex1':
//       return {
//         type: 'bubble',
//         hero: images[0] && {
//           type: 'image',
//           url: images[0],
//           size: 'full',
//           aspectRatio: '20:13',
//           aspectMode: 'cover'
//         },
//         body: {
//           type: 'box',
//           layout: 'vertical',
//           contents: [
//             { type: 'text', text: title || 'ไม่มีข้อความ', weight: 'bold', size: 'lg', color: '#ff5555', wrap: true },
//             ...images.slice(1).map(url => ({
//               type: 'image', url, size: 'xs', aspectMode: 'cover', margin: 'sm'
//             }))
//           ]
//         }
//       };

//     case 'flex2':
//       return {
//         type: 'bubble',
//         header: {
//           type: 'box',
//           layout: 'vertical',
//           contents: [{ type: 'text', text: '🎉 โปรโมชั่นใหม่!', weight: 'bold', size: 'lg', color: '#00b14f' }]
//         },
//         hero: images[0] && {
//           type: 'image',
//           url: images[0],
//           size: 'full',
//           aspectRatio: '16:9',
//           aspectMode: 'cover'
//         },
//         body: {
//           type: 'box',
//           layout: 'vertical',
//           spacing: 'md',
//           contents: [
//             { type: 'text', text: title || 'ไม่มีข้อความ', wrap: true },
//             ...images.slice(1).map(url => ({
//               type: 'image', url, size: 'sm', aspectMode: 'cover', margin: 'md'
//             }))
//           ]
//         }
//       };

//     default:
//       return {
//         type: 'bubble',
//         hero: images[0] && {
//           type: 'image',
//           url: images[0],
//           size: 'full',
//           aspectRatio: '20:13',
//           aspectMode: 'cover'
//         },
//         body: {
//           type: 'box',
//           layout: 'vertical',
//           contents: [
//             { type: 'text', text: title || 'ไม่มีข้อความ', weight: 'bold', size: 'md', wrap: true },
//             ...images.slice(1).map(url => ({
//               type: 'image', url, size: 'sm', aspectMode: 'cover', margin: 'md'
//             }))
//           ]
//         }
//       };
//   }
// }

// // === LINE Handler ===
// async function handleEvent(event) {
//   if (event.type !== 'message' || event.message.type !== 'text') return null;
//   const text = event.message.text.toLowerCase();

//   for (const obj of settings.keywords || []) {
//     if (obj.keywords.some(k => text.includes(k.toLowerCase()))) {
//       if (obj.type === 'image') {
//         const imageMsgs = obj.images.map(url => ({
//           type: 'image', originalContentUrl: url, previewImageUrl: url
//         }));
//         return lineClient.replyMessage(event.replyToken, imageMsgs);
//       }

//       if (obj.type?.startsWith('flex')) {
//         const flex = generateFlex(obj.type, obj.text || '', obj.images || []);
//         return lineClient.replyMessage(event.replyToken, {
//           type: 'flex', altText: obj.text || 'มีข้อความใหม่', contents: flex
//         });
//       }
//     }
//   }

//   return lineClient.replyMessage(event.replyToken, {
//     type: 'text',
//     text: settings.prompt || 'สวัสดีค่ะ'
//   });
// }

// // === Admin ===
// app.get('/admin', (req, res) => {
//   res.sendFile(path.resolve('admin.html'));
// });

// app.get('/admin/settings', (req, res) => {
//   res.json(settings);
// });

// app.post('/admin/settings', express.json(), (req, res) => {
//   const { prompt, keywords } = req.body;
//   if (prompt) settings.prompt = prompt;
//   if (keywords) settings.keywords = keywords;
//   try {
//     fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
//     loadSettings();
//     res.send('บันทึกแล้ว');
//   } catch (err) {
//     console.error('❌ Save error:', err.message);
//     res.status(500).send('บันทึกล้มเหลว');
//   }
// });

// // === Upload ===
// app.post('/upload', upload.array('images'), (req, res) => {
//   const urls = req.files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`);
//   res.json({ urls });
// });

// app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));
