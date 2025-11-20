import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

process.env.MOCK_VOICE = "1";

let bot;

describe("MusicSession queueing", () => {
  let createResourceMock;

  beforeEach(() => {
    vi.resetModules();
    return import("../src/bot.js").then((module) => {
      bot = module;
      createResourceMock = vi.fn().mockResolvedValue({
        metadata: { proc: { killed: false, kill: vi.fn() } },
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enqueues and starts playing first track", async () => {
    const session = new bot.MusicSession("guild-1", createResourceMock);
    await session.enqueue({ title: "t", streamUrl: "url", webpageUrl: "w" });
    expect(createResourceMock).toHaveBeenCalledWith("url");
    expect(session.current.title).toBe("t");
  });

  it("skip stops playback", () => {
    const session = new bot.MusicSession("guild-1");
    session.player.stop = vi.fn();
    session.skip();
    expect(session.player.stop).toHaveBeenCalled();
  });
});
