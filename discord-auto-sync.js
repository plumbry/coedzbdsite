// discord-auto-sync.js — manual Discord member sync utility.
//
// Full guild sync is admin-triggered from Member Management → Discord sync tools.
// Set MANUAL_FULL_SYNC=1 for a one-off full guild export.

import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_SERVER_ID;
const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;

if (!DISCORD_TOKEN || !GUILD_ID) {
  console.error('❌ Missing DISCORD_TOKEN or DISCORD_SERVER_ID in .env');
  process.exit(1);
}

if (!API_URL || !API_KEY) {
  console.error('❌ Missing API_URL or API_KEY in .env (required for member sync)');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

async function syncMember(member) {
  try {
    if (!member.joinedTimestamp) {
      await member.fetch();
    }

    const roles = member.roles.cache
      .filter((role) => role.name !== '@everyone')
      .map((role) => ({ id: role.id, name: role.name }));

    const payload = {
      id: member.user.id,
      username: member.user.username,
      nickname: member.nickname || null,
      joined_at: member.joinedTimestamp ? new Date(member.joinedTimestamp).toISOString() : null,
      roles: roles.length > 0 ? roles : null,
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Sync endpoint returned ${response.status}: ${errorText}`);
      return false;
    }

    console.log(`✅ Synced: ${member.user.username} (${member.user.id})`);
    return true;
  } catch (error) {
    console.error(`❌ Error syncing ${member.user.username}:`, error.message);
    return false;
  }
}

async function syncAllMembers(guild) {
  console.log(`\n🔄 Manual full sync for ${guild.name}...`);
  const members = await guild.members.fetch();
  let successCount = 0;
  let failCount = 0;

  for (const [, member] of members) {
    if (member.user.bot) continue;
    const success = await syncMember(member);
    if (success) successCount++;
    else failCount++;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\n✨ Manual sync complete. Success: ${successCount}, Failed: ${failCount}`);
}

client.once('ready', async () => {
  console.log(`\n🤖 Bot logged in as ${client.user.tag}`);
  console.log('ℹ️  Join/update listeners are disabled. Use scheduled or manual sync.\n');

  if (process.env.MANUAL_FULL_SYNC === '1') {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      await syncAllMembers(guild);
    } catch (error) {
      console.error('❌ Manual full sync failed:', error.message);
    }
  }
});

client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
});

console.log('🚀 Starting Discord bot...');
client.login(DISCORD_TOKEN).catch((error) => {
  console.error('❌ Failed to login:', error.message);
  process.exit(1);
});
