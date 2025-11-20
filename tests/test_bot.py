import asyncio
import os
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import bot as music_bot


def test_ytdl_options_are_safe_for_no_login():
    # Ensure options discourage playlist downloads and don't rely on auth.
    opts = music_bot.YTDL_OPTIONS
    assert opts.get("noplaylist") is True
    assert opts.get("default_search") == "ytsearch1"
    assert opts.get("quiet") is True
    assert opts.get("restrictfilenames") is True


@pytest.mark.asyncio
async def test_fetch_track_uses_search_prefix(monkeypatch):
    called = []

    class DummyYTDL:
        def extract_info(self, target, download=False):
            called.append((target, download))
            return {"entries": [{"title": "sample", "url": "stream", "webpage_url": "page"}]}

    monkeypatch.setattr(music_bot, "build_ytdl", lambda: DummyYTDL())
    track = await music_bot.fetch_track("hello world", "tester", asyncio.get_running_loop())
    assert called == [("ytsearch1:hello world", False)]
    assert track.title == "sample"
    assert track.stream_url == "stream"
    assert track.webpage_url == "page"
    assert track.requester == "tester"


@pytest.mark.asyncio
async def test_fetch_track_passes_through_url(monkeypatch):
    called = []

    class DummyYTDL:
        def extract_info(self, target, download=False):
            called.append((target, download))
            return {"title": "url-title", "url": "stream-url", "webpage_url": "web-url"}

    monkeypatch.setattr(music_bot, "build_ytdl", lambda: DummyYTDL())
    target_url = "https://youtube.com/watch?v=abc123"
    track = await music_bot.fetch_track(target_url, "tester", asyncio.get_running_loop())
    assert called == [(target_url, False)]
    assert track.title == "url-title"
    assert track.stream_url == "stream-url"
    assert track.webpage_url == "web-url"


@pytest.mark.asyncio
async def test_music_session_adds_to_queue():
    bot_instance = music_bot.MusicBot()
    session = bot_instance.get_session(guild_id=99)
    track = music_bot.Track("t", "s", "w", "r")
    await session.add_track(track)
    queued = await session.queue.get()
    assert queued == track


def test_music_bot_reuses_session_per_guild():
    bot_instance = music_bot.MusicBot()
    first = bot_instance.get_session(guild_id=1)
    second = bot_instance.get_session(guild_id=1)
    third = bot_instance.get_session(guild_id=2)
    assert first is second
    assert first is not third
