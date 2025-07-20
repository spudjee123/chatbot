// === index.js ===
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
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

// === Upload ===
const upload = multer({ dest: 'uploads/' });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === Middlewares ===
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

// === LINE Signature Validate ===
function validateSignature(body, secret, signature) {
  const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64');
  return hash === signature;
}

// === Webhook ===
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

// === Flex Template Generator ===
function generateFlex(type, title, images) {
  switch (type) {
    case 'flex1':
      return {
        type: 'bubble',
        hero: images[0] && {
          type: 'image',
          url: images[0],
          size: 'full',
          aspectRatio: '20:13',
          aspectMode: 'cover'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: title || 'ไม่มีข้อความ', weight: 'bold', size: 'lg', color: '#ff5555', wrap: true },
            ...images.slice(1).map(url => ({
              type: 'image', url, size: 'xs', aspectMode: 'cover', margin: 'sm'
            }))
          ]
        }
      };

    case 'flex2':
      return {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{ type: 'text', text: '🎉 โปรโมชั่นใหม่!', weight: 'bold', size: 'lg', color: '#00b14f' }]
        },
        hero: images[0] && {
          type: 'image',
          url: images[0],
          size: 'full',
          aspectRatio: '16:9',
          aspectMode: 'cover'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            { type: 'text', text: title || 'ไม่มีข้อความ', wrap: true },
            ...images.slice(1).map(url => ({
              type: 'image', url, size: 'sm', aspectMode: 'cover', margin: 'md'
            }))
          ]
        }
      };

    default:
      return {
        type: 'bubble',
        hero: images[0] && {
          type: 'image',
          url: images[0],
          size: 'full',
          aspectRatio: '20:13',
          aspectMode: 'cover'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: title || 'ไม่มีข้อความ', weight: 'bold', size: 'md', wrap: true },
            ...images.slice(1).map(url => ({
              type: 'image', url, size: 'sm', aspectMode: 'cover', margin: 'md'
            }))
          ]
        }
      };
  }
}

// === LINE Handler ===
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;
  const text = event.message.text.toLowerCase();

  for (const obj of settings.keywords || []) {
    if (obj.keywords.some(k => text.includes(k.toLowerCase()))) {
      if (obj.type === 'image') {
        const imageMsgs = obj.images.map(url => ({
          type: 'image', originalContentUrl: url, previewImageUrl: url
        }));
        return lineClient.replyMessage(event.replyToken, imageMsgs);
      }

      if (obj.type?.startsWith('flex')) {
        const flex = generateFlex(obj.type, obj.text || '', obj.images || []);
        return lineClient.replyMessage(event.replyToken, {
          type: 'flex', altText: obj.text || 'มีข้อความใหม่', contents: flex
        });
      }
    }
  }

  return lineClient.replyMessage(event.replyToken, {
    type: 'text',
    text: settings.prompt || 'สวัสดีค่ะ'
  });
}

// === Admin ===
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
    res.send('บันทึกแล้ว');
  } catch (err) {
    console.error('❌ Save error:', err.message);
    res.status(500).send('บันทึกล้มเหลว');
  }
});

// === Upload ===
app.post('/upload', upload.array('images'), (req, res) => {
  const urls = req.files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`);
  res.json({ urls });
});

app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));


// const express = require('express');
// const fs = require('fs');
// const path = require('path');
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

// // === Validate LINE Signature ===
// function validateSignature(body, secret, signature) {
//   const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64');
//   return hash === signature;
// }

// // === /webhook: ใช้ raw body เท่านั้น เพื่อ validate signature
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
//     console.error('❌ Webhook error:', err.stack || err.message);
//     res.status(500).send('Server error');
//   }
// });

// // ✅ Middleware สำหรับ route อื่น
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// // === LINE Event Handler
// async function handleEvent(event) {
//   if (event.type !== 'message' || event.message.type !== 'text') return null;

//   const userMessage = event.message.text.toLowerCase();

//   for (const keywordObj of settings.keywords || []) {
//     if (keywordObj.keywords.some(kw => userMessage.includes(kw.toLowerCase()))) {
//       const type = keywordObj.type || 'default';
//       const flex = generateFlex(type, keywordObj.text, keywordObj.images || []);

//       return lineClient.replyMessage(event.replyToken, {
//         type: 'flex',
//         altText: keywordObj.text || 'ข้อความจากระบบ',
//         contents: flex,
//       });
//     }
//   }

//   return lineClient.replyMessage(event.replyToken, {
//     type: 'text',
//     text: settings.prompt || 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ',
//   });
// }

// // === Flex Generator
// function generateFlex(type, title, images) {
//   switch (type) {
//     case 'flex_promo':
//     case 'flex_game':
//     default:
//       return {
//         type: 'bubble',
//         hero: images[0]
//           ? {
//               type: 'image',
//               url: images[0],
//               size: 'full',
//               aspectRatio: '20:13',
//               aspectMode: 'cover',
//             }
//           : undefined,
//         body: {
//           type: 'box',
//           layout: 'vertical',
//           contents: [
//             { type: 'text', text: title || 'ไม่มีข้อความ', weight: 'bold', size: 'md', wrap: true },
//             ...(images.slice(1).map(url => ({
//               type: 'image',
//               url,
//               size: 'sm',
//               aspectMode: 'cover',
//               margin: 'md',
//             }))),
//           ],
//         },
//       };
//   }
// }

// // === Admin UI
// app.get('/admin', (req, res) => {
//   res.sendFile(path.resolve('admin.html'));
// });

// app.get('/admin/settings', (req, res) => {
//   res.json(settings);
// });

// app.post('/admin/settings', (req, res) => {
//   const { prompt, keywords } = req.body;
//   if (prompt) settings.prompt = prompt;
//   if (keywords) settings.keywords = keywords;

//   try {
//     fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
//     loadSettings();
//     res.status(200).send('บันทึกแล้ว');
//   } catch (err) {
//     console.error('❌ Save settings failed:', err.message);
//     res.status(500).send('Save failed');
//   }
// });

// // === Start Server
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });

