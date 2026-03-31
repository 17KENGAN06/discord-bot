const { REST, Routes } = require('discord.js');

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });

console.log('🧹 Все команды удалены');
