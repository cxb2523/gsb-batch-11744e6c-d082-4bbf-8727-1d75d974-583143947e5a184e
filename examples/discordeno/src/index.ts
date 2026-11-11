/**
 * YuKumo + Discordeno example bot
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

import { createBot, Intents, startBot } from "@discordeno/bot";
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

const bot = createBot({
  token: TOKEN,
  intents: Intents.Guilds | Intents.GuildVoiceStates | Intents.GuildMessages | Intents.MessageContents,
  events: {
    ready: async (_data) => {
      console.log("Logged in");

      await yukumo.init();
      console.log("YuKumo initialized");
    },
    voiceStateUpdate: async (data) => {
      if (data.guildId == null) return;

      const update: VoiceStateUpdate = {
        guildId: data.guildId.toString(),
        sessionId: data.sessionId ?? "",
        channelId: data.channelId?.toString() ?? null,
        userId: data.userId.toString(),
      };
      await yukumo.handleVoiceStateUpdate(update);
    },
    voiceServerUpdate: async (data) => {
      const update: VoiceServerUpdate = {
        token: data.token,
        endpoint: data.endpoint,
      };
      await yukumo.handleVoiceServerUpdate(data.guildId.toString(), update);
    },
    messageCreate: async (message) => {
      if (message.isFromBot || !message.content.startsWith("!")) return;

      const args = message.content.slice(1).split(/\s+/);
      const command = args[0]?.toLowerCase();

      const guildId = message.guildId;
      if (guildId == null) return;
      const gid = guildId.toString();

      const voiceStates = await bot.helpers.getVoiceStates(guildId);
      const memberVoice = voiceStates.find((vs) => vs.userId === message.authorId);

      if (memberVoice == null || memberVoice.channelId == null) {
        await message.reply("You must be in a voice channel");
        return;
      }

      let player = yukumo.getPlayer(gid);

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
                guildId: gid,
                voiceChannelId: memberVoice.channelId.toString(),
              });
            }

            const result: SearchResult = await yukumo.search(query);
            if (result.loadType === "empty" || result.loadType === "error" || result.tracks.length === 0) {
              await message.reply("No results found");
              return;
            }

            const track = result.tracks[0]!;
            await yukumo.play(gid, track);
            await message.reply(`Playing: **${track.info.title}**`);
            break;
          }
          case "pause": {
            await yukumo.pause(gid);
            await message.reply("Paused");
            break;
          }
          case "resume": {
            await yukumo.resume(gid);
            await message.reply("Resumed");
            break;
          }
          case "skip": {
            const skipped = await yukumo.skip(gid);
            await message.reply(
              skipped != null ? `Skipped **${skipped.info.title}**` : "No more tracks in queue",
            );
            break;
          }
          case "stop": {
            await yukumo.stop(gid);
            await message.reply("Stopped");
            break;
          }
          case "volume": {
            const level = Number(args[1]);
            if (Number.isNaN(level) || level < 0 || level > 1000) {
              await message.reply("Usage: !volume <0-1000>");
              return;
            }
            await yukumo.setVolume(gid, level);
            await message.reply(`Volume set to ${level}`);
            break;
          }
          case "destroy": {
            await yukumo.destroyPlayer(gid);
            await message.reply("Player destroyed");
            break;
          }
        }
      } catch (error) {
        await message.reply(`Error: ${(error as Error).message}`);
      }
    },
  },
});

process.on("SIGINT", async () => {
  await yukumo.destroy();
  await bot.rest.close();
  process.exit(0);
});

await startBot(bot);
