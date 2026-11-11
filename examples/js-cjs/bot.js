/**
 * Yukumo Lavalink v4 Client — Plain JavaScript (CommonJS) Example
 */
const { Client, GatewayIntentBits } = require("discord.js");
const { YuKumo, DiscordJSAdapter, LeastPenaltySelector } = require("../../dist/index.cjs");

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
      name: "main-node",
      host: "127.0.0.1",
      port: 2333,
      password: "youshallnotpass",
      secure: false,
    },
  ],
  defaultSearchSource: "ytsearch",
  defaultNodeSelector: new LeastPenaltySelector(),
});

// Initialize discord.js adapter
const adapter = new DiscordJSAdapter(client, kumo);

kumo.on("nodeReady", (nodeId) => {
  console.log(`[Yukumo] Node connected and ready: ${nodeId}`);
});

kumo.on("trackStart", (guildId, track) => {
  console.log(`[Yukumo] Playing "${track.info.title}" in guild ${guildId}`);
});

kumo.on("queueEnd", (guildId) => {
  console.log(`[Yukumo] Queue finished for guild ${guildId}`);
});

client.once("ready", async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  kumo.setUserId(client.user.id);
  await kumo.init();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith("!play ")) return;

  const query = message.content.slice(6).trim();
  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    message.reply("Please join a voice channel first!");
    return;
  }

  // 1. Search for track
  const res = await kumo.search(query, "youtube");
  if (res.loadType === "empty" || res.tracks.length === 0) {
    message.reply("No tracks found!");
    return;
  }

  const track = res.tracks[0];

  // 2. Create or get player
  const player = await kumo.createPlayer({
    guildId: message.guild.id,
    voiceChannelId: voiceChannel.id,
    textChannelId: message.channel.id,
  });

  // 3. Connect voice state via adapter
  adapter.sendVoiceStateUpdate(message.guild.id, voiceChannel.id, true, false);

  // 4. Enqueue & play
  await kumo.play(message.guild.id, track);
  message.reply(`Added to queue: **${track.info.title}**`);
});

client.login(process.env.DISCORD_TOKEN);
