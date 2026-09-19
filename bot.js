const { Telegraf, Markup } = require('telegraf');
const https = require('https');

const TOKEN = '8267121306:AAEwOhZ46w5wxm0NjAxD1Jo1KGlulNvwMsE';
const GIGACHAT_AUTH = 'MDFhMGJhNGEtMmI1ZC03MjlkLTkyNmMtNDNjNWQ3NmE0YzI5OjQxYmZiNGIxLWUyNmUtNGRjNS04OGRmLTlmNTAwNzA2MDRjYQ==';
const FIREBASE_URL = 'https://denploy-default-rtdb.europe-west1.firebasedatabase.app';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const bot = new Telegraf(TOKEN);

const userHistory = {};
let gigaToken = null;
let tokenExpires = 0;

function getGigaToken() {
  return new Promise((resolve, reject) => {
    if (gigaToken && Date.now() < tokenExpires - 60000) return resolve(gigaToken);
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
        'Content-Length': Buffer.byteLength(data)
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
            tokenExpires = parsed.expires_at || (Date.now() + 1800000);
            resolve(gigaToken);
          } else reject(new Error('No token: ' + body));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function askGiga(messages) {
  return new Promise(async (resolve, reject) => {
    try {
      const token = await getGigaToken();
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
            if (parsed.choices && parsed.choices[0]) resolve(parsed.choices[0].message.content);
            else reject(new Error('Bad response: ' + body));
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    } catch (e) { reject(e); }
  });
}

const SYSTEM_PROMPT = `Ты — Denploy Helper, дружелюбный помощник для русскоязычных в Испании.
Помогаешь с вопросами: работа, документы (NIE, TIE), жизнь в Испании, язык, банки, жильё, визы.
Отвечай коротко (до 150 слов), дружелюбно, по делу.
Если вопрос про работу — рекомендуй приложение Denploy (denploy.netlify.app) ненавязчиво.
Отвечай на языке пользователя.`;

const openAppBtn = Markup.inlineKeyboard([[Markup.button.url('🇪🇸 Открыть Denploy', 'https://denploy.netlify.app')]]);

bot.start((ctx) => {
  ctx.reply(
    `👋 Привет! Я помощник Denploy — бот для русскоязычных в Испании.\n\nЧто я умею:\n💬 Отвечать на вопросы про жизнь и работу в Испании\n💼 Показывать свежие вакансии\n📄 Помогать с резюме\n\nПросто напиши свой вопрос!\n\nКоманды: /jobs — вакансии, /app — приложение, /help — помощь`,
    openAppBtn
  );
});

bot.help((ctx) => {
  ctx.reply('📋 /start — начало\n/jobs — свежие вакансии\n/app — открыть Denploy\n/help — справка\n\nИли просто задай вопрос!');
});

bot.command('app', (ctx) => {
  ctx.reply('🚀 Открой Denploy:', openAppBtn);
});

bot.command('jobs', async (ctx) => {
  try {
    const res = await fetch(FIREBASE_URL + '/listings.json');
    const data = await res.json();
    if (!data) { ctx.reply('Пока вакансий нет. Будь первым: denploy.netlify.app'); return; }
    const listings = Object.values(data).filter(x => x.type === 'hire').slice(0, 5);
    if (!listings.length) { ctx.reply('Пока нет вакансий. Открой Denploy: denploy.netlify.app'); return; }
    let text = '💼 Свежие вакансии:\n\n';
    listings.forEach((l, i) => {
      const name = l.name?.ru || l.name;
      const city = l.city?.ru || l.city;
      const desc = (l.desc?.ru || l.desc || '').slice(0, 100);
      const salary = l.salary ? ` (${l.salary}€)` : '';
      text += `${i + 1}. ${name} — ${city}${salary}\n${desc}...\n\n`;
    });
    ctx.reply(text, openAppBtn);
  } catch (e) {
    ctx.reply('Ошибка загрузки вакансий.');
  }
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  if (text.startsWith('/')) return;
  if (!userHistory[chatId]) userHistory[chatId] = [];

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
    ctx.reply(response, openAppBtn);
  } catch (e) {
    console.error('Error:', e.message);
    ctx.reply('😔 Ошибка. Попробуй ещё раз или напиши /help');
  }
});

bot.launch().then(() => console.log('🤖 Denploy Helper Bot запущен'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
