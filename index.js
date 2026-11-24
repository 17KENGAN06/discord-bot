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

// 🎭 кому бот выдал роль ДР — храним отдельно, чтобы снять её даже если
// человека убрали из списка или JSON очистили через /reset-json
const ROLE_FILE = path.join(DATA_DIR, 'birthday-role.json');

function loadRoleHolders() {
  try {
    if (!fs.existsSync(ROLE_FILE)) return [];
    return JSON.parse(fs.readFileSync(ROLE_FILE, 'utf8'));
  } catch (e) {
    console.log('Ошибка birthday-role.json:', e.message);
    return [];
  }
}

function saveRoleHolders(ids) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${ROLE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify([...new Set(ids)], null, 2));
  fs.renameSync(tmp, ROLE_FILE);
}

// сегодняшняя дата по Москве: { todayStr: 'ДД-ММ', year: 'ГГГГ' }
function moscowToday() {
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date())) {
    parts[p.type] = p.value;
  }
  return { todayStr: `${parts.day}-${parts.month}`, year: parts.year };
}

// ВАЖНО: force: true. Без интента GuildMembers бот не получает обновления
// участников, а members.fetch() без force отдаёт старую копию из кэша —
// в ней роли ДР «нет», и на следующий день она не снималась.
async function fetchMemberFresh(guild, userId) {
  try {
    return await guild.members.fetch({ user: userId, force: true });
  } catch (e) {
    return null; // вышел с сервера или ID неверный
  }
}

// 🔥 проверка ДР
async function checkBirthdaysFull() {
  const data = loadData();
  const { todayStr, year } = moscowToday();

  let channel;
  try {
    channel = await client.channels.fetch(CHANNEL_ID);
  } catch (e) {
    console.log('Не могу получить канал для поздравлений:', e.message);
    return;
  }
  const guild = channel.guild;

  const birthdayToday = new Set(
    data.filter((u) => u.userId && normalizeDate(u.date) === todayStr).map((u) => u.userId)
  );

  // 1) снимаем роль со всех, у кого ДР не сегодня:
  //    и с тех, кто в списке, и с тех, кому бот выдавал роль раньше
  const holders = loadRoleHolders();
  const toCheck = new Set([...data.map((u) => u.userId).filter(Boolean), ...holders]);
  const stillHolding = [];

  for (const userId of toCheck) {
    if (birthdayToday.has(userId)) continue;
    const member = await fetchMemberFresh(guild, userId);
    if (!member) continue;
    if (!member.roles.cache.has(ROLE_ID)) continue;
    try {
      await member.roles.remove(ROLE_ID);
      console.log(`🎭 Роль ДР снята: ${member.user.tag}`);
    } catch (e) {
      console.log(`Не удалось снять роль у ${userId}:`, e.message);
      stillHolding.push(userId);
    }
  }

  // 2) выдаём роль и поздравляем тех, у кого ДР сегодня
  for (const user of data) {
    if (!birthdayToday.has(user.userId)) continue;
    try {
      const member = await fetchMemberFresh(guild, user.userId);
      if (!member) continue;

      if (!member.roles.cache.has(ROLE_ID)) {
        try {
          await member.roles.add(ROLE_ID);
          console.log(`🎭 Роль ДР выдана: ${member.user.tag}`);
        } catch (e) {
          console.log(`Не удалось выдать роль ${user.userId}:`, e.message);
        }
      }
      stillHolding.push(user.userId);

      // защита от дублей (с годом, чтобы через год поздравить снова)
      const congratKey = `${todayStr}-${year}`;
      if (user.lastCongratulated === congratKey) continue;

      const embed = new EmbedBuilder()
        .setColor(0xff4fa3)
        .setTitle('🎂 День рождения')
        .setDescription(`Сегодня день рождения у ${member}!`)
        .setThumbnail(member.displayAvatarURL({ size: 256 }))
        .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined })
        .setTimestamp();

      await channel.send({ content: `🎈 ${member}`, embeds: [embed] });

      user.lastCongratulated = congratKey;
      saveData(data);
    } catch (e) {
      console.log(`Ошибка с пользователем ${user.userId}:`, e.message);
    }
  }

  saveRoleHolders(stillHolding);
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
  for (const u of saved) console.log(`   ${u.userId} → ${u.date}`);
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
