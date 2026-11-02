require('dotenv').config();
const { Client, GatewayIntentBits, MessageFlags, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// 💾 Где хранить данные.
// На Railway файловая система контейнера стирается при каждом деплое/рестарте,
// поэтому файл должен лежать на подключённом Volume (Railway сам задаёт
// RAILWAY_VOLUME_MOUNT_PATH). Можно переопределить через DATA_DIR.
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const FILE = path.join(DATA_DIR, 'birthdays.json');

if (!process.env.DATA_DIR && !process.env.RAILWAY_VOLUME_MOUNT_PATH && process.env.RAILWAY_ENVIRONMENT) {
  console.warn('⚠️ Volume не подключён! Дни рождения сотрутся при следующем деплое/рестарте.');
}
console.log(`💾 Файл данных: ${FILE}`);

// 👉 ТВОИ ID
const CHANNEL_ID = '1022763494686330940';
const ROLE_ID = '1488529432757932102';
const OWNER_ID = '382985119159418902';

// первый запуск на пустом Volume — начальный список из переменной BIRTHDAYS_SEED (JSON)
if (!fs.existsSync(FILE) && process.env.BIRTHDAYS_SEED) {
  try {
    const seed = JSON.parse(process.env.BIRTHDAYS_SEED);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(seed, null, 2));
    console.log(`🌱 Список ДР загружен из BIRTHDAYS_SEED: ${seed.length} записей`);
  } catch (e) {
    console.log('Ошибка BIRTHDAYS_SEED:', e.message);
  }
}

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
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // пишем во временный файл и переименовываем, чтобы не получить битый JSON при падении
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

// нормализация даты
// принимает ДД-ММ, ДД.ММ, ДД/ММ, а также с годом (ДД.ММ.ГГГГ)
function normalizeDate(date) {
  const m = String(date).trim().match(/^(\d{1,2})[.\-\/](\d{1,2})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
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

  const day = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
  }).format(now);

  const month = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    month: '2-digit',
  }).format(now);

  const year = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
  }).format(now);

  const todayStr = `${day}-${month}`;

  let channel;
  try {
    channel = await client.channels.fetch(CHANNEL_ID);
  } catch (e) {
    console.log('Не могу получить канал для поздравлений:', e.message);
    return;
  }

  for (const user of data) {
    try {
      if (!user.userId || !user.date) continue;

      const member = await channel.guild.members.fetch(user.userId);
      const userDate = normalizeDate(user.date);

      if (userDate === todayStr) {
        if (!member.roles.cache.has(ROLE_ID)) {
          await member.roles.add(ROLE_ID);
        }

        // защита от дублей (с годом, чтобы через год поздравить снова)
        const congratKey = `${todayStr}-${year}`;
        if (user.lastCongratulated === congratKey) continue;

        const embed = new EmbedBuilder()
          .setColor(0xff4fa3)
          .setTitle('🎂 День рождения')
          .setDescription(`Сегодня день рождения у ${member}!`)
          .setThumbnail(member.displayAvatarURL({ size: 256 }))
          .setFooter({ text: channel.guild.name, iconURL: channel.guild.iconURL() ?? undefined })
          .setTimestamp();

        await channel.send({ content: `🎈 ${member}`, embeds: [embed] });

        user.lastCongratulated = congratKey;
        saveData(data);
      } else {
        if (member.roles.cache.has(ROLE_ID)) {
          await member.roles.remove(ROLE_ID);
        }
      }
    } catch (e) {
      console.log(`Ошибка с пользователем ${user.userId}:`, e.message);
    }
  }
}

// 🔥 команды
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // 🎂 birthday
  if (interaction.commandName === 'birthday') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.user.id !== OWNER_ID) {
      return interaction.editReply('🚫 Команда закрыта.\nОбратись к @17kengan06.');
    }

    const targetUser = interaction.options.getUser('user');
    const date = normalizeDate(interaction.options.getString('date'));

    if (!date) {
      return interaction.editReply('❌ Неверная дата. Формат: ДД-ММ или ДД.ММ (например 05.03)');
    }

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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const link = interaction.options.getString('link');
    const targetUser = interaction.options.getUser('user') || interaction.user;

    let data = loadData();
    const user = data.find((u) => u.userId === targetUser.id);

    if (!user) {
      return interaction.editReply('🚫 Пользователь не найден в списке именинников.');
    }

    if (interaction.user.id !== OWNER_ID && interaction.user.id !== targetUser.id) {
      return interaction.editReply('🚫 Ты можешь привязать Steam только себе.');
    }

    if (!isValidSteamLink(link)) {
      return interaction.editReply(
        '❌ Неверная ссылка на Steam.\nПример: https://steamcommunity.com/id/yourname'
      );
    }

    user.steam = link;
    saveData(data);

    await interaction.editReply(`✅ Steam привязан для ${targetUser}`);
  }

  // 🧹 reset-json
  if (interaction.commandName === 'reset-json') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.user.id !== OWNER_ID) {
      return interaction.editReply('🚫 Нет доступа');
    }

    saveData([]);
    console.log('JSON очищен через команду');

    return interaction.editReply('✅ JSON очищен');
  }
});

// 🔥 cron каждые 5 минут (Москва)
cron.schedule(
  '*/5 * * * *',
  async () => {
    try {
      await checkBirthdaysFull();
    } catch (e) {
      console.log('Ошибка проверки ДР:', e);
    }
  },
  {
    timezone: 'Europe/Moscow',
  }
);

// 🔥 запуск
client.once('clientReady', async () => {
  console.log(`🤖 Бот запущен как ${client.user.tag}`);
  const saved = loadData();
  console.log(`📋 В списке ДР: ${saved.length}`);
  for (const u of saved) console.log(`   ${u.userId} → ${u.date}${u.steam ? ' (steam)' : ''}`);
  await checkBirthdaysFull();
});

// Railway при каждом деплое останавливает старый контейнер через SIGTERM —
// выходим чисто, иначе npm пишет ошибку и Railway считает это крашем
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    console.log(`🛑 ${sig}, выключаюсь`);
    await client.destroy();
    process.exit(0);
  });
}

client.login(process.env.TOKEN);
