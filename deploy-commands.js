require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// 🔑 ID
const CLIENT_ID = '1488426543389610057'; // твой Application ID
const GUILD_ID = '1469998225812357154'; // твой сервер

// 📦 команды
const commands = [
  // 🎂 birthday
  new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Установить дату рождения')
    .addUserOption((option) =>
      option.setName('user').setDescription('Кому установить').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('date').setDescription('Формат: ДД-ММ').setRequired(true)
    ),

  // 📋 список
  new SlashCommandBuilder().setName('birth-list').setDescription('Показать список дней рождения'),

  // 🎮 Steam
  new SlashCommandBuilder()
    .setName('connect-steam')
    .setDescription('Привязать Steam аккаунт')
    .addStringOption((option) =>
      option
        .setName('link')
        .setDescription('Ссылка на Steam профиль (https://steamcommunity.com/...)')
        .setRequired(true)
    )
    .addUserOption((option) =>
      option.setName('user').setDescription('Кому привязать (если ты админ)').setRequired(false)
    ),
].map((cmd) => cmd.toJSON());

// 🚀 регистрация
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('🚀 Регистрирую команды...');

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });

    console.log('✅ Команды зарегистрированы мгновенно');
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
})();
