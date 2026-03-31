require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const FILE = './birthdays.json';

// 👉 ID
const CHANNEL_ID = '1469998226911395950';
const ROLE_ID = '1488436026815942676';
const OWNER_ID = '382985119159418902';

const CLIENT_ID = '1488426543389610057';
const GUILD_ID = '1469998225812357154';

// загрузка
function loadData() {
  try {
    if (!fs.existsSync(FILE)) return [];
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    console.log('Ошибка JSON:', e);
    return [];
  }
}

// сохранение
function saveData(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// нормализация даты
function normalizeDate(date) {
  const [day, month] = date.replace('.', '-').split('-');
  return `${day.padStart(2, '0')}-${month.padStart(2, '0')}`;
}

// проверка Steam
function isValidSteamLink(link) {
  try {
    const url = new URL(link);
    return (
      url.hostname === 'steamcommunity.com' &&
      (url.pathname.startsWith('/id/') || url.pathname.startsWith('/profiles/'))
    );
  } catch {
    return false;
  }
}

// 🔥 проверка ДР
async function checkBirthdaysFull() {
  const data = loadData();
  const now = new Date();

  const day = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
  }).format(now);

  const month = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    month: '2-digit',
  }).format(now);

  const todayStr = `${day}-${month}`;

  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel || !channel.guild) return;

  for (const user of data) {
    try {
      const member = await channel.guild.members.fetch(user.userId);
      const userDate = normalizeDate(user.date);

      if (userDate === todayStr) {
        if (!member.roles.cache.has(ROLE_ID)) {
          await member.roles.add(ROLE_ID);

          let message = `🎉 ${member}, с днём рождения! 🎂\n`;

          if (user.steam) {
            message += `🎁 Steam: ${user.steam}`;
          }

          await channel.send(message);
        }
      } else {
        if (member.roles.cache.has(ROLE_ID)) {
          await member.roles.remove(ROLE_ID);
        }
      }
    } catch {}
  }
}

// 🔥 команды
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // birthday
  if (interaction.commandName === 'birthday') {
    await interaction.deferReply({ ephemeral: true });

    if (interaction.user.id !== OWNER_ID) {
      return interaction.editReply('🚫 Только для админа');
    }

    const targetUser = interaction.options.getUser('user');
    const date = interaction.options.getString('date');

    let data = loadData();
    const existing = data.find((u) => u.userId === targetUser.id);

    if (existing) {
      existing.date = date;
    } else {
      data.push({ userId: targetUser.id, date });
    }

    saveData(data);
    await interaction.editReply(`✅ ${targetUser} → ${date}`);
  }

  // список
  if (interaction.commandName === 'birth-list') {
    const data = loadData();

    if (!data.length) return interaction.reply('📭 Пусто');

    const text = data.map((u) => `<@${u.userId}> - ${u.date}`).join('\n');
    await interaction.reply(`🎂 Список:\n${text}`);
  }

  // steam
  if (interaction.commandName === 'connect-steam') {
    await interaction.deferReply({ ephemeral: true });

    const link = interaction.options.getString('link');
    const targetUser = interaction.options.getUser('user') || interaction.user;

    if (!isValidSteamLink(link)) {
      return interaction.editReply('❌ Неверная ссылка');
    }

    let data = loadData();
    let user = data.find((u) => u.userId === targetUser.id);

    if (!user) {
      user = { userId: targetUser.id };
      data.push(user);
    }

    user.steam = link;
    saveData(data);

    await interaction.editReply(`✅ Steam привязан для ${targetUser}`);
  }
});

// 🔥 CRON (Москва)
cron.schedule(
  '0 9 * * *',
  async () => {
    await checkBirthdaysFull();
  },
  {
    timezone: 'Europe/Moscow',
  }
);

// 🚀 запуск
client.once('ready', async () => {
  console.log(`🤖 Бот запущен как ${client.user.tag}`);

  // 🔥 деплой команд
  const commands = [
    new SlashCommandBuilder()
      .setName('birthday')
      .setDescription('Установить дату рождения')
      .addUserOption((o) => o.setName('user').setDescription('Пользователь').setRequired(true))
      .addStringOption((o) => o.setName('date').setDescription('ДД-ММ').setRequired(true)),

    new SlashCommandBuilder().setName('birth-list').setDescription('Список дней рождения'),

    new SlashCommandBuilder()
      .setName('connect-steam')
      .setDescription('Привязать Steam')
      .addStringOption((o) => o.setName('link').setDescription('Ссылка').setRequired(true))
      .addUserOption((o) => o.setName('user').setDescription('Кому').setRequired(false)),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Slash команды загружены');
  } catch (err) {
    console.error(err);
  }

  await checkBirthdaysFull();
});

client.login(process.env.TOKEN);
