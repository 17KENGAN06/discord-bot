require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const FILE = './birthdays.json';

// 👉 ТВОИ ID
const CHANNEL_ID = '1469998226911395950';
const ROLE_ID = '1488436026815942676';
const OWNER_ID = '382985119159418902';

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
  return date.replace('.', '-');
}

// проверка Steam
function isValidSteamLink(link) {
  try {
    const url = new URL(link);

    if (url.hostname !== 'steamcommunity.com') return false;

    if (url.pathname.startsWith('/id/') || url.pathname.startsWith('/profiles/')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// 🔥 проверка ДР
async function checkBirthdaysFull() {
  const data = loadData();
  const now = new Date();

  const moscowTime = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);

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

  for (const user of data) {
    try {
      const member = await channel.guild.members.fetch(user.userId);
      const userDate = normalizeDate(user.date);

      if (userDate === todayStr) {
        if (!member.roles.cache.has(ROLE_ID)) {
          await member.roles.add(ROLE_ID);

          let message = `⏰ Сейчас по Москве ${moscowTime}\n🎉 ${member}, у тебя сегодня день рождения! Поздравляем! 🎂\n`;

          if (user.steam) {
            message += `🎁 Вот ссылочка на Steam именинника: ${user.steam}\nМожете порадовать подарком именинника 😉`;
          } else {
            message += `😢 Именинник не указал, к сожалению, ссылку на свой Steam`;
          }

          await channel.send(message);
        }
      } else {
        if (member.roles.cache.has(ROLE_ID)) {
          await member.roles.remove(ROLE_ID);
        }
      }
    } catch (e) {
      console.log('Ошибка:', e);
    }
  }
}

// 🔥 команды
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // 🎂 birthday
  if (interaction.commandName === 'birthday') {
    await interaction.deferReply({ ephemeral: true });

    if (interaction.user.id !== OWNER_ID) {
      return interaction.editReply('🚫 Команда закрыта.\nОбратись к @17kengan06.');
    }

    const targetUser = interaction.options.getUser('user');
    const date = interaction.options.getString('date');

    let data = loadData();
    const existing = data.find((u) => u.userId === targetUser.id);

    if (existing) {
      existing.date = date;
    } else {
      data.push({
        userId: targetUser.id,
        date,
      });
    }

    saveData(data);
    await checkBirthdaysFull();

    await interaction.editReply(`✅ Установлено: ${targetUser} → ${date}`);
  }

  // 📋 список
  if (interaction.commandName === 'birth-list') {
    const data = loadData();

    if (data.length === 0) {
      return interaction.reply('📭 Список пуст.');
    }

    let text = '🎂 **Актуальный список ДР:**\n\n';

    for (const user of data) {
      text += `<@${user.userId}> - ${user.date}\n`;
    }

    await interaction.reply(text);
  }

  // 🎮 connect-steam
  if (interaction.commandName === 'connect-steam') {
    await interaction.deferReply({ ephemeral: true });

    const link = interaction.options.getString('link');
    const targetUser = interaction.options.getUser('user') || interaction.user;

    let data = loadData();
    const user = data.find((u) => u.userId === targetUser.id);

    // ❌ нет в списке
    if (!user) {
      return interaction.editReply('🚫 Пользователь не найден в списке именинников.');
    }

    // ❌ не админ и не сам
    if (interaction.user.id !== OWNER_ID && interaction.user.id !== targetUser.id) {
      return interaction.editReply('🚫 Ты можешь привязать Steam только себе.');
    }

    // ❌ плохая ссылка
    if (!isValidSteamLink(link)) {
      return interaction.editReply(
        '❌ Неверная ссылка на Steam.\nПример: https://steamcommunity.com/id/yourname'
      );
    }

    // ✅ сохраняем
    user.steam = link;
    saveData(data);

    await interaction.editReply(`✅ Steam привязан для ${targetUser}`);
  }
});

// 🔥 cron
cron.schedule('0 9 * * *', async () => {
  await checkBirthdaysFull();
});

// 🔥 запуск
client.once('ready', async () => {
  console.log(`🤖 Бот запущен как ${client.user.tag}`);
  await checkBirthdaysFull();
});

client.login(process.env.TOKEN);
