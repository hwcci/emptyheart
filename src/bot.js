const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");
const voiceLib = process.env.MOCK_VOICE === "1" ? require("./voice-stub") : require("@discordjs/voice");
const {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} = voiceLib;
const { spawn } = require("node:child_process");

const { fetchTrack } = require("./ytdl");

const FFMPEG_CMD = "ffmpeg";
const FFMPEG_ARGS = [
  "-reconnect",
  "1",
  "-reconnect_streamed",
  "1",
  "-reconnect_delay_max",
  "5",
  "-i",
  null, // placeholder for URL
  "-analyzeduration",
  "0",
  "-loglevel",
  "warning",
  "-f",
  "s16le",
  "-ar",
  "48000",
  "-ac",
  "2",
  "pipe:1",
];

async function createResource(url) {
  const args = [...FFMPEG_ARGS];
  const urlIndex = args.indexOf(null);
  if (urlIndex === -1) {
    throw new Error("FFmpeg args missing URL placeholder");
  }
  args[urlIndex] = url; // replace placeholder

  const proc = spawn(FFMPEG_CMD, args, {
    stdio: ["ignore", "pipe", "inherit"],
  });

  const stream = proc.stdout;
  const resource = createAudioResource(stream, {
    inputType: StreamType.Raw,
    metadata: { proc },
  });
  return resource;
}

class MusicSession {
  constructor(guildId, resourceFactory = createResource) {
    this.guildId = guildId;
    this.queue = [];
    this.current = null;
    this.connection = null;
    this.resourceFactory = resourceFactory;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    this.player.on(AudioPlayerStatus.Idle, () => {
      this._cleanupResource();
      this._playNext().catch((err) => console.error("playNext error", err));
    });
    this.player.on("error", (err) => {
      console.error("Player error", err);
      this._cleanupResource();
      this._playNext().catch((e) => console.error("recovery playNext error", e));
    });
  }

  async ensureVoice(member) {
    const channel = member?.voice?.channel;
    if (!channel) {
      throw new Error("ادخل قناة صوتية أولاً.");
    }
    if (this.connection) {
      return this.connection;
    }
    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    this.connection.subscribe(this.player);
    await entersState(this.connection, VoiceConnectionStatus.Ready, 10_000);
    return this.connection;
  }

  async enqueue(track) {
    this.queue.push(track);
    if (!this.current) {
      await this._playNext();
    }
  }

  async _playNext() {
    this.current = this.queue.shift() || null;
    if (!this.current) {
      return;
    }
    const resource = await this.resourceFactory(this.current.streamUrl);
    this.player.play(resource);
  }

  skip() {
    this.player.stop(true);
  }

  stop() {
    this.queue = [];
    this.current = null;
    this.player.stop(true);
    this._cleanupResource();
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
  }

  _cleanupResource() {
    const metadata = this.player.state.resource?.metadata;
    if (metadata?.proc && !metadata.proc.killed) {
      metadata.proc.kill("SIGKILL");
    }
  }
}

const COMMANDS = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("تشغيل/إضافة أغنية من يوتيوب")
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("رابط يوتيوب أو كلمات البحث")
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName("skip").setDescription("تخطي المقطع الحالي"),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("إيقاف التشغيل ومغادرة القناة"),
  new SlashCommandBuilder().setName("queue").setDescription("عرض قائمة الانتظار"),
  new SlashCommandBuilder().setName("ping").setDescription("فحص البوت"),
].map((cmd) => cmd.toJSON());

async function registerCommands(token, clientId, guildId) {
  if (!clientId) {
    console.warn("CLIENT_ID غير معرف؛ لن يتم تسجيل الأوامر.");
    return;
  }
  const rest = new REST({ version: "10" }).setToken(token);
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: COMMANDS,
    });
    console.log(`سجّلت أوامر الـ Slash بشكل فوري على الخادم ${guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: COMMANDS });
    console.log("سجّلت أوامر Slash عالميًا (قد تأخذ بضع دقائق للتفعيل).");
  }
}

function createClient() {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
}

async function bootstrap() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  if (!token) {
    throw new Error("ضع متغير البيئة DISCORD_TOKEN بتوكن البوت.");
  }

  const client = createClient();
  const sessions = new Map();

  client.once("ready", async () => {
    console.log(`تم تسجيل الدخول كـ ${client.user.tag}`);
    try {
      await registerCommands(token, clientId || client.user.id, guildId);
    } catch (err) {
      console.error("تعذّر تسجيل الأوامر:", err);
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: "الأوامر تعمل داخل الخوادم فقط.", ephemeral: true });
      return;
    }
    const session =
      sessions.get(guildId) || (() => { const s = new MusicSession(guildId); sessions.set(guildId, s); return s; })();

    try {
      if (interaction.commandName === "play") {
        await interaction.deferReply();
        await session.ensureVoice(interaction.member);
        const query = interaction.options.getString("query", true);
        const track = await fetchTrack(query);
        await session.enqueue(track);
        await interaction.editReply(`أُضيفت: **${track.title}** (${track.webpageUrl})`);
      } else if (interaction.commandName === "skip") {
        session.skip();
        await interaction.reply("تم التخطي.");
      } else if (interaction.commandName === "stop") {
        session.stop();
        await interaction.reply("تم الإيقاف والمغادرة.");
      } else if (interaction.commandName === "queue") {
        const now = session.current
          ? `الآن: **${session.current.title}**`
          : "لا يوجد تشغيل حالي.";
        const lines = [now];
        if (session.queue.length === 0) {
          lines.push("قائمة الانتظار فارغة.");
        } else {
          lines.push("قائمة الانتظار:");
          session.queue.slice(0, 10).forEach((t, idx) => {
            lines.push(`${idx + 1}. ${t.title}`);
          });
        }
        await interaction.reply(lines.join("\n"));
      } else if (interaction.commandName === "ping") {
        await interaction.reply(`pong (${Math.round(client.ws.ping)}ms)`);
      }
    } catch (err) {
      console.error("Command handling error", err);
      const msg = err?.message || "حدث خطأ غير متوقع.";
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
    }
  });

  await client.login(token);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { MusicSession, createResource, bootstrap, createClient };
