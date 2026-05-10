const tmi = require("tmi.js");
const axios = require("axios");
const express = require("express");

const N8N_CHAT_LISTENER_URL = process.env.N8N_CHAT_LISTENER_URL;
const N8N_TOKEN_PROVIDER_URL = process.env.N8N_TOKEN_PROVIDER_URL;
const N8N_TOKEN_REFRESH_URL = process.env.N8N_TOKEN_REFRESH_URL;
const TWITCH_CHANNEL = "smaufttv";
const BOT_USERNAME = "smaufttvbot";

let client;
const bypassHeaders = { headers: { 'ngrok-skip-browser-warning': 'any' } };

async function forceTokenRefresh() {
    try {
        console.log("[1/3] Обновление ключей в n8n...");
        await axios.post(N8N_TOKEN_REFRESH_URL, {}, bypassHeaders);
        console.log("[OK] Ключи обновлены.");
        await new Promise(resolve => setTimeout(resolve, 3000)); // Короткая пауза
    } catch (e) { 
        console.error("[!] n8n refresh failed (проверь, включен ли ngrok/n8n)"); 
    }
}

async function getFreshToken() {
    try {
        console.log("[2/3] Получение токена из n8n...");
        const res = await axios.get(N8N_TOKEN_PROVIDER_URL, bypassHeaders);
        const token = (res.data && res.data.length > 5) ? res.data : null;
        return token;
    } catch (e) { return null; }
}

async function startBot() {
    console.log("--- Запуск цикла авторизации ---");
    await forceTokenRefresh();
    const token = await getFreshToken();

    if (!token) {
        console.log("[3/3] ОШИБКА: Токен не получен.");
        console.log("[-] Бот уходит в режим ожидания. Следующая попытка — через 10 минут (по сигналу UptimeRobot).");
        return;
    }

    console.log("[3/3] Токен получен. Подключение к Twitch...");

    client = new tmi.Client({
        identity: { username: BOT_USERNAME, password: `oauth:${token}` },
        channels: [TWITCH_CHANNEL],
    });

    // Добавил лог успешного подключения!
    client.on("connected", (address, port) => {
        console.log(`✅ ПОБЕДА: Бот ${BOT_USERNAME} успешно зашел в чат ${TWITCH_CHANNEL}!`);
    });

    client.on("message", (channel, tags, message, self) => {
        if (self) return;
        axios.post(N8N_CHAT_LISTENER_URL, {
            platform: "twitch", user: tags["display-name"], text: message,
        }, bypassHeaders).catch(() => {});
    });

    client.connect().catch((err) => {
        console.error("❌ Ошибка Twitch:", err);
    });
}

const app = express();
app.get('/', (req, res) => res.send('Twitch Bot is Waiting for UptimeRobot'));
app.listen(process.env.PORT || 10000, () => {
    console.log("--- СЕРВЕР ЗАПУЩЕН ---");
    startBot();
});
