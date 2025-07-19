const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

const settingsPath = path.join(__dirname, 'settings.json');
let settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

// LINE Webhook
app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (!events || events.length === 0) return res.sendStatus(200);

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;

      try {
        const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: settings.system_prompt },
            { role: 'user', content: userMessage }
          ]
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.GPT_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        const replyMessage = gptRes.data.choices[0].message.content;

        await axios.post('https://api.line.me/v2/bot/message/reply', {
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: replyMessage }]
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LINE_ACCESS_TOKEN}`
          }
        });
      } catch (error) {
        console.error('❌ GPT Error:', error.response?.data || error.message);
      }
    }
  }

  res.sendStatus(200);
});

// Admin - Get current prompt
app.get('/admin/prompt', (req, res) => {
  res.json({ prompt: settings.system_prompt });
});

// Admin - Update prompt
app.post('/admin/prompt', (req, res) => {
  const newPrompt = req.body.prompt;
  if (!newPrompt) return res.status(400).json({ error: 'Prompt is required' });

  settings.system_prompt = newPrompt;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

  res.json({ success: true, prompt: newPrompt });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));


// const express = require('express');
// const axios = require('axios');
// const dotenv = require('dotenv');

// dotenv.config();
// const app = express();
// app.use(express.json());

// const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
// const GPT_API_KEY = process.env.GPT_API_KEY;

// app.post('/webhook', async (req, res) => {
//   const events = req.body.events;

//   for (const event of events) {
//     if (event.type === 'message' && event.message.type === 'text') {
//       const userText = event.message.text;
//       const replyToken = event.replyToken;

//       try {
//         // 🧠 ส่งคำถามไปยัง ChatGPT พร้อม system prompt
//         const gptRes = await axios.post(
//           'https://api.openai.com/v1/chat/completions',
//           {
//             model: 'gpt-4o',
//             messages: [
//               {
//                 role: 'system',
//                 content: 'คุณคือแอดมิน ของเว็บ พนันออนไลน์ ชื่อว่า PG DOG ตอบคำถามลูกค้าอย่างสุภาพในภาษาไทย ให้ข้อมูลเกี่ยวกับ โปรโมชั่น การเงิน ฝาก หรือ ถอน ทางเข้าเล่นของเว็บ ตอบข้อมูลเรื่อง อัตราการจ่าย เช่น สล็อต บอล คาสิโน'
//               },
//               {
//                 role: 'user',
//                 content: userText
//               }
//             ],
//             temperature: 0.7
//           },
//           {
//             headers: {
//               Authorization: `Bearer ${GPT_API_KEY}`,
//               'Content-Type': 'application/json'
//             }
//           }
//         );

//         const aiReply = gptRes.data.choices[0].message.content;

//         // 💬 ตอบกลับผ่าน LINE Messaging API
//         await axios.post(
//           'https://api.line.me/v2/bot/message/reply',
//           {
//             replyToken,
//             messages: [{ type: 'text', text: aiReply }]
//           },
//           {
//             headers: {
//               'Content-Type': 'application/json',
//               Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
//             }
//           }
//         );
//       } catch (err) {
//         console.error('❌ ERROR:', err.response?.data || err.message);
//       }
//     }
//   }

//   res.sendStatus(200);
// });

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`🚀 LINE Bot is running on port ${PORT}`);
// });
