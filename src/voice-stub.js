const { EventEmitter } = require("node:events");

const AudioPlayerStatus = { Idle: "idle" };
const NoSubscriberBehavior = { Pause: "pause" };
const StreamType = { Raw: "raw" };
const VoiceConnectionStatus = { Ready: "ready" };

const createAudioPlayer = () => {
  const emitter = new EventEmitter();
  emitter.state = { resource: null };
  emitter.play = (res) => {
    emitter.state.resource = res;
    setImmediate(() => emitter.emit(AudioPlayerStatus.Idle));
  };
  emitter.stop = () => {};
  return emitter;
};

const createAudioResource = (stream, opts) => ({ stream, ...opts });
const entersState = async (val) => val;
const joinVoiceChannel = () => ({ subscribe: () => {}, destroy: () => {} });

module.exports = {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
};
