import { Telegraf, Context, session, Markup } from 'telegraf';
import fse from 'fs-extra';
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_PASSWORD = process.env.BOT_PASSWORD || 'admin123';
const TIMEOUT_MINUTES = parseInt(process.env.ADMIN_TIMEOUT || '30');
const STORAGE_PATH = path.join(__dirname, 'storage');
const DB_FILE = path.join(__dirname, 'plants.json');

fse.ensureDirSync(STORAGE_PATH);
if (!fs.existsSync(DB_FILE)) fse.writeJsonSync(DB_FILE, {});

interface MySession {
    waitingFor?: 'NEW_SPECIES' | 'UPLOAD_TO' | 'RANDOM_PICK' | 'PASSWORD' | undefined;
    targetSpecies?: string | undefined;
    nextStep?: 'NEW_SPECIES' | 'UPLOAD_TO' | undefined;
    authenticatedUntil?: number | undefined; // Timestamp for session expiry
}

interface MyContext extends Context {
    session: MySession;
}

const bot = new Telegraf<MyContext>(BOT_TOKEN);

bot.use(session({
    defaultSession: (): MySession => ({})
}));

// --- Helpers ---
const escapeMarkdown = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');

const getPlantStats = () => {
    const data = fse.readJsonSync(DB_FILE);
    const species = Object.keys(data);
    if (species.length === 0) return "No species in database yet.";
    return species.map(s => {
        const folder = path.join(STORAGE_PATH, s);
        const count = fs.existsSync(folder) ? fs.readdirSync(folder).length : 0;
        return `🌿 *${s}*: ${count} images`;
    }).join('\n');
};

// Check if user is currently an admin
const isAdmin = (ctx: MyContext) => {
    if (!ctx.session.authenticatedUntil) return false;
    return Date.now() < ctx.session.authenticatedUntil;
};

// Middleware-style check to start auth flow
const ensureAdmin = (ctx: MyContext, nextStep: 'NEW_SPECIES' | 'UPLOAD_TO') => {
    if (isAdmin(ctx)) {
        // Already authenticated, proceed to the requested step
        ctx.session.waitingFor = nextStep;
        if (nextStep === 'NEW_SPECIES') {
            return ctx.reply('Enter the name of the new plant species:');
        } else {
            const species = Object.keys(fse.readJsonSync(DB_FILE));
            return ctx.reply('Select a species to upload to:', Markup.keyboard(species, { columns: 2 }).resize());
        }
    }
    // Need password
    ctx.session.waitingFor = 'PASSWORD';
    ctx.session.nextStep = nextStep;
    return ctx.reply('🔐 Admin session required. Please enter the password:', Markup.removeKeyboard());
};

// --- Initialization ---
bot.telegram.setMyCommands([
    { command: 'list', description: '🌿 View all plant species' },
    { command: 'random', description: '🎲 Get a random photo' },
    { command: 'add_species', description: '➕ Create new species' },
    { command: 'upload', description: '📷 Upload photos' },
    { command: 'logout', description: '🔓 End admin session' },
    { command: 'cancel', description: '❌ Cancel action' }
]);

// --- Command Handlers ---

bot.start((ctx) => {
    ctx.reply('Welcome! Use the menu below to manage the plant database.', Markup.keyboard([
        ['🌿 List Species', '📷 Upload'],
        ['🎲 Random Photo', '➕ Add New'],
        ['❌ Cancel', '🔓 Logout']
    ]).resize());
});

bot.command('logout', (ctx) => {
    ctx.session.authenticatedUntil = undefined;
    ctx.reply('Admin session ended.', Markup.removeKeyboard());
});

bot.command('cancel', (ctx) => {
    ctx.session.waitingFor = undefined;
    ctx.session.nextStep = undefined;
    ctx.reply('Action cancelled.', Markup.keyboard([['🌿 List Species', '📷 Upload'], ['🎲 Random Photo', '➕ Add New']]).resize());
});

bot.command('list', (ctx) => {
    ctx.replyWithMarkdownV2(escapeMarkdown(getPlantStats()), 
        Markup.inlineKeyboard([[Markup.button.callback('🔄 Refresh', 'refresh_list')]]));
});

bot.command('add_species', (ctx) => ensureAdmin(ctx, 'NEW_SPECIES'));
bot.command('upload', (ctx) => ensureAdmin(ctx, 'UPLOAD_TO'));

