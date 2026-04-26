const tmi = require("tmi.js");
const axios = require("axios");
const express = require("express");

// --- НАСТРОЙКИ ---
const N8N_CHAT_LISTENER_URL = process.env.N8N_CHAT_LISTENER_URL;
const N8N_TOKEN_PROVIDER_URL = process.env.N8N_TOKEN_PROVIDER_URL;
const N8N_TOKEN_REFRESH_URL = process.env.N8N_TOKEN_REFRESH_URL;
const TWITCH_CHANNEL = "smaufttv";
const BOT_USERNAME = "smaufttvbot";

let client;

// Заголовок для обхода рекламы ngrok
const ngrokHeaders = { headers: { 'ngrok-skip-browser-warning': 'any' } };

/**
 * Заставляет n8n обновить токены
 */
async function forceTokenRefresh() {
    try {
        console.log("[START] Запрос обновления токенов в n8n...");
        await axios.post(N8N_TOKEN_REFRESH_URL, {}, ngrokHeaders);
        console.log("[OK] n8n подтвердил обновление.");
        await new Promise(resolve => setTimeout(resolve, 5000)); // Ждем 5 сек для записи в таблицу
    } catch (error) {
        console.error("[!] Ошибка при форсированном обновлении:", error.message);
        // Не бросаем ошибку, чтобы код шел дальше к попытке получить токен
    }
}

/**
 * Получает токен из n8n
 */
async function getFreshToken() {
    try {
        const response = await axios.get(N8N_TOKEN_PROVIDER_URL, ngrokHeaders);
        if (response.data && typeof response.data === 'string' && response.data.length > 5) {
            console.log("[OK] Токен получен.");
            return response.data;
        }
        console.error("[!] n8n вернул пустой или неверный токен.");
        return null;
    } catch (error) {
        console.error("[!] Ошибка получения токена из n8n:", error.message);
        return null;
    }
}

async function startBot() {
    console.log("--- Запуск цикла startBot ---");
    
    // 1. Пытаемся обновить
    await forceTokenRefresh();

    // 2. Пытаемся взять токен
    const token = await getFreshToken();

    if (!token) {
        console.log("Ждем 1 минуту перед следующей попыткой...");
        setTimeout(startBot, 60000);
        return;
    }

    // 3. Если клиент уже был, отключаем его перед созданием нового
    if (client) {
        try { await client.disconnect(); } catch(e) {}
    }

    client = new tmi.Client({
        identity: {
            username: BOT_USERNAME,
            password: `oauth:${token}`,
        },
        channels: [TWITCH_CHANNEL],
    });

    client.on("connected", () => {
        console.log(`✅ Бот ${BOT_USERNAME} в чате!`);
    });

    client.on("disconnected", (reason) => {
        console.error(`❌ Бот отключен: ${reason}. Перезапуск через 10 сек...`);
        setTimeout(startBot, 10000);
    });

    client.on("message", (channel, tags, message, self) => {
        if (self) return;
        axios.post(N8N_CHAT_LISTENER_URL, {
            platform: "twitch",
            user: tags["display-name"],
            username: tags["username"],
            text: message,
        }, ngrokHeaders).catch(err => console.error("Ошибка n8n listener:", err.message));
    });

    client.connect().catch((error) => {
        console.error(`❌ Ошибка коннекта к Twitch:`, error.message);
        setTimeout(startBot, 60000);
    });
}

// --- ВЕБ-СЕРВЕР ---
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Twitch Bot Status: Running'));
app.listen(port, () => {
    console.log(`[INFO] Web server на порту ${port}.`);
    startBot();
});
