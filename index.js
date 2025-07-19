const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
app.use(express.json());

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const GPT_API_KEY = process.env.GPT_API_KEY;

app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userText = event.message.text;
      const replyToken = event.replyToken;

      try {
        // 🧠 ส่งคำถามไปยัง ChatGPT พร้อม system prompt
        const gptRes = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: 'คุณคือแอดมิน ของเว็บ พนันออนไลน์ ชื่อว่า PG DOG ตอบคำถามลูกค้าอย่างสุภาพในภาษาไทย ให้ข้อมูลเกี่ยวกับ โปรโมชั่น การเงิน ฝาก หรือ ถอน ทางเข้าเล่นของเว็บ ตอบข้อมูลเรื่อง อัตราการจ่าย เช่น สล็อต บอล คาสิโน'
              },
              {
                role: 'user',
                content: userText
              }
            ],
            temperature: 0.7
          },
          {
            headers: {
              Authorization: `Bearer ${GPT_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const aiReply = gptRes.data.choices[0].message.content;

        // 💬 ตอบกลับผ่าน LINE Messaging API
        await axios.post(
          'https://api.line.me/v2/bot/message/reply',
          {
            replyToken,
            messages: [{ type: 'text', text: aiReply }]
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
            }
          }
        );
      } catch (err) {
        console.error('❌ ERROR:', err.response?.data || err.message);
      }
    }
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 LINE Bot is running on port ${PORT}`);
});
