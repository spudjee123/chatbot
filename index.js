const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/admin', express.static(path.join(__dirname, 'admin.html')));

// === LINE CONFIG ===
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new Client(config);

// === โหลด settings.json ===
const settingsPath = path.join(__dirname, 'setting.json');
let settings = { prompt: 'สวัสดีค่ะ มีอะไรให้เราช่วยเหลือไหมคะ' };
if (fs.existsSync(settingsPath)) {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

// === Webhook จาก LINE ===
app.post('/webhook', middleware(config), async (req, res) => {
  Promise.all(req.body.events.map(handleEvent)).then(result => res.json(result));
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userMessage = event.message.text;
  const fullPrompt = `${settings.prompt}\n\nลูกค้า: ${userMessage}\n\nพนักงาน:`;

  try {
    const reply = await generateReply(fullPrompt);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: reply,
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ขออภัย เซิร์ฟเวอร์มีปัญหาในการตอบกลับ',
    });
  }
}

// === เชื่อม GPT ===
async function generateReply(prompt) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GPT_API_KEY}`,
      },
    }
  );

  return response.data.choices[0].message.content.trim();
}

// === Admin API สำหรับจัดการ Prompt ===
app.get('/admin/settings', (req, res) => {
  res.json(settings);
});

app.post('/admin/settings', (req, res) => {
  const newPrompt = req.body.prompt;
  settings.prompt = newPrompt;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  res.json({ success: true });
});

// === เริ่มเซิร์ฟเวอร์ ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
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