bot.command('random', (ctx) => {
    const species = Object.keys(fse.readJsonSync(DB_FILE));
    if (species.length === 0) return ctx.reply('DB is empty.');
    ctx.session.waitingFor = 'RANDOM_PICK';
    ctx.reply('Pick a species:', Markup.keyboard(species, { columns: 2 }).resize());
});

// --- Logic Handlers ---

bot.on('text', async (ctx) => {
    const text = ctx.message.text;

    // Handle Password Verification
    if (ctx.session.waitingFor === 'PASSWORD') {
        if (text === ADMIN_PASSWORD) {
            // Set session expiry (e.g., 30 mins from now)
            ctx.session.authenticatedUntil = Date.now() + (TIMEOUT_MINUTES * 60 * 1000);
            const next = ctx.session.nextStep;
            ctx.session.nextStep = undefined;
            ctx.deleteMessage().catch(() => {}); // Security: remove password from chat
            
            ctx.reply(`✅ Authenticated for ${TIMEOUT_MINUTES} minutes.`);
            return ensureAdmin(ctx, next!); 
        } else {
            return ctx.reply('❌ Wrong password. Try again or /cancel.');
        }
    }

    // Handle Global Menu Buttons
    if (text === '🌿 List Species') return ctx.replyWithMarkdownV2(escapeMarkdown(getPlantStats()));
    if (text === '📷 Upload') return ensureAdmin(ctx, 'UPLOAD_TO');
    if (text === '➕ Add New') return ensureAdmin(ctx, 'NEW_SPECIES');
    if (text === '🔓 Logout') {
        ctx.session.authenticatedUntil = undefined;
        return ctx.reply('Logged out.', Markup.removeKeyboard());
    }
    if (text === '🎲 Random Photo') {
        const species = Object.keys(fse.readJsonSync(DB_FILE));
        ctx.session.waitingFor = 'RANDOM_PICK';
        return ctx.reply('Pick a species:', Markup.keyboard(species, { columns: 2 }).resize());
    }

    // Handle Logic States
    if (ctx.session.waitingFor === 'NEW_SPECIES') {
        const speciesDir = path.join(STORAGE_PATH, text);
        if (await fse.pathExists(speciesDir)) return ctx.reply('Already exists!');
        await fse.ensureDir(speciesDir);
        const data = fse.readJsonSync(DB_FILE);
        data[text] = { createdAt: new Date() };
        fse.writeJsonSync(DB_FILE, data);
        ctx.session.waitingFor = undefined;
        ctx.reply(`✅ Added "${text}"`, Markup.keyboard([['🌿 List Species', '📷 Upload'], ['🎲 Random Photo', '➕ Add New']]).resize());
    } 
    else if (ctx.session.waitingFor === 'UPLOAD_TO') {
        if (fse.readJsonSync(DB_FILE)[text]) {
            ctx.session.targetSpecies = text;
            ctx.session.waitingFor = undefined;
            ctx.reply(`Ready for "${text}". Send photos, then /done.`, Markup.keyboard([['/done']]).resize());
        }
    }
    else if (ctx.session.waitingFor === 'RANDOM_PICK') {
        const folder = path.join(STORAGE_PATH, text);
        const files = fs.existsSync(folder) ? fs.readdirSync(folder) : [];
        if (files.length === 0) return ctx.reply('No images found.');
        const file = files[Math.floor(Math.random() * files.length)];
        await ctx.replyWithPhoto({ source: path.join(folder, file!) }, { caption: `Random ${text}` });
        ctx.session.waitingFor = undefined;
    }
});

bot.on('photo', async (ctx) => {
    if (!ctx.session.targetSpecies) return;
    const photo = ctx.message.photo.pop();
    if (!photo) return;
    const fileLink = await bot.telegram.getFileLink(photo.file_id);
    const dest = path.join(STORAGE_PATH, ctx.session.targetSpecies, `${Date.now()}.jpg`);
    const buffer = Buffer.from(await (await fetch(fileLink.href)).arrayBuffer());
    await fse.writeFile(dest, buffer);
    ctx.reply('📷 Saved! Send more or /done.');
});

bot.command('done', (ctx) => {
    ctx.session.targetSpecies = undefined;
    ctx.reply('Finished.', Markup.keyboard([['🌿 List Species', '📷 Upload'], ['🎲 Random Photo', '➕ Add New']]).resize());
});

bot.action('refresh_list', (ctx) => {
    ctx.editMessageText(escapeMarkdown(getPlantStats()), { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Refresh', 'refresh_list')]]) }).catch(() => {});
    ctx.answerCbQuery();
});

bot.launch().then(() => console.log('Bot running with Admin Sessions.'));
