require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');

const CLIENT_ID = '1488426543389610057';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// 🚀 запуск
client.once('ready', async () => {
  console.log(`🤖 Бот запущен как ${client.user.tag}`);

  // команды
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

    // 🔥 тест (обязательно оставить временно)
    new SlashCommandBuilder().setName('test123').setDescription('test'),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    // 🧹 сначала очищаем
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log('🧹 Команды очищены');

    // ⏳ маленькая пауза
    await new Promise((r) => setTimeout(r, 2000));

    // 🚀 загружаем заново
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

    console.log('✅ Глобальные команды загружены');
  } catch (err) {
    console.error(err);
  }
});

// 🔥 обработка
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'test123') {
    await interaction.reply('работает');
  }

  if (interaction.commandName === 'birthday') {
    await interaction.reply('ок');
  }

  if (interaction.commandName === 'birth-list') {
    await interaction.reply('список');
  }

  if (interaction.commandName === 'connect-steam') {
    await interaction.reply('steam');
  }
});

client.login(process.env.TOKEN);
