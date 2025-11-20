const { execFile } = require("node:child_process");
const { once } = require("node:events");

const YTDL_BIN = process.env.YTDLP_BIN || process.env.YTDLP_PATH || "yt-dlp";
const ENV_PLAYER_CLIENT = process.env.YTDLP_PLAYER_CLIENT;
const ENV_FORMAT = process.env.YTDLP_FORMAT || "bestaudio/best";

// Minimal flags to avoid authentication and keep the call lightweight.
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
    // ios tends لتجاوز بعض تحديات الويب مع كوكيز.
    return "ios";
  }
  return ENV_PLAYER_CLIENT || "android";
}

function buildArgs(query, clientOverride, formatOverride) {
  const target = isUrl(query) ? query : `ytsearch1:${query}`;
  const args = [...BASE_ARGS];
  const cookies = process.env.YTDLP_COOKIES;
  const cookiesBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER;
  const playerClient = clientOverride || resolvePlayerClient(Boolean(cookies || cookiesBrowser));
  const format = formatOverride || ENV_FORMAT;

  args.push("--extractor-args", `youtube:player_client=${playerClient}`);
  args.push("--format", format);
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
  const runner = execOverride || execFileImpl;
  const hasCookies = Boolean(process.env.YTDLP_COOKIES || process.env.YTDLP_COOKIES_FROM_BROWSER);

  const clientCandidates = Array.from(
    new Set([resolvePlayerClient(hasCookies), "tv_embedded", "ios", "android", "web"])
  );
  const formatCandidates = Array.from(new Set([ENV_FORMAT, "140", "251", "bestaudio/best"]));

  let lastError;

  for (const client of clientCandidates) {
    for (const fmt of formatCandidates) {
      const args = buildArgs(query, client, fmt);
      let buffer = "";
      let errBuffer = "";
      const proc = runner(YTDL_BIN, args, { maxBuffer: 1_000_000 });
      proc.stdout?.on("data", (chunk) => {
        buffer += chunk.toString();
      });
      proc.stderr?.on("data", (chunk) => {
        errBuffer += chunk.toString();
      });

      const [code] = await once(proc, "close");
      if (code !== 0) {
        const tail = errBuffer.trim().split("\n").slice(-3).join(" | ");
        lastError = tail ? `yt-dlp failed to fetch info: ${tail}` : "yt-dlp failed to fetch info";
        continue;
      }

      const line = buffer.trim().split("\n")[0];
      if (!line) {
        lastError = "Empty yt-dlp response";
        continue;
      }

      try {
        const parsed = JSON.parse(line);
        const entry = parsed.entries ? parsed.entries[0] : parsed;
        if (!entry?.url) {
          lastError = "No stream URL returned";
          continue;
        }
        return {
          title: entry.title || "Untitled",
          streamUrl: entry.url,
          webpageUrl: entry.webpage_url || entry.original_url || query,
        };
      } catch (err) {
        lastError = err.message;
      }
    }
  }

  const err = new Error(lastError || "yt-dlp failed to fetch info");
  err.code = 1;
  throw err;
}

module.exports = { buildArgs, fetchTrack, isUrl, __setExecFile, __resetExecFile };
