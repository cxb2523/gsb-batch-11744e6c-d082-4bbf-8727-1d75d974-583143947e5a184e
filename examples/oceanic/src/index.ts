/**
 * YuKumo + Oceanic.js example bot
 *
 * Environment variables:
 *   DISCORD_TOKEN   — Discord bot token
 *   LAVALINK_HOST   — Lavalink host (default: localhost)
 *   LAVALINK_PORT   — Lavalink port (default: 2333)
 *   LAVALINK_PASS   — Lavalink password (default: youshallnotpass)
 *
 * Commands:
 *   !play <query>   — Search and play a track
 *   !pause          — Pause playback
 *   !resume         — Resume playback
 *   !skip           — Skip current track
 *   !stop           — Stop playback
 *   !volume <0-1000> — Set volume
 *   !destroy        — Destroy the player
 */

import { Client } from "oceanic.js";
import { YuKumo } from "yukumo";
import type { VoiceStateUpdate, VoiceServerUpdate, SearchResult } from "yukumo";

const TOKEN = process.env.DISCORD_TOKEN ?? "";
const LAVALINK_HOST = process.env.LAVALINK_HOST ?? "localhost";
const LAVALINK_PORT = Number(process.env.LAVALINK_PORT ?? 2333);
const LAVALINK_PASS = process.env.LAVALINK_PASS ?? "youshallnotpass";

if (TOKEN === "") {
  console.error("DISCORD_TOKEN environment variable is required");
  process.exit(1);
}

const yukumo = new YuKumo({
  nodes: [{ host: LAVALINK_HOST, port: LAVALINK_PORT, password: LAVALINK_PASS }],
});

const client = new Client({
  auth: `Bot ${TOKEN}`,
  gateway: {
    intents: ["GUILDS", "GUILD_VOICE_STATES", "GUILD_MESSAGES", "MESSAGE_CONTENT"],
  },
});

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await yukumo.init();
  console.log("YuKumo initialized");
});

client.on("voiceStateUpdate", async (data) => {
  if (data.guildID == null) return;

  const update: VoiceStateUpdate = {
    guildId: data.guildID,
    sessionId: data.sessionID,
    channelId: data.channelID,
    userId: data.userID,
  };
  await yukumo.handleVoiceStateUpdate(update);
});

client.on("voiceServerUpdate", async (data) => {
  const update: VoiceServerUpdate = {
    token: data.token,
    endpoint: data.endpoint,
  };
  await yukumo.handleVoiceServerUpdate(data.guildID, update);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith("!")) return;

  const args = message.content.slice(1).split(/\s+/);
  const command = args[0]?.toLowerCase();

  const guildId = message.guildID;
  if (guildId == null) return;

  const member = message.member;
  if (member == null || member.voiceState == null) {
    await message.channel.createMessage("You must be in a voice channel");
    return;
  }

  const voiceChannelId = member.voiceState.channelID;
  if (voiceChannelId == null) {
    await message.channel.createMessage("You must be in a voice channel");
    return;
  }

  let player = yukumo.getPlayer(guildId);

  if (player == null && command !== "play") {
    await message.channel.createMessage("No player exists. Use !play first");
    return;
  }

  try {
    switch (command) {
      case "play": {
        const query = args.slice(1).join(" ");
        if (query === "") {
          await message.channel.createMessage("Usage: !play <query or URL>");
          return;
        }

        if (player == null) {
          player = await yukumo.createPlayer({
            guildId,
            voiceChannelId: voiceChannelId,
            textChannelId: message.channel.id,
          });
        }

        const result: SearchResult = await yukumo.search(query);
        if (result.loadType === "empty" || result.loadType === "error" || result.tracks.length === 0) {
          await message.channel.createMessage("No results found");
          return;
        }

        const track = result.tracks[0]!;
        await yukumo.play(guildId, track);
        await message.channel.createMessage(`Playing: **${track.info.title}**`);
        break;
      }
      case "pause": {
        await yukumo.pause(guildId);
        await message.channel.createMessage("Paused");
        break;
      }
      case "resume": {
        await yukumo.resume(guildId);
        await message.channel.createMessage("Resumed");
        break;
      }
      case "skip": {
        const skipped = await yukumo.skip(guildId);
        await message.channel.createMessage(
          skipped != null ? `Skipped **${skipped.info.title}**` : "No more tracks in queue",
        );
        break;
      }
      case "stop": {
        await yukumo.stop(guildId);
        await message.channel.createMessage("Stopped");
        break;
      }
      case "volume": {
        const level = Number(args[1]);
        if (Number.isNaN(level) || level < 0 || level > 1000) {
          await message.channel.createMessage("Usage: !volume <0-1000>");
          return;
        }
        await yukumo.setVolume(guildId, level);
        await message.channel.createMessage(`Volume set to ${level}`);
        break;
      }
      case "destroy": {
        await yukumo.destroyPlayer(guildId);
        await message.channel.createMessage("Player destroyed");
        break;
      }
    }
  } catch (error) {
    await message.channel.createMessage(`Error: ${(error as Error).message}`);
  }
});

process.on("SIGINT", async () => {
  await yukumo.destroy();
  await client.disconnect(false);
  process.exit(0);
});

client.connect();
