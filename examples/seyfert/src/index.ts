/**
 * YuKumo + Seyfert example bot
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

import { Client, type Message } from "seyfert";
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

const client = new Client();

client.once("ready", async (c) => {
  console.log(`Logged in as ${c.user?.tag ?? "unknown"}`);

  await yukumo.init();
  console.log("YuKumo initialized");
});

client.on("voiceStateUpdate", async (voiceState) => {
  const guildId = voiceState.guildId;
  if (guildId == null) return;

  const update: VoiceStateUpdate = {
    guildId,
    sessionId: voiceState.sessionId ?? "",
    channelId: voiceState.channelId,
    userId: voiceState.id,
  };
  await yukumo.handleVoiceStateUpdate(update);
});

client.on("voiceServerUpdate", async (data) => {
  const guildId = data.guild?.id;
  if (guildId == null) return;

  const update: VoiceServerUpdate = {
    token: data.token,
    endpoint: data.endpoint,
  };
  await yukumo.handleVoiceServerUpdate(guildId, update);
});

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot || !message.content.startsWith("!")) return;

  const args = message.content.slice(1).split(/\s+/);
  const command = args[0]?.toLowerCase();
  const guildId = message.guildId;
  if (guildId == null) return;

  const member = message.member;
  if (member == null) {
    await message.reply("Could not determine your member data");
    return;
  }

  const voiceState = member.voice;
  if (voiceState?.channelId == null) {
    await message.reply("You must be in a voice channel");
    return;
  }

  let player = yukumo.getPlayer(guildId);

  if (player == null && command !== "play") {
    await message.reply("No player exists. Use !play first");
    return;
  }

  try {
    switch (command) {
      case "play": {
        const query = args.slice(1).join(" ");
        if (query === "") {
          await message.reply("Usage: !play <query or URL>");
          return;
        }

        if (player == null) {
          player = await yukumo.createPlayer({
            guildId,
            voiceChannelId: voiceState.channelId,
            textChannelId: message.channelId,
          });
        }

        const result: SearchResult = await yukumo.search(query);
        if (result.loadType === "empty" || result.loadType === "error" || result.tracks.length === 0) {
          await message.reply("No results found");
          return;
        }

        const track = result.tracks[0]!;
        await yukumo.play(guildId, track);
        await message.reply(`Playing: **${track.info.title}**`);
        break;
      }
      case "pause": {
        await yukumo.pause(guildId);
        await message.reply("Paused");
        break;
      }
      case "resume": {
        await yukumo.resume(guildId);
        await message.reply("Resumed");
        break;
      }
      case "skip": {
        const skipped = await yukumo.skip(guildId);
        await message.reply(
          skipped != null ? `Skipped **${skipped.info.title}**` : "No more tracks in queue",
        );
        break;
      }
      case "stop": {
        await yukumo.stop(guildId);
        await message.reply("Stopped");
        break;
      }
      case "volume": {
        const level = Number(args[1]);
        if (Number.isNaN(level) || level < 0 || level > 1000) {
          await message.reply("Usage: !volume <0-1000>");
          return;
        }
        await yukumo.setVolume(guildId, level);
        await message.reply(`Volume set to ${level}`);
        break;
      }
      case "destroy": {
        await yukumo.destroyPlayer(guildId);
        await message.reply("Player destroyed");
        break;
      }
    }
  } catch (error) {
    await message.reply(`Error: ${(error as Error).message}`);
  }
});

process.on("SIGINT", async () => {
  await yukumo.destroy();
  await client.destroy();
  process.exit(0);
});

await client.start({ token: TOKEN });
