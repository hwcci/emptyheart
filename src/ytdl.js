const { execFile } = require("node:child_process");
const { once } = require("node:events");

const YTDL_BIN = process.env.YTDLP_BIN || process.env.YTDLP_PATH || "yt-dlp";
const ENV_PLAYER_CLIENT = process.env.YTDLP_PLAYER_CLIENT;
const ENV_FORMAT = process.env.YTDLP_FORMAT || "bestaudio/best";

// Flags chosen to avoid auth/sign-in and to keep responses lightweight.
const BASE_ARGS = [
  "--no-playlist",
  "--no-warnings",
  "--ignore-errors",
  "--no-check-certificates",
  "--force-ipv4",
];

const isUrl = (query) => /^https?:\/\//i.test(query);

function resolvePlayerClient(hasCookies) {
  if (hasCookies && !ENV_PLAYER_CLIENT) {
    // iOS/tv clients تميل لتخطي تحديات الويب مع وجود كوكيز.
    return "ios";
  }
  return ENV_PLAYER_CLIENT || "android";
}

function buildArgs(query) {
  const target = isUrl(query) ? query : `ytsearch1:${query}`;
  const args = [...BASE_ARGS];
  const cookies = process.env.YTDLP_COOKIES;
  const cookiesBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER;
  const playerClient = resolvePlayerClient(Boolean(cookies || cookiesBrowser));

  args.push("--extractor-args", `youtube:player_client=${playerClient}`);
  args.push("--format", ENV_FORMAT);
  args.push("--print-json");

  if (cookies) {
    args.push("--cookies", cookies);
  }
  if (cookiesBrowser) {
    args.push("--cookies-from-browser", cookiesBrowser);
  }
  const extraArgs = process.env.YTDLP_EXTRA_ARGS;
  if (extraArgs) {
    args.push(...extraArgs.split(/\s+/).filter(Boolean));
  }

  args.push(target);
  return args;
}

let execFileImpl = execFile;

function __setExecFile(fn) {
  execFileImpl = fn;
}

function __resetExecFile() {
  execFileImpl = execFile;
}

async function fetchTrack(query, execOverride) {
  const args = buildArgs(query);
  const runner = execOverride || execFileImpl;
  const proc = runner(YTDL_BIN, args, { maxBuffer: 1_000_000 });

  let buffer = "";
  let errBuffer = "";
  proc.stdout?.on("data", (chunk) => {
    buffer += chunk.toString();
  });
  proc.stderr?.on("data", (chunk) => {
    errBuffer += chunk.toString();
  });

  const [code] = await once(proc, "close");
  if (code !== 0) {
    const tail = errBuffer.trim().split("\n").slice(-3).join(" | ");
    const msg = tail ? `yt-dlp failed to fetch info: ${tail}` : "yt-dlp failed to fetch info";
    const err = new Error(msg);
    err.code = code;
    throw err;
  }

  const line = buffer.trim().split("\n")[0];
  if (!line) {
    throw new Error("Empty yt-dlp response");
  }

  const parsed = JSON.parse(line);
  const entry = parsed.entries ? parsed.entries[0] : parsed;

  return {
    title: entry.title || "Untitled",
    streamUrl: entry.url,
    webpageUrl: entry.webpage_url || entry.original_url || query,
  };
}

module.exports = { buildArgs, fetchTrack, isUrl, __setExecFile, __resetExecFile };
