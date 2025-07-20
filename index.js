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

// === Upload config ===
const upload = multer({ dest: 'uploads/' });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === Static files and body parsers ===
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === Load setting.json ===
const settingsPath = path.join(__dirname, 'setting.json');
let settings = { prompt: '', keywords: [], flex_templates: {} };
function loadSettings() {
  try {
    const data = fs.readFileSync(settingsPath, 'utf8');
    settings = JSON.parse(data);
    console.log('✅ Settings loaded');
  } catch (err) {
    console.error('❌ Failed to load settings:', err.message);
  }
}
loadSettings();

// === Signature Validation ===
function validateSignature(rawBody, secret, signature) {
  const hash = crypto.createHmac('SHA256', secret).update(rawBody).digest('base64');
  return hash === signature;
}

// === Webhook with raw body ===
app.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const signature = req.headers['x-line-signature'];
  if (!validateSignature(req.body, lineConfig.channelSecret, signature)) {
    console.error('❌ Invalid signature');
    return res.status(401).send('Invalid signature');
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf-8'));
  } catch (err) {
    console.error('❌ JSON parse error:', err.message);
    return res.status(400).send('Invalid JSON');
  }

  const results = await Promise.all(body.events.map(handleEvent));
  res.status(200).json(results);
});

// === Handle Message Events ===
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userText = event.message.text.toLowerCase();

  for (const keywordObj of settings.keywords || []) {
    const matched = keywordObj.keywords.some(k => userText.includes(k.toLowerCase()));
    if (matched) {
      const templateKey = keywordObj.type;
      const template = settings.flex_templates[templateKey];
      if (!template) {
        console.warn(`⚠️ Template "${templateKey}" not found`);
        break;
      }

      const filled = JSON.parse(JSON.stringify(template));
      const image = (keywordObj.images && keywordObj.images[0]) || '';
      const text = keywordObj.text || '';

      const fill = (obj) => {
        for (let key in obj) {
          if (typeof obj[key] === 'object') fill(obj[key]);
          if (typeof obj[key] === 'string') {
            obj[key] = obj[key].replace('{{image}}', image).replace('{{text}}', text);
          }
        }
      };
      fill(filled);

      return lineClient.replyMessage(event.replyToken, {
        type: 'flex',
        altText: text || 'ข้อความจากระบบ',
        contents: filled
      });
    }
  }

  return lineClient.replyMessage(event.replyToken, {
    type: 'text',
    text: settings.prompt || 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ',
  });
}

// === Admin UI ===
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin/settings', (req, res) => {
  res.json(settings);
});

app.post('/admin/settings', (req, res) => {
  const { prompt, keywords } = req.body;
  settings.prompt = prompt;
  settings.keywords = keywords;

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    loadSettings();
    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Failed to save settings:', err.message);
    res.status(500).send('Save failed');
  }
});

// === Upload Route ===
app.post('/upload', upload.array('images'), (req, res) => {
  const urls = req.files.map(file => {
    return `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
  });
  res.json({ urls });
});

// === Start server ===
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});



// const express = require('express');
// const fs = require('fs');
// const path = require('path');
// const crypto = require('crypto');
// const multer = require('multer');
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

// // === Multer Upload ===
// const upload = multer({ dest: 'uploads/' });
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// // === Static JSON Parser สำหรับ route อื่นๆ
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // === Raw body parser for webhook ===
// app.use('/webhook', express.raw({ type: '*/*' }));

// // === Settings ===
// const settingsPath = path.resolve('setting.json');
// let settings = { prompt: 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ', keywords: [], flexTemplates: {} };

// function loadSettings() {
//   try {
//     settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
//     console.log('✅ Settings loaded');
//   } catch (e) {
//     console.error('❌ Failed to load settings:', e.message);
//   }
// }
// loadSettings();

// // === Validate LINE Signature ===
// function validateSignature(body, secret, signature) {
//   const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64');
//   return hash === signature;
// }

// // === LINE Webhook ===
// app.post('/webhook', async (req, res) => {
//   const signature = req.headers['x-line-signature'];
//   const isValid = validateSignature(req.body, lineConfig.channelSecret, signature);
//   if (!isValid) return res.status(401).send('Invalid signature');

//   let body;
//   try {
//     body = JSON.parse(req.body.toString('utf-8'));
//   } catch (e) {
//     return res.status(400).send('Invalid JSON');
//   }

//   try {
//     await Promise.all(body.events.map(handleEvent));
//     res.status(200).send('OK');
//   } catch (e) {
//     console.error('❌ Webhook error:', e);
//     res.status(500).send('Server Error');
//   }
// });

// // === Handle LINE Message ===
// async function handleEvent(event) {
//   if (event.type !== 'message' || event.message.type !== 'text') return;

//   const msg = event.message.text.toLowerCase();

//   for (const item of settings.keywords) {
//     if (item.keywords.some(k => msg.includes(k.toLowerCase()))) {
//       if (item.type === 'text') {
//         return lineClient.replyMessage(event.replyToken, { type: 'text', text: item.text });
//       }

//       if (item.type.startsWith('flex')) {
//         const template = settings.flexTemplates[item.type];
//         if (template) {
//           return lineClient.replyMessage(event.replyToken, {
//             type: 'flex',
//             altText: 'ข้อความจากระบบ',
//             contents: template,
//           });
//         }
//       }
//     }
//   }

//   // fallback
//   return lineClient.replyMessage(event.replyToken, {
//     type: 'text',
//     text: settings.prompt || 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ',
//   });
// }

// // === Upload ===
// app.post('/upload', upload.array('images'), (req, res) => {
//   const urls = req.files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`);
//   res.json({ urls });
// });

// // === Admin UI ===
// app.get('/admin', (req, res) => res.sendFile(path.resolve('admin.html')));
// app.get('/admin/settings', (req, res) => res.json(settings));
// app.post('/admin/settings', express.json(), (req, res) => {
//   settings = req.body;
//   fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
//   loadSettings();
//   res.send('OK');
// });

// // === Start Server ===
// app.listen(PORT, () => {
//   console.log(`🚀 Server running at http://localhost:${PORT}`);
// });

