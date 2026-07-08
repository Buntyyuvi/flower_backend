const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendOrderNotification(order) {
  const itemsList = order.items.map((item, i) =>
    `${i + 1}. ${item.title} × ${item.quantity} — ${item.price}`
  ).join('\n');

  const message = `
🆕 New Order Received!

👤 Name: ${order.name}
📞 Phone: ${order.phone}
📧 Email: ${order.email}
📍 Address: ${order.address}

🛒 Items:
${itemsList}

💰 Total: ₹${Number(order.total).toLocaleString()}
🕐 Time: ${new Date(order.createdAt).toLocaleString()}
  `.trim();

  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });
    const data = await res.json();
    if (!data.ok) console.error('Telegram send failed:', data);
  } catch (error) {
    console.error('Telegram notification error:', error);
  }
}

module.exports = { sendOrderNotification };
