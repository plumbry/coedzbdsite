// discord-big-summer-reeval-sync.js — processes Big Summer Re-Eval tier role change queue.
//
// Polls Convex for pending queue items, applies Discord tier role changes, and posts a summary
// to the admin log channel.
//
// Required env:
//   DISCORD_TOKEN, DISCORD_SERVER_ID, CONVEX_SITE_URL, API_KEY
// Optional:
//   ADMIN_LOG_CHANNEL_ID — channel for processing summaries
//   POLL_INTERVAL_MS — default 60000

import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_SERVER_ID;
const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL;
const API_KEY = process.env.API_KEY;
const ADMIN_LOG_CHANNEL_ID = process.env.ADMIN_LOG_CHANNEL_ID;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 60000);

const TIER_ROLE_NAMES = ['Tier S', 'Tier A', 'Tier B', 'Tier C', 'Tier D'];

if (!DISCORD_TOKEN || !GUILD_ID || !CONVEX_SITE_URL || !API_KEY) {
  console.error('❌ Missing DISCORD_TOKEN, DISCORD_SERVER_ID, CONVEX_SITE_URL, or API_KEY');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

function apiUrl(path) {
  return `${CONVEX_SITE_URL.replace(/\/$/, '')}${path}`;
}

async function claimPendingItems() {
  const response = await fetch(apiUrl('/api/discord/tier-role-change-queue/pending?limit=25'), {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claim failed ${response.status}: ${text}`);
  }
  const data = await response.json();
  return data.items ?? [];
}

async function completeItems(results) {
  const response = await fetch(apiUrl('/api/discord/tier-role-change-queue/complete'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ results }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Complete failed ${response.status}: ${text}`);
  }
}

function resolveTierRoleMap(guild) {
  const map = new Map();
  for (const roleName of TIER_ROLE_NAMES) {
    const role = guild.roles.cache.find((r) => r.name === roleName);
    if (role) map.set(roleName, role.id);
  }
  return map;
}

function withoutTierRoles(roleIds, tierRoleIds) {
  const tierSet = new Set(tierRoleIds);
  return roleIds.filter((id) => !tierSet.has(id));
}

async function processQueueItem(guild, tierRoleMap, item) {
  const tierRoleIds = [...tierRoleMap.values()];

  if (!item.discordId) {
    return { id: item.id, status: 'failed', errorMessage: 'Missing Discord ID' };
  }

  let member;
  try {
    member = await guild.members.fetch(item.discordId);
  } catch {
    return { id: item.id, status: 'failed', errorMessage: 'Discord member not found' };
  }

  const currentRoles = [...member.roles.cache.keys()].filter((id) => id !== guild.id);
  let targetRoles = withoutTierRoles(currentRoles, tierRoleIds);

  if (item.action === 'change_tier') {
    const targetTier = item.targetTier;
    if (!targetTier) {
      return { id: item.id, status: 'failed', errorMessage: 'Missing target tier' };
    }
    const roleName = `Tier ${targetTier}`;
    const roleId = tierRoleMap.get(roleName);
    if (!roleId) {
      return { id: item.id, status: 'failed', errorMessage: `Missing role ID for ${roleName}` };
    }
    targetRoles = [...targetRoles, roleId];
  }

  if (item.action === 'no_change') {
    return { id: item.id, status: 'skipped', errorMessage: 'No Discord change required' };
  }

  const unchanged =
    targetRoles.length === currentRoles.length &&
    targetRoles.every((id) => currentRoles.includes(id));

  if (unchanged) {
    return { id: item.id, status: 'completed' };
  }

  try {
    await member.roles.set(targetRoles);
    return { id: item.id, status: 'completed' };
  } catch (error) {
    return {
      id: item.id,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Discord API failure',
    };
  }
}

async function postSummary(guild, summary) {
  if (!ADMIN_LOG_CHANNEL_ID) return;
  const channel = await guild.channels.fetch(ADMIN_LOG_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const failureLines =
    summary.failures.length > 0
      ? `\n\nFailures:\n${summary.failures.map((f) => `- ${f}`).join('\n')}`
      : '';

  const message = [
    '**Big Re-Eval Role Changes Complete**',
    `✅ Completed: ${summary.completed}`,
    `⚠️ Failed: ${summary.failed}`,
    `⏭️ Skipped: ${summary.skipped}`,
    failureLines,
  ].join('\n');

  await channel.send({ content: message.slice(0, 1900) });
}

async function processQueue() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const tierRoleMap = resolveTierRoleMap(guild);
  const items = await claimPendingItems();

  if (items.length === 0) {
    return;
  }

  console.log(`🔄 Processing ${items.length} tier role change(s)...`);

  const results = [];
  const summary = { completed: 0, failed: 0, skipped: 0, failures: [] };

  for (const item of items) {
    const result = await processQueueItem(guild, tierRoleMap, item);
    results.push(result);

    if (result.status === 'completed') summary.completed += 1;
    else if (result.status === 'failed') {
      summary.failed += 1;
      summary.failures.push(`${item.playerName} - ${result.errorMessage}`);
    } else if (result.status === 'skipped') summary.skipped += 1;

    await new Promise((r) => setTimeout(r, 300));
  }

  await completeItems(results);
  await postSummary(guild, summary);

  console.log(
    `✅ Done — completed: ${summary.completed}, failed: ${summary.failed}, skipped: ${summary.skipped}`,
  );
}

client.once('ready', () => {
  console.log(`✅ Big Summer Re-Eval bot ready as ${client.user.tag}`);
  processQueue().catch((err) => console.error('Initial queue processing error:', err));
  setInterval(() => {
    processQueue().catch((err) => console.error('Queue processing error:', err));
  }, POLL_INTERVAL_MS);
});

client.login(DISCORD_TOKEN);
