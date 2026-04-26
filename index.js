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
        console.log("[START] Попытка обновить токен...");
        await axios.post(N8N_TOKEN_REFRESH_URL, {}, bypassHeaders);
    } catch (e) { console.error("[!] n8n refresh failed"); }
}

async function getFreshToken() {
    try {
        const res = await axios.get(N8N_TOKEN_PROVIDER_URL, bypassHeaders);
        return (res.data && res.data.length > 5) ? res.data : null;
    } catch (e) { return null; }
}

async function startBot() {
    console.log("--- Одиночная попытка запуска ---");
    await forceTokenRefresh();
    const token = await getFreshToken();

    if (!token) {
        console.log("[-] Токена нет. Я спать.");
        return; // НИКАКИХ SETTIMEOUT, БОТ ПРОСТО ОСТАНАВЛИВАЕТСЯ
    }

    client = new tmi.Client({
        identity: { username: BOT_USERNAME, password: `oauth:${token}` },
        channels: [TWITCH_CHANNEL],
    });

    client.on("message", (channel, tags, message, self) => {
        if (self) return;
        axios.post(N8N_CHAT_LISTENER_URL, {
            platform: "twitch", user: tags["display-name"], text: message,
        }, bypassHeaders).catch(() => {});
    });

    client.connect().catch(() => console.error("Twitch connection failed"));
}

const app = express();
app.get('/', (req, res) => res.send('Twitch Bot is Waiting'));
app.listen(process.env.PORT || 10000, () => {
    console.log("Web Server OK.");
    startBot(); // Пробует ОДИН РАЗ при старте/просыпании
});
