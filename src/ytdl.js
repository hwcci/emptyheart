const { execFile } = require("node:child_process");
const { once } = require("node:events");

const YTDL_BIN = process.env.YTDLP_BIN || process.env.YTDLP_PATH || "yt-dlp";
const PLAYER_CLIENT = process.env.YTDLP_PLAYER_CLIENT || "android";

// Flags chosen to avoid auth/sign-in and to keep responses lightweight.
const BASE_ARGS = [
  "--no-playlist",
  "--no-warnings",
  "--ignore-errors",
  "--no-call-home",
  "--no-check-certificates",
  "--youtube-skip-dash-manifest",
  "--force-ipv4",
];

const isUrl = (query) => /^https?:\/\//i.test(query);

function buildArgs(query) {
  const target = isUrl(query) ? query : `ytsearch1:${query}`;
  const args = [...BASE_ARGS];
  args.push("--extractor-args", `youtube:player_client=${PLAYER_CLIENT}`);
  args.push("--format", "bestaudio[ext=webm]/bestaudio");
  args.push("--print-json");

  const cookies = process.env.YTDLP_COOKIES;
  if (cookies) {
    args.push("--cookies", cookies);
  }
  const cookiesBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER;
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
