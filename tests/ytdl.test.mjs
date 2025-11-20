import { afterEach, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import * as ytdl from "../src/ytdl.js";

function mockExecFile(payload) {
  ytdl.__setExecFile(() => {
    const proc = new EventEmitter();
    proc.stdout = new Readable({ read() {} });
    setTimeout(() => {
      proc.stdout.emit("data", Buffer.from(`${payload}\n`));
      proc.emit("close", 0);
    }, 0);
    return proc;
  });
}

afterEach(() => {
  ytdl.__resetExecFile();
});

describe("ytdl flags", () => {
  it("includes safe flags", () => {
    const args = ytdl.buildArgs("hello");
    expect(args).toContain("--no-playlist");
    expect(args).toContain("--no-check-certificates");
    expect(args).toContain("--force-ipv4");
    expect(args).toContain("youtube:player_client=android");
  });

  it("prefixes searches with ytsearch1", () => {
    const args = ytdl.buildArgs("hello world");
    expect(args.at(-1)).toBe("ytsearch1:hello world");
  });

  it("passes URLs directly", () => {
    const url = "https://youtube.com/watch?v=abc";
    const args = ytdl.buildArgs(url);
    expect(args.at(-1)).toBe(url);
  });
});

describe("fetchTrack", () => {
  it("parses search result entry", async () => {
    const restore = mockExecFile(
      JSON.stringify({
        entries: [{ title: "song", url: "stream", webpage_url: "web" }],
      })
    );
    const track = await ytdl.fetchTrack("query");
    expect(track.title).toBe("song");
    expect(track.streamUrl).toBe("stream");
    expect(track.webpageUrl).toBe("web");
  });

  it("parses direct result", async () => {
    const restore = mockExecFile(
      JSON.stringify({ title: "direct", url: "stream2", webpage_url: "page2" })
    );
    const track = await ytdl.fetchTrack("https://youtube.com/watch?v=xyz");
    expect(track.title).toBe("direct");
    expect(track.streamUrl).toBe("stream2");
    expect(track.webpageUrl).toBe("page2");
  });
});
