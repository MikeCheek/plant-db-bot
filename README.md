# 🌿 Plant Database Telegram Bot

A robust, TypeScript-based Telegram bot for managing a local image database of plant species. Optimized for Termux and home server environments.

---

## ✨ Features

- **📂 Automatic Organization**: Saves photos into species-specific folders.
- **🔐 Admin Sessions**: Actions like adding species or uploading photos are protected by a password defined in `.env`.
- **🕒 Persistent Auth**: Once authenticated, the session remains open for 30 minutes (configurable).
- **🎲 Randomizer**: Quickly pull a random image from any species folder.
- **📊 Live Stats**: View species list and image counts with auto-refreshing inline buttons.

---

## 🛠️ Installation

### 1. Clone & Install
```bash
cd plant-db-bot
npm install
```

2. Environment Setup
Create a .env file in the root directory:

```bash
BOT_TOKEN=your_telegram_bot_token
BOT_PASSWORD=your_secure_password
ADMIN_TIMEOUT=30
```

3. Configuration
Ensure your package.json includes "type": "module" and your tsconfig.json is set to NodeNext module resolution.

## 🚀 Usage
### Development

```bash
npx ts-node --esm bot.ts
```

### Production (PM2)
```bash
pm2 start "npx ts-node --esm bot.ts" --name "plant-bot"
```

## 📱 Commands

/start - Open the main interaction menu.

/list - Display all species and their current photo counts.

/random - Select a species to view a random photo from its folder.

/add_species - (Admin) Create a new species category and directory.

/upload - (Admin) Start an upload session for a specific plant.

/logout - End your current admin session immediately.

/cancel - Abort the current operation and return to the main menu.

## 📂 Structure

```text
plant-db-bot/
├── storage/           # Physical image storage
│   ├── Rose/          # .jpg files for Roses
│   └── Fern/          # .jpg files for Ferns
├── bot.ts             # Main application logic
├── plants.json        # Species metadata (JSON DB)
├── .env               # Secrets (Git ignored)
└── tsconfig.json      # TypeScript configuration
```

## 🛡️ Security
Passwords are deleted from chat history immediately after entry.

Admin sessions expire automatically to prevent unauthorized access from your device.

All file operations use fs-extra for safe directory handling.