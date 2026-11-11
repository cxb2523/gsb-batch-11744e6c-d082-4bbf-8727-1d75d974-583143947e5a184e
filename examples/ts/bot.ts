/**
 * Yukumo Lavalink v4 Client — TypeScript Example
 */
import { Client, GatewayIntentBits, Message } from "discord.js";
import { YuKumo, DiscordJSAdapter, LeastPenaltySelector, TrackData, SearchResult } from "../../src";

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
      name: "production-node",
      host: "localhost",
      port: 2333,
      password: "youshallnotpass",
      secure: false,
    },
  ],
  defaultSearchSource: "ytsearch",
  defaultNodeSelector: new LeastPenaltySelector(),
});

const adapter = new DiscordJSAdapter(client, kumo);

kumo.on("nodeReady", (nodeId: string) => {
  console.log(`[Yukumo TS] Node connected: ${nodeId}`);
});

kumo.on("trackStart", (guildId: string, track: TrackData) => {
  console.log(`[Yukumo TS] Playing ${track.info.title} in ${guildId}`);
});

kumo.on("playerMove", (guildId: string, fromNode: string, toNode: string) => {
  console.log(`[Yukumo TS] Auto-failover moved player for ${guildId} from ${fromNode} to ${toNode}`);
});

client.once("ready", async () => {
  if (!client.user) return;
  console.log(`[Bot TS] Logged in as ${client.user.tag}`);
  kumo.setUserId(client.user.id);
  await kumo.init();
});

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot || !message.guild || !message.member?.voice.channel) return;

  const content = message.content.trim();
  const guildId = message.guild.id;
  const channelId = message.member.voice.channel.id;

  if (content.startsWith("!play ")) {
    const query = content.slice(6);
    const searchRes: SearchResult = await kumo.search(query);

    if (searchRes.loadType === "empty" || searchRes.tracks.length === 0) {
      await message.reply("No tracks found.");
      return;
    }

    const track = searchRes.tracks[0];
    const player = await kumo.createPlayer({
      guildId,
      voiceChannelId: channelId,
      textChannelId: message.channel.id,
    });

    adapter.sendVoiceStateUpdate(guildId, channelId);
    await kumo.play(guildId, track);

    // Apply Bass Boost preset automatically
    player.filters.setBassBoost("medium");

    await message.reply(`Playing: **${track.info.title}**`);
  }
});

client.login(process.env.DISCORD_TOKEN);
