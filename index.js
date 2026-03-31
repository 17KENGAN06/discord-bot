client.once('ready', async () => {
  console.log(`🤖 Бот запущен как ${client.user.tag}`);

  const { REST, Routes, SlashCommandBuilder } = require('discord.js');

  const commands = [new SlashCommandBuilder().setName('test123').setDescription('test')].map((c) =>
    c.toJSON()
  );

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

  console.log('✅ команды отправлены');
});
