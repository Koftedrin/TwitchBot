const tmi = require("tmi.js");
const axios = require("axios");
const express = require("express");


// --- НАСТРОЙКИ (обновленные) ---
const N8N_CHAT_LISTENER_URL = process.env.N8N_CHAT_LISTENER_URL;
const N8N_TOKEN_PROVIDER_URL = process.env.N8N_TOKEN_PROVIDER_URL;
const N8N_TOKEN_REFRESH_URL = process.env.N8N_TOKEN_REFRESH_URL; // Наш новый вебхук
const TWITCH_CHANNEL = "smaufttv";
const BOT_USERNAME = "smaufttvbot";

let client;

/**
 * Новая функция: заставляет n8n обновить токены прямо сейчас
 */
async function forceTokenRefresh() {
    try {
        console.log("[START] Запрос принудительного обновления токенов в n8n...");
        await axios.post(N8N_TOKEN_REFRESH_URL);
        console.log("[OK] n8n подтвердил обновление токенов.");
        // Даем n8n 3 секунды, чтобы успеть записать данные в Google Sheets
        await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
        console.error("[ОШИБКА] n8n не смог обновить токены при старте:", error.message);
    }
}

async function getFreshToken() {
    try {
        const response = await axios.get(N8N_TOKEN_PROVIDER_URL);
        console.log("[OK] Получен свежий токен от n8n.");
        return response.data;
    } catch (error) {
        console.error("[ОШИБКА] Не удалось получить токен от n8n:", error.message);
        return null;
    }
}

async function startBot() {
    if (client && client.readyState() === "OPEN") return;

    // ПЕРЕД ПОДКЛЮЧЕНИЕМ: заставляем n8n обновить токен
    await forceTokenRefresh();

    const token = await getFreshToken();
    if (!token) {
        console.log("Не удалось запустить бота без токена. Повтор через 1 минуту.");
        setTimeout(startBot, 60000);
        return;
    }

    client = new tmi.Client({
        identity: {
            username: BOT_USERNAME,
            password: `oauth:${token}`,
        },
        channels: [TWITCH_CHANNEL],
    });

    client.on("connected", () => {
        console.log(`[OK] Бот ${BOT_USERNAME} успешно подключен к чату.`);
    });

    client.on("disconnected", (reason) => {
        console.error(`[ОШИБКА] Бот отключен: ${reason}. Переподключение...`);
        setTimeout(startBot, 10000);
    });

    client.on("message", (channel, tags, message, self) => {
        if (self) return;
        const messageData = {
            platform: "twitch",
            user: tags["display-name"],
            username: tags["username"],
            text: message,
        };
        axios.post(N8N_CHAT_LISTENER_URL, messageData)
             .catch(err => console.error("[ОШИБКА] Ошибка n8n чат-листенер:", err.message));
    });

    client.connect().catch((error) => {
        console.error(`[КРИТИЧЕСКАЯ ОШИБКА] Не удалось подключиться:`, error);
    });
}

// --- ВЕБ-СЕРВЕР ДЛЯ RENDER ---
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Twitch Bot is alive and refreshed!'));

app.listen(port, () => {
    console.log(`[INFO] Web server запущен на порту ${port}.`);
});

// ЗАПУСК
startBot();
