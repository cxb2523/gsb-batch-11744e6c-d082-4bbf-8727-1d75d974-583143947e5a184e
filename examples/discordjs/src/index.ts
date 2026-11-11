/**
 * YuKumo + discord.js v14 example bot
 *
 * Environment variables:
 *   DISCORD_TOKEN  — Discord bot token
 *   LAVALINK_HOST  — Lavalink host (default: localhost)
 *   LAVALINK_PORT  — Lavalink port (default: 2333)
 *   LAVALINK_PASS  — Lavalink password (default: youshallnotpass)
 *
 * Commands:
 *   !play <query>  — Search and play a track
 *   !pause         — Pause playback
 *   !resume        — Resume playback
 *   !skip          — Skip current track
 *   !stop          — Stop playback
 *   !volume <0-1000> — Set volume
 *   !destroy       — Destroy the player
 */

import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } from "discord.js";
import { YuKumo, DiscordJSAdapter } from "yukumo";
import type { SearchResult } from "yukumo";

const TOKEN = process.env.DISCORD_TOKEN ?? "";
const LAVALINK_HOST = process.env.LAVALINK_HOST ?? "localhost";
const LAVALINK_PORT = Number(process.env.LAVALINK_PORT ?? 2333);
const LAVALINK_PASS = process.env.LAVALINK_PASS ?? "youshallnotpass";

if (TOKEN === "") {
  console.error("DISCORD_TOKEN environment variable is required");
  process.exit(1);
}

// 1. Create the Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 2. Create the YuKumo Lavalink client (separate from discordClient)
const yukumo = new YuKumo({
  nodes: [{ host: LAVALINK_HOST, port: LAVALINK_PORT, password: LAVALINK_PASS }],
});

// 3. Wire up the DiscordJSAdapter — handles voice state forwarding automatically
const adapter = new DiscordJSAdapter(client, yukumo);

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);

  yukumo.setUserId(c.user.id);
  await yukumo.init();
  console.log("YuKumo initialized");

  const rest = new REST().setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(c.user.id), {
      body: [
        new SlashCommandBuilder()
          .setName("play")
          .setDescription("Search and play a track")
          .addStringOption((o) => o.setName("query").setDescription("Search query or URL").setRequired(true))
          .toJSON(),
        new SlashCommandBuilder()
          .setName("pause")
          .setDescription("Pause playback")
          .toJSON(),
        new SlashCommandBuilder()
          .setName("resume")
          .setDescription("Resume playback")
          .toJSON(),
        new SlashCommandBuilder()
          .setName("skip")
          .setDescription("Skip current track")
          .toJSON(),
        new SlashCommandBuilder()
          .setName("stop")
          .setDescription("Stop playback and clear queue")
          .toJSON(),
        new SlashCommandBuilder()
          .setName("volume")
          .setDescription("Set volume (0–1000)")
          .addIntegerOption((o) => o.setName("level").setDescription("Volume level").setMinValue(0).setMaxValue(1000).setRequired(true))
          .toJSON(),
        new SlashCommandBuilder()
          .setName("destroy")
          .setDescription("Destroy the player")
          .toJSON(),
      ],
    });
    console.log("Slash commands registered");
  } catch (err) {
    console.error("Failed to register slash commands", err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId } = interaction;
  if (guildId == null) {
    await interaction.reply({ content: "This command can only be used in a guild", ephemeral: true });
    return;
  }

  const member = interaction.member;
  if (member == null || !("voice" in member) || member.voice.channelId == null) {
    await interaction.reply({ content: "You must be in a voice channel", ephemeral: true });
    return;
  }

  let player = yukumo.getPlayer(guildId);

  if (player == null && commandName !== "play") {
    await interaction.reply({ content: "No player exists. Use /play first", ephemeral: true });
    return;
  }

  switch (commandName) {
    case "play": {
      const query = interaction.options.getString("query", true);

      if (player == null) {
        player = await yukumo.createPlayer({
          guildId,
          voiceChannelId: member.voice.channelId,
          textChannelId: interaction.channelId,
        });

        // Connect to voice via the adapter
        adapter.sendVoiceStateUpdate(guildId, member.voice.channelId);
      }

      const result: SearchResult = await yukumo.search(query);
      if (result.loadType === "empty" || result.loadType === "error" || result.tracks.length === 0) {
        await interaction.reply({ content: "No results found", ephemeral: true });
        return;
      }

      const track = result.tracks[0]!;
      await yukumo.play(guildId, track);

      await interaction.reply({ content: `Playing: **${track.info.title}**` });
      break;
    }

    case "pause": {
      await yukumo.pause(guildId);
      await interaction.reply({ content: "Paused" });
      break;
    }

    case "resume": {
      await yukumo.resume(guildId);
      await interaction.reply({ content: "Resumed" });
      break;
    }

    case "skip": {
      const skipped = await yukumo.skip(guildId);
      await interaction.reply({
        content: skipped != null ? `Skipped **${skipped.info.title}**` : "No more tracks in queue",
      });
      break;
    }

    case "stop": {
      await yukumo.stop(guildId);
      await interaction.reply({ content: "Stopped" });
      break;
    }

    case "volume": {
      const level = interaction.options.getInteger("level", true);
      await yukumo.setVolume(guildId, level);
      await interaction.reply({ content: `Volume set to ${level}` });
      break;
    }

    case "destroy": {
      await yukumo.destroyPlayer(guildId);
      await interaction.reply({ content: "Player destroyed" });
      break;
    }
  }
});

process.on("SIGINT", async () => {
  await yukumo.destroy();
  await client.destroy();
  process.exit(0);
});

await client.login(TOKEN);
