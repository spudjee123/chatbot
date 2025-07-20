const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Configuration, OpenAIApi } = require('openai');
const line = require('@line/bot-sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// === LINE CONFIG ===
const lineConfig = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const lineClient = new line.Client(lineConfig);

// === GPT ===
const gpt = new OpenAIApi(new Configuration({ apiKey: process.env.GPT_API_KEY }));

// === Load Settings ===
const settingsPath = path.join(__dirname, 'setting.json');
let settings = JSON.parse(fs.readFileSync(settingsPath));

// === Serve Static Files (admin.html) ===
app.use(express.static(__dirname));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// === LINE Webhook ===
app.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const signature = req.headers['x-line-signature'];
    if (!validateSignature(req.body, lineConfig.channelSecret, signature)) {
      console.warn('❗ Invalid signature');
      return res.status(200).send('Ignored'); // ต้องตอบ 200 เสมอ
    }

    const body = JSON.parse(req.body.toString('utf-8'));
    const events = body.events || [];

    const results = await Promise.all(events.map(handleEvent));
    return res.status(200).json(results);
  } catch (err) {
    console.error('Webhook Error:', err);
    return res.status(200).send('Error handled');
  }
});

// === Signature Validation ===
function validateSignature(body, secret, signature) {
  const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64');
  return hash === signature;
}

// === Event Handler ===
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userText = event.message.text.trim();
  const replyToken = event.replyToken;

  const matchedKeyword = settings.keywords.find(k =>
    k.keywords.some(keyword => userText.includes(keyword))
  );

  if (matchedKeyword) {
    const type = matchedKeyword.type || 'image';
    const text = matchedKeyword.text || '';
    const images = matchedKeyword.images || [];

    if (type.startsWith('flex')) {
      const template = settings.flex_templates?.[type];
      if (!template) {
        return lineClient.replyMessage(replyToken, {
          type: 'text',
          text: 'พบคำ แต่ไม่มี Flex Template'
        });
      }

      const bubbles = images.map(imageUrl => {
        const bubble = JSON.parse(JSON.stringify(template));
        replaceTemplateText(bubble, '{{text}}', text);
        replaceTemplateText(bubble, '{{image}}', imageUrl);
        return bubble;
      });

      const flexMsg = {
        type: 'flex',
        altText: text,
        contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles }
      };

      return lineClient.replyMessage(replyToken, flexMsg);
    }

    // กรณี type เป็น image ปกติ
    const msgs = images.map(url => ({ type: 'image', originalContentUrl: url, previewImageUrl: url }));
    if (text) msgs.unshift({ type: 'text', text });
    return lineClient.replyMessage(replyToken, msgs);
  }

  // ไม่มี keyword ตรง: ใช้ GPT ตอบ
  const completion = await gpt.createChatCompletion({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'คุณคือแชทบอท LINE ตอบกลับลูกค้า' },
      { role: 'user', content: userText }
    ]
  });

  const gptReply = completion.data.choices[0].message.content;
  return lineClient.replyMessage(replyToken, { type: 'text', text: gptReply });
}

// === Helper: Replace Template Variables ===
function replaceTemplateText(obj, key, val) {
  for (let k in obj) {
    if (typeof obj[k] === 'object') {
      replaceTemplateText(obj[k], key, val);
    } else if (typeof obj[k] === 'string') {
      obj[k] = obj[k].replace(new RegExp(key, 'g'), val);
    }
  }
}

// === Admin (Save Setting) ===
app.post('/save-settings', (req, res) => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(req.body, null, 2));
    settings = req.body;
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Error saving settings:', e);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`LINE Bot is running on port ${PORT}`);
});
