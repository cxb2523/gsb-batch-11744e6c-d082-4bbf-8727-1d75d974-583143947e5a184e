/**
 * Yukumo Lavalink v4 Client — Plain JavaScript (ESM) Example
 */
import { Client, GatewayIntentBits } from "discord.js";
import { YuKumo, DiscordJSAdapter, LeastUsedSelector } from "../../dist/index.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const kumo = new YuKumo({
  nodes: [
    {
      name: "node-1",
      host: "localhost",
      port: 2333,
      password: "youshallnotpass",
    },
  ],
  defaultNodeSelector: new LeastUsedSelector(),
});

const adapter = new DiscordJSAdapter(client, kumo);

kumo.on("nodeReady", (nodeId) => {
  console.log(`[Yukumo ESM] Node ready: ${nodeId}`);
});

kumo.on("trackStart", (guildId, track) => {
  console.log(`[Yukumo ESM] Track started: ${track.info.title}`);
});

client.once("ready", async () => {
  console.log(`[Bot ESM] Logged in as ${client.user.tag}`);
  kumo.setUserId(client.user.id);
  await kumo.init();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith("!play ")) return;

  const query = message.content.slice(6).trim();
  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    message.reply("You must be in a voice channel!");
    return;
  }

  const res = await kumo.search(query);
  if (res.loadType === "empty" || res.tracks.length === 0) {
    message.reply("No results found!");
    return;
  }

  const track = res.tracks[0];
  await kumo.createPlayer({
    guildId: message.guild.id,
    voiceChannelId: voiceChannel.id,
    textChannelId: message.channel.id,
  });

  adapter.sendVoiceStateUpdate(message.guild.id, voiceChannel.id);
  await kumo.play(message.guild.id, track);
  message.reply(`Enqueued: **${track.info.title}**`);
});

client.login(process.env.DISCORD_TOKEN);
