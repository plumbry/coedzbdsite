// discord-auto-sync.js - ES Module version
import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';

// Configuration from .env
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_SERVER_ID;
const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;

// Validate configuration
if (!DISCORD_TOKEN || !GUILD_ID || !API_URL || !API_KEY) {
  console.error('❌ Missing required environment variables. Please check your .env file.');
  process.exit(1);
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// Sync a single member to the API
async function syncMember(member) {
  try {
    // Make sure we have full member data
    if (!member.joinedTimestamp) {
      await member.fetch();
    }
    
    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .map(role => ({
        id: role.id,
        name: role.name,
      }));

    const payload = {
      id: member.user.id,  // Changed from discordUserId to id
      username: member.user.username,  // Changed from discordUsername to username
      nickname: member.nickname || null,
      joined_at: member.joinedTimestamp ? new Date(member.joinedTimestamp).toISOString() : null,
      roles: roles.length > 0 ? roles : null,
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,  // Changed from x-api-key to Authorization Bearer
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to sync ${member.user.username}: ${response.status} - ${errorText}`);
      return false;
    }

    console.log(`✅ Synced: ${member.user.username} (${member.user.id})`);
    return true;
  } catch (error) {
    console.error(`❌ Error syncing ${member.user.username}:`, error.message);
    return false;
  }
}

// Sync all members in the guild
async function syncAllMembers(guild) {
  console.log(`\n🔄 Starting full member sync for ${guild.name}...`);
  
  try {
    const members = await guild.members.fetch();
    console.log(`📊 Found ${members.size} members to sync`);
    
    let successCount = 0;
    let failCount = 0;

    for (const [, member] of members) {
      if (member.user.bot) continue; // Skip bots
      
      const success = await syncMember(member);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Delay to avoid rate limiting and database conflicts
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n✨ Sync complete! Success: ${successCount}, Failed: ${failCount}`);
    console.log(
      'ℹ️  Missing-member archival is handled by the server daily Discord sync cron (not this bot).\n',
    );
  } catch (error) {
    console.error('❌ Error during full sync:', error.message);
  }
}

// Bot ready event
client.once('ready', async () => {
  console.log(`\n🤖 Bot logged in as ${client.user.tag}`);
  console.log(`📡 Monitoring guild: ${GUILD_ID}\n`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    
    // Perform initial full sync
    await syncAllMembers(guild);
    
    // Set up periodic sync (every 30 minutes)
    setInterval(async () => {
      await syncAllMembers(guild);
    }, 30 * 60 * 1000);
    
  } catch (error) {
    console.error('❌ Error fetching guild:', error.message);
    console.error('Make sure the GUILD_ID is correct and the bot has access to the server.');
  }
});

// Member join event
client.on('guildMemberAdd', async (member) => {
  console.log(`\n👋 New member joined: ${member.user.username}`);
  await syncMember(member);
});

// Member update event (role changes, etc.)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  console.log(`\n🔄 Member updated: ${newMember.user.username}`);
  await syncMember(newMember);
});

// Member leave event
client.on('guildMemberRemove', async (member) => {
  console.log(`\n👋 Member left: ${member.user.username}`);
  // Archival of departed members is handled by the server daily Discord sync cron.
});

// Error handling
client.on('error', error => {
  console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

// Login to Discord
console.log('🚀 Starting Discord bot...');
client.login(DISCORD_TOKEN).catch(error => {
  console.error('❌ Failed to login:', error.message);
  console.error('Please check your DISCORD_TOKEN in the .env file.');
  process.exit(1);
});
