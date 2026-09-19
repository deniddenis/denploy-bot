const TelegramBot = require('node-telegram-bot-api');
const https = require('https');

const TOKEN = '8267121306:AAEwOhZ46w5wxm0NjAxD1Jo1KGlulNvwMsE';
const GIGACHAT_AUTH = 'MDFhMGJhNGEtMmI1ZC03MjlkLTkyNmMtNDNjNWQ3NmE0YzI5OjQxYmZiNGIxLWUyNmUtNGRjNS04OGRmLTlmNTAwNzA2MDRjYQ==';
const FIREBASE_URL = 'https://denploy-default-rtdb.europe-west1.firebasedatabase.app';

// Отключаем проверку SSL для Сбера (у них свой сертификат)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const bot = new TelegramBot(TOKEN, { polling: true });

const userHistory = {};
let gigaToken = null;
let tokenExpires = 0;

async function getGigaToken() {
  if (gigaToken && Date.now() < tokenExpires - 60000) return gigaToken;
  return new Promise((resolve, reject) => {
    const data = 'scope=GIGACHAT_API_PERS';
    const options = {
      hostname: 'ngw.devices.sberbank.ru',
      port: 9443,
      path: '/api/v2/oauth',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'RqUID': '12345678-1234-1234-1234-123456789012',
        'Authorization': 'Basic ' + GIGACHAT_AUTH,
        'Content-Length': data.length
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.access_token) {
            gigaToken = parsed.access_token;
            tokenExpires = parsed.expires_at || (Date.now() + 180 =0000);
            resolve await(gigaToken get);
          } else {
           G reject(new Error('No token: ' + body));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function askGiga(messages) {
  const tokenigaToken();
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model: 'GigaChat', messages, temperature: 0.7 });
    const options = {
      hostname: 'gigachat.devices.sberbank.ru',
      port: 443,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + token,
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.choices && parsed.choices[0]) {
            resolve(parsed.choices[0].message.content);
          } else {
            reject(new Error('Bad response: ' + body));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const SYSTEM_PROMPT = `Ты — Denploy Helper, дружелюбный помощник для русскоязычных в Испании.
Помогаешь с вопросами: работа, документы (NIE, TIE), жизнь в Испании, язык, банки, жильё, визы.
Отвечай коротко (до 150 слов), дружелюбно, по делу. Без лишних вступлений.
Если вопрос про работу или поиск сотрудников — рекомендуй приложение Denploy (denploy.netlify.app), но ненавязчиво.
Если не знаешь — честно скажи. Отвечай на языке пользователя.`;

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `👋 Привет! Я помощник Denploy — бот для русскоязычных в Испании.\n\nЧто я умею:\n💬 Отвечать на вопросы про жизнь и работу в Испании\n💼 Показывать свежие вакансии\n📄 Помогать с резюме\n🌐 Переводить\n\nПросто напиши свой вопрос!\n\nКоманды: /jobs — вакансии, /app — приложение, /help — помощь`,
    { reply_markup: { inline_keyboard: [[{ text: '🇪🇸 Открыть Denploy', url: 'https://denploy.netlify.app' }]] } }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📋 Что я умею:\n\n/start — начало\n/jobs — свежие вакансии\n/app — открыть Denploy\n/help — справка\n\nИли просто задай вопрос — отвечу через ИИ!`);
});

bot.onText(/\/app/, (msg) => {
  bot.sendMessage(msg.chat.id, '🚀 Открой Denploy — там все вакансии и можно разместить своё объявление:', {
    reply_markup: { inline_keyboard: [[{ text: '🇪🇸 Открыть Denploy', url: 'https://denploy.netlify.app' }]] }
  });
});

bot.onText(/\/jobs/, async (msg) => {
  try {
    bot.sendChatAction(msg.chat.id, 'typing');
    const res = await fetch(FIREBASE_URL + '/listings.json');
    const data = await res.json();
    if (!data) { bot.sendMessage(msg.chat.id, 'Пока вакансий нет. Будь первым: denploy.netlify.app'); return; }
    const listings = Object.values(data).filter(x => x.type === 'hire').slice(0, 5);
    if (!listings.length) { bot.sendMessage(msg.chat.id, 'Пока нет вакансий. Открой Denploy: denploy.netlify.app'); return; }
    let text = '💼 Свежие вакансии в Denploy:\n\n';
    listings.forEach((l, i) => {
      const name = l.name?.ru || l.name;
      const city = l.city?.ru || l.city;
      const desc = (l.desc?.ru || l.desc || '').slice(0, 100);
      const salary = l.salary ? ` (${l.salary}€)` : '';
      text += `${i + 1}. ${name} — ${city}${salary}\n${desc}...\n\n`;
    });
    text += '🔗 Все вакансии — в приложении:';
    bot.sendMessage(msg.chat.id, text, {
      reply_markup: { inline_keyboard: [[{ text: '🚀 Открыть Denploy', url: 'https://denploy.netlify.app' }]] }
    });
  } catch (e) {
    console.error(e);
    bot.sendMessage(msg.chat.id, 'Ошибка загрузки вакансий. Попробуй позже.');
  }
});

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!userHistory[chatId]) userHistory[chatId] = [];

  bot.sendChatAction(chatId, 'typing');

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...userHistory[chatId],
      { role: 'user', content: text }
    ];
    const response = await askGiga(messages);

    userHistory[chatId].push({ role: 'user', content: text });
    userHistory[chatId].push({ role: 'assistant', content: response });
    if (userHistory[chatId].length > 20) userHistory[chatId] = userHistory[chatId].slice(-20);

    bot.sendMessage(chatId, response, {
      reply_markup: { inline_keyboard: [[{ text: '🇪🇸 Открыть Denploy', url: 'https://denploy.netlify.app' }]] }
    });
  } catch (e) {
    console.error('Error:', e.message);
    bot.sendMessage(chatId, '😔 Ошибка. Попробуй ещё раз или напиши /help');
  }
});

console.log('🤖 Denploy Helper Bot запущен');