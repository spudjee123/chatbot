const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const line = require('@line/bot-sdk');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// === Line Config ===
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// === Settings Path ===
const settingsPath = path.resolve('./setting.json');

// === โหลดค่า system_prompt จากไฟล์ ===
function loadPrompt() {
  try {
    const data = fs.readFileSync(settingsPath, 'utf-8');
    return JSON.parse(data).system_prompt || 'คุณคือแอดมิน LINE';
  } catch (err) {
    console.warn('⚠️ ไม่พบ setting.json หรืออ่านไม่สำเร็จ:', err.message);
    return 'คุณคือแอดมิน LINE';
  }
}

// === Line Webhook ===
app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;
  const prompt = loadPrompt();

  const replies = events.map(async (event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      const userText = event.message.text;

      try {
        const completion = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: userText },
            ],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.GPT_API_KEY}`,
            },
          }
        );

        const reply = completion.data.choices[0].message.content;
        return client.replyMessage(event.replyToken, { type: 'text', text: reply });

      } catch (error) {
        console.error('❌ GPT ERROR:', error.response?.data || error.message);
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'ขออภัย ระบบไม่สามารถตอบกลับได้ในขณะนี้',
        });
      }
    }
  });

  Promise.all(replies).then(() => res.status(200).end());
});

// === หน้า /admin ===
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// === API บันทึก prompt ใหม่ ===
app.post('/admin/prompt', (req, res) => {
  const newPrompt = req.body.prompt;

  if (!newPrompt) {
    return res.status(400).json({ success: false, message: 'ไม่มี prompt ที่ส่งมา' });
  }

  try {
    fs.writeFileSync(settingsPath, JSON.stringify({ system_prompt: newPrompt }, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (err) {
    console.error('❌ บันทึกไม่สำเร็จ:', err.message);
    res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกได้' });
  }
});

// === เริ่มเซิร์ฟเวอร์ ===
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server ready at http://localhost:${port}`);
});


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
