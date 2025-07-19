const express = require('express');
const fs = require('fs');
const path = require('path');
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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(middleware(lineConfig));

// === โหลด setting.json ===
const settingsPath = path.resolve(__dirname, 'setting.json');
let settings = { prompt: 'สวัสดีค่ะ มีอะไรให้เราช่วยไหมคะ' };

try {
  if (fs.existsSync(settingsPath)) {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    settings = JSON.parse(content);
  }
} catch (err) {
  console.error('❌ โหลด setting.json ไม่สำเร็จ:', err.message);
}

// === Route: LINE Webhook ===
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

// === ฟังก์ชันตอบข้อความด้วย GPT ===
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userMessage = event.message.text;
  const prompt = `${settings.prompt}\n\nลูกค้า: ${userMessage}\n\nตอบกลับ:`; // ใช้ prompt จาก setting.json

  try {
    const configuration = new Configuration({ apiKey: process.env.GPT_API_KEY });
    const openai = new OpenAIApi(configuration);

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

// === Route: แสดงหน้า admin.html ===
app.get('/admin', (req, res) => {
  const filePath = path.resolve(__dirname, 'admin.html');
  res.sendFile(filePath, err => {
    if (err) {
      console.error('❌ ส่ง admin.html ไม่สำเร็จ:', err.message);
      res.status(500).send('Internal Server Error');
    }
  });
});

// === API: ดูค่า prompt ปัจจุบัน ===
app.get('/admin/settings', (req, res) => {
  res.json({ prompt: settings.prompt });
});

// === API: บันทึก prompt ใหม่ ===
app.post('/admin/settings', (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).send('Missing prompt');

  settings.prompt = prompt;

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    res.status(200).send('Prompt saved');
  } catch (err) {
    console.error('❌ เขียน setting.json ไม่สำเร็จ:', err.message);
    res.status(500).send('Failed to save prompt');
  }
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});





// const express = require('express');
// const axios = require('axios');
// const fs = require('fs');
// const path = require('path');
// const dotenv = require('dotenv');
// const line = require('@line/bot-sdk');

// dotenv.config();

// const app = express();
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(express.static(path.join(__dirname, 'public')));

// // === Line Config ===
// const config = {
//   channelAccessToken: process.env.LINE_ACCESS_TOKEN,
//   channelSecret: process.env.LINE_CHANNEL_SECRET,
// };
// const client = new line.Client(config);

// // === Settings Path ===
// const settingsPath = path.resolve('./setting.json');

// // === โหลดค่า system_prompt จากไฟล์ ===
// function loadPrompt() {
//   try {
//     const data = fs.readFileSync(settingsPath, 'utf-8');
//     return JSON.parse(data).system_prompt || 'คุณคือแอดมิน LINE';
//   } catch (err) {
//     console.warn('⚠️ ไม่พบ setting.json หรืออ่านไม่สำเร็จ:', err.message);
//     return 'คุณคือแอดมิน LINE';
//   }
// }

// // === Line Webhook ===
// app.post('/webhook', line.middleware(config), async (req, res) => {
//   const events = req.body.events;
//   const prompt = loadPrompt();

//   const replies = events.map(async (event) => {
//     if (event.type === 'message' && event.message.type === 'text') {
//       const userText = event.message.text;

//       try {
//         const completion = await axios.post(
//           'https://api.openai.com/v1/chat/completions',
//           {
//             model: 'gpt-3.5-turbo',
//             messages: [
//               { role: 'system', content: prompt },
//               { role: 'user', content: userText },
//             ],
//           },
//           {
//             headers: {
//               'Content-Type': 'application/json',
//               Authorization: `Bearer ${process.env.GPT_API_KEY}`,
//             },
//           }
//         );

//         const reply = completion.data.choices[0].message.content;
//         return client.replyMessage(event.replyToken, { type: 'text', text: reply });

//       } catch (error) {
//         console.error('❌ GPT ERROR:', error.response?.data || error.message);
//         return client.replyMessage(event.replyToken, {
//           type: 'text',
//           text: 'ขออภัย ระบบไม่สามารถตอบกลับได้ในขณะนี้',
//         });
//       }
//     }
//   });

//   Promise.all(replies).then(() => res.status(200).end());
// });

// // === หน้า /admin ===
// app.get('/admin', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'admin.html'));
// });

// // === API บันทึก prompt ใหม่ ===
// app.post('/admin/prompt', (req, res) => {
//   const newPrompt = req.body.prompt;

//   if (!newPrompt) {
//     return res.status(400).json({ success: false, message: 'ไม่มี prompt ที่ส่งมา' });
//   }

//   try {
//     fs.writeFileSync(settingsPath, JSON.stringify({ system_prompt: newPrompt }, null, 2), 'utf-8');
//     res.json({ success: true });
//   } catch (err) {
//     console.error('❌ บันทึกไม่สำเร็จ:', err.message);
//     res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกได้' });
//   }
// });

// // === เริ่มเซิร์ฟเวอร์ ===
// const port = process.env.PORT || 3000;
// app.listen(port, () => {
//   console.log(`🚀 Server ready at http://localhost:${port}`);
// });


