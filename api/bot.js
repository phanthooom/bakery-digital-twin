export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).json({ ok: true, bot: 'trendbakery_app' });
    return;
  }

  const token = process.env.TWIN_BOT_TOKEN || '8882073858:AAG2zWC58CXJ3Fv_ysMqfMDqnhR4wEAf4Zo';
  const body = req.body || {};
  const msg = body.message;

  if (msg && msg.chat && msg.chat.id) {
    const chatId = msg.chat.id;
    const firstName = msg.from?.first_name || 'Гость';

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        parse_mode: 'HTML',
        text:
          `👋 Привет, <b>${firstName}</b>!\n\n` +
          `Добро пожаловать в <b>Trend Bakery 3D</b> — цифровой двойник пекарни в реальном времени.\n\n` +
          `🔹 <b>3D-цех (1 и 2 этажи)</b>: печи MIWE, тестомесы, расстойка, силосы муки и рампа отгрузки\n` +
          `🔹 <b>Живые заказы</b>: отслеживание заказов из Telegram по 4 этапам производства\n` +
          `🔹 <b>Телеметрия и ИИ</b>: мощность, баланс фаз, климат камер, учёт газа и склад по FEFO\n\n` +
          `Нажмите кнопку ниже, чтобы открыть 3D-цех:`,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🏭 Открыть 3D Цех',
                web_app: { url: 'https://bakery-digital-twin.vercel.app' },
              },
            ],
            [
              {
                text: '🔥 Печь 1 · Мониторинг заказов',
                web_app: { url: 'https://bakery-digital-twin.vercel.app/?eq=oven-1' },
              },
            ],
          ],
        },
      }),
    }).catch(() => {});
  }

  res.status(200).json({ ok: true });
}
