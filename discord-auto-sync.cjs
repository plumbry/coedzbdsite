require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fetch = global.fetch;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(process.env.SERVER_ID || process.env.DISCORD_SERVER_ID);
    await guild.members.fetch();

    console.log(`📊 Found ${guild.members.cache.size} members to sync\n`);

    let successCount = 0;
    let failCount = 0;
    const syncedDiscordIds = [];

    for (const [, member] of guild.members.cache) {
      // Skip bots
      if (member.user.bot) continue;

      // Get roles with names
      const roles = member.roles.cache
        .filter(role => role.name !== '@everyone')
        .map(role => ({
          id: role.id,
          name: role.name,
        }));

      // Backend expects these field names
      const payload = {
        id: member.user.id,
        username: member.user.username,
        nickname: member.nickname || null,
        joined_at: member.joinedTimestamp ? new Date(member.joinedTimestamp).toISOString() : null,
        roles: roles.length > 0 ? roles : null,
      };

      try {
        const res = await fetch(process.env.API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.API_KEY}`
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          console.log(`✅ Synced: ${payload.username} (joined ${payload.joined_at})`);
          successCount++;
          syncedDiscordIds.push(member.user.id);
        } else {
          const errorText = await res.text();
          console.error(`❌ Failed for ${payload.username}: ${res.status} - ${errorText}`);
          failCount++;
        }
      } catch (err) {
        console.error(`❌ Error sending ${payload.username}:`, err.message);
        failCount++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n✨ Sync complete! Success: ${successCount}, Failed: ${failCount}`);
    
    // After syncing all members, archive players no longer in the server
    if (syncedDiscordIds.length > 0) {
      console.log(`\n🗑️ Checking for players to archive (${syncedDiscordIds.length} current members)...`);
      try {
        const archiveUrl = process.env.API_URL.replace('/sync-member', '/archive-missing');
        const archiveRes = await fetch(archiveUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.API_KEY}`,
          },
          body: JSON.stringify({ currentDiscordUserIds: syncedDiscordIds }),
        });
        
        if (archiveRes.ok) {
          const archiveResult = await archiveRes.json();
          console.log(`✅ Archive check complete: ${archiveResult.archived} archived, ${archiveResult.cleared} cleared`);
        } else {
          const errorText = await archiveRes.text();
          console.error(`❌ Archive check failed: ${archiveRes.status} - ${errorText}`);
        }
      } catch (archiveErr) {
        console.error(`❌ Archive check error: ${archiveErr.message}`);
      }
    }
  } catch (err) {
    console.error('❌ Bot startup error:', err);
  }
});

client.login(process.env.BOT_TOKEN || process.env.DISCORD_TOKEN);
