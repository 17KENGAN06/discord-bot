await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });

console.log('🧹 Все команды удалены');
