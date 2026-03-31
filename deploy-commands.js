require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const CLIENT_ID = '1488426543389610057';

const commands = [
  // 🎂 Установка даты
  new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Установить дату рождения')
    .addUserOption((option) =>
      option.setName('user').setDescription('Кому установить').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('date').setDescription('Формат: ДД-ММ или ДД.ММ').setRequired(true)
    ),

  // 📋 Список
  new SlashCommandBuilder().setName('birth-list').setDescription('Показать список дней рождения'),

  // 🎮 Steam
  new SlashCommandBuilder()
    .setName('connect-steam')
    .setDescription('Привязать Steam аккаунт')
    .addStringOption((option) =>
      option.setName('link').setDescription('Ссылка на Steam профиль').setRequired(true)
    )
    .addUserOption((option) =>
      option.setName('user').setDescription('Кому привязать (если ты админ)').setRequired(false)
    ),

  // 🧹 reset-json
  new SlashCommandBuilder()
    .setName('reset-json')
    .setDescription('Очистить JSON (только для админа)'),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('🚀 Регистрирую команды...');

    await rest.put(
      Routes.applicationCommands(CLIENT_ID), // глобальные команды
      { body: commands }
    );

    console.log('✅ Команды зарегистрированы');
  } catch (error) {
    console.error('❌ Ошибка регистрации:', error);
  }
})();
