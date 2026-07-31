// Converts an animated image (GIF, WebP, APNG) or a short video into the MP4
// format WhatsApp uses for GIFs: H.264, silent, small, and short.
//
// Runs as a content script instead of a Web Worker because WhatsApp Web's
// Content-Security-Policy (worker-src 'self' blob: data:) blocks workers
// loaded from extension URLs. Decoding and encoding still happen off the main
// thread inside WebCodecs, and the loop yields between frames, so the page
// stays responsive.
//
// Provides __waGifEncode(file, { onProgress, shouldCancel }) -> { buffer, name }.
// Uses the Muxer from vendor/mp4-muxer.js (exposed as __waGifMp4).

(() => {
  if (globalThis.__waGifEncode) return;

  // Transparent pixels are painted onto this color; MP4 video has no alpha.
  const BACKGROUND_COLOR = "#ffffff";

  const MAX_EDGE_PX = 640;            // longest output side
  const MIN_EDGE_PX = 16;             // H.264 encoders refuse frames below 16px
  const MAX_DURATION_US = 10_000_000; // 10s, matching WhatsApp's own GIF limit
  const MAX_FRAMES = 600;
  const KEYFRAME_INTERVAL_US = 2_000_000;

  // GIF frame delays of 0 or 1 hundredths mean "as fast as possible"; players
  // universally treat that as 100ms.
  const MIN_FRAME_US = 10_000;
  const DEFAULT_FRAME_US = 100_000;

  // Videos are resampled at a fixed rate because they are read by seeking.
  const VIDEO_FPS = 20;

  const H264_CODEC = "avc1.42E01F";   // baseline profile, widest device support
  const BITS_PER_PIXEL = 0.1;
  const MIN_BITRATE = 300_000;
  const MAX_BITRATE = 4_000_000;

  // Encoder queue depth before the loop pauses to let it catch up.
  const ENCODER_QUEUE_LIMIT = 8;

  class EncodeError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  // -------------------------------------------------------- type detection ----
  // Detects the real file type from magic bytes; file.type from the OS is
  // often empty or wrong.
  function detectType(bytes) {
    const ascii = (offset, length) =>
      String.fromCharCode(...bytes.subarray(offset, offset + length));

    if (bytes.length >= 6 && ascii(0, 3) === "GIF") return "image/gif";

    if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
      return "image/webp";
    }

    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 &&
      bytes[2] === 0x4e && bytes[3] === 0x47
    ) {
      return isAnimatedPng(bytes) ? "image/apng" : "image/png";
    }

    if (
      bytes.length >= 4 &&
      bytes[0] === 0x1a && bytes[1] === 0x45 &&
      bytes[2] === 0xdf && bytes[3] === 0xa3
    ) {
      return "video/webm";
    }

    if (bytes.length >= 12 && ascii(4, 4) === "ftyp") {
      return ascii(8, 4) === "qt  " ? "video/quicktime" : "video/mp4";
    }

    return "";
  }

  // An animated PNG carries an acTL chunk before the first IDAT.
  function isAnimatedPng(bytes) {
    let offset = 8; // skip PNG signature
    while (offset + 8 <= bytes.length) {
      const length =
        (bytes[offset] << 24) | (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) | bytes[offset + 3];
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (type === "acTL") return true;
      if (type === "IDAT" || type === "IEND") return false;
      if (length < 0) return false;
      offset += 12 + length; // length + type + data + crc
    }
    return false;
  }

  // --------------------------------------------------------- MP4 inspection ----
  // Reads an MP4's box tree to find its tracks, size, and duration. An MP4 may
  // only skip conversion once this proves it is already silent and in bounds —
  // an audio track would otherwise survive into WhatsApp, where GIFs must be
  // silent.
  function readMp4Info(bytes) {
    const CONTAINER_BOXES = new Set([
      "moov", "trak", "mdia", "minf", "stbl", "edts", "udta",
    ]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const info = {
      hasAudio: false, hasVideo: false, width: 0, height: 0, durationSec: 0,
    };
    let currentTrackSize = null;

    const boxName = (offset) =>
      String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);

    function walk(start, end) {
      let offset = start;
      while (offset + 8 <= end) {
        let size = view.getUint32(offset);
        const type = boxName(offset + 4);
        let headerSize = 8;

        if (size === 1) {
          // 64-bit box size
          if (offset + 16 > end) return;
          size = view.getUint32(offset + 8) * 4294967296 + view.getUint32(offset + 12);
          headerSize = 16;
        } else if (size === 0) {
          size = end - offset; // box runs to end of file
        }
        if (size < headerSize || offset + size > end) return; // truncated

        const body = offset + headerSize;
        const bodyEnd = offset + size;

        if (type === "mvhd" && body + 20 <= bodyEnd) {
          const version = bytes[body];
          if (version === 1 && body + 32 <= bodyEnd) {
            const timescale = view.getUint32(body + 20);
            const duration =
              view.getUint32(body + 24) * 4294967296 + view.getUint32(body + 28);
            if (timescale) info.durationSec = duration / timescale;
          } else if (body + 20 <= bodyEnd) {
            const timescale = view.getUint32(body + 12);
            const duration = view.getUint32(body + 16);
            if (timescale) info.durationSec = duration / timescale;
          }
        } else if (type === "tkhd" && bodyEnd - 8 >= body) {
          // width and height are the trailing pair of 16.16 fixed-point values
          currentTrackSize = {
            width: Math.round(view.getUint32(bodyEnd - 8) / 65536),
            height: Math.round(view.getUint32(bodyEnd - 4) / 65536),
          };
        } else if (type === "hdlr" && body + 12 <= bodyEnd) {
          const handler = boxName(body + 8);
          if (handler === "soun") info.hasAudio = true;
          if (handler === "vide") {
            info.hasVideo = true;
            if (currentTrackSize) {
              info.width = currentTrackSize.width;
              info.height = currentTrackSize.height;
            }
          }
        }

        if (CONTAINER_BOXES.has(type)) {
          if (type === "trak") currentTrackSize = null;
          walk(body, bodyEnd);
        }
        offset = bodyEnd;
      }
    }

    try {
      walk(0, bytes.byteLength);
    } catch {
      return null; // malformed — force the conversion path
    }
    return info;
  }

  // True when an MP4 already meets every rule conversion would enforce.
  function isSafeToPassThrough(info) {
    return !!info
      && info.hasVideo
      && !info.hasAudio
      && info.width > 0 && info.height > 0
      && info.width % 2 === 0 && info.height % 2 === 0
      && Math.max(info.width, info.height) <= MAX_EDGE_PX
      && info.durationSec > 0
      && info.durationSec <= MAX_DURATION_US / 1_000_000 + 0.05;
  }

  // ---------------------------------------------------------------- helpers ----
  // Scales to fit MAX_EDGE_PX. H.264 needs even dimensions, and encoders
  // refuse frames smaller than 16px, so tiny inputs get upscaled to the floor.
  function getOutputSize(sourceWidth, sourceHeight) {
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(sourceWidth, sourceHeight));
    const clamp = (n) => Math.max(MIN_EDGE_PX, Math.floor(n * scale / 2) * 2);
    return { width: clamp(sourceWidth), height: clamp(sourceHeight) };
  }

  function normalizeFrameDuration(rawDurationUs) {
    if (rawDurationUs == null || rawDurationUs <= MIN_FRAME_US) return DEFAULT_FRAME_US;
    return rawDurationUs;
  }

  function pickBitrate(width, height, fps) {
    const raw = width * height * fps * BITS_PER_PIXEL;
    return Math.round(Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, raw)));
  }

  // Hands the main thread back between frames so WhatsApp keeps painting.
  const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));

  // --------------------------------------------------------------- pipeline ----
  // Shared by both input paths: takes painted canvases in, produces an MP4.
  async function createEncoderPipeline(width, height, fps) {
    const { Muxer, ArrayBufferTarget } = globalThis.__waGifMp4 || {};
    if (!Muxer) throw new EncodeError("internal", "muxer failed to load");

    const config = {
      codec: H264_CODEC,
      width,
      height,
      bitrate: pickBitrate(width, height, fps),
      framerate: Math.max(1, Math.round(fps)),
      avc: { format: "avc" },
      latencyMode: "quality",
    };

    const support = await VideoEncoder.isConfigSupported(config);
    if (!support.supported) {
      throw new EncodeError("unsupported", "this browser can't encode H.264 video");
    }

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: "avc", width, height },
      fastStart: "in-memory", // metadata first, so the clip plays immediately
    });

    let encoderError = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (err) => { encoderError = err; },
    });
    encoder.configure(config);

    let lastKeyframeTimestamp = -Infinity;

    // Pauses when the encoder queue backs up, so a long clip can't pile
    // hundreds of raw frames into memory.
    function waitForQueueSpace() {
      if (encoder.encodeQueueSize <= ENCODER_QUEUE_LIMIT) return Promise.resolve();
      return new Promise((resolve) => {
        const check = () => {
          if (encoder.encodeQueueSize <= ENCODER_QUEUE_LIMIT) {
            encoder.removeEventListener("dequeue", check);
            resolve();
          }
        };
        encoder.addEventListener("dequeue", check);
        check();
      });
    }

    return {
      async addFrame(canvas, timestampUs, durationUs) {
        if (encoderError) throw encoderError;
        const keyFrame = timestampUs - lastKeyframeTimestamp >= KEYFRAME_INTERVAL_US;
        if (keyFrame) lastKeyframeTimestamp = timestampUs;
        const frame = new VideoFrame(canvas, {
          timestamp: timestampUs,
          duration: durationUs,
        });
        encoder.encode(frame, { keyFrame });
        frame.close();
        await waitForQueueSpace();
      },

      async finish() {
        await encoder.flush();
        if (encoderError) throw encoderError;
        encoder.close();
        muxer.finalize();
        return muxer.target.buffer;
      },

      abort() {
        if (encoder.state !== "closed") encoder.close();
      },
    };
  }

  // --------------------------------------------------- animated image input ----
  async function convertAnimatedImage(bytes, mimeType, opts) {
    const decoder = new ImageDecoder({ data: bytes, type: mimeType });
    await decoder.tracks.ready;
    await decoder.completed;

    const track = decoder.tracks.selectedTrack;
    if (!track) {
      decoder.close();
      throw new EncodeError("decode", "couldn't read that image");
    }
    if (!track.animated || track.frameCount < 2) {
      decoder.close();
      throw new EncodeError("static", "that image isn't animated");
    }

    // The first frame decides the output size and the frame-rate estimate.
    const firstFrame = (await decoder.decode({ frameIndex: 0 })).image;
    const { width, height } = getOutputSize(firstFrame.displayWidth, firstFrame.displayHeight);
    const firstDuration = normalizeFrameDuration(firstFrame.duration);
    const fps = Math.min(50, Math.max(1, 1_000_000 / firstDuration));

    // Cap the frame count so progress reflects what will actually be encoded.
    const totalFrames = Math.min(
      track.frameCount,
      MAX_FRAMES,
      Math.ceil(MAX_DURATION_US / firstDuration)
    );

    let pipeline = null;
    let undrawnFrame = firstFrame; // closed in finally if the loop bails early

    try {
      pipeline = await createEncoderPipeline(width, height, fps);

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d", { alpha: false });

      let timestampUs = 0;
      let encodedCount = 0;

      for (let i = 0; i < totalFrames; i++) {
        if (opts.shouldCancel && opts.shouldCancel()) {
          throw new EncodeError("cancelled", "Cancelled");
        }

        if (i > 0) {
          try {
            undrawnFrame = (await decoder.decode({ frameIndex: i })).image;
          } catch {
            break; // frameCount can overshoot what's actually decodable
          }
        }
        const image = undrawnFrame;
        const durationUs = normalizeFrameDuration(image.duration);

        ctx.fillStyle = BACKGROUND_COLOR;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        image.close();
        undrawnFrame = null;

        await pipeline.addFrame(canvas, timestampUs, durationUs);

        timestampUs += durationUs;
        encodedCount++;
        if (opts.onProgress) opts.onProgress("encode", encodedCount, totalFrames);

        await yieldToPage();
        if (timestampUs >= MAX_DURATION_US) break;
      }

      if (!encodedCount) throw new EncodeError("decode", "no frames could be read");

      if (opts.onProgress) opts.onProgress("mux", totalFrames, totalFrames);
      return await pipeline.finish();
    } catch (err) {
      if (pipeline) pipeline.abort();
      throw err;
    } finally {
      if (undrawnFrame) undrawnFrame.close();
      decoder.close();
    }
  }

  // ------------------------------------------------------------ video input ----
  // Reads a video by seeking a detached <video> element and painting each
  // sample onto a canvas. Only video frames are ever read, so any audio track
  // is dropped as a side effect — WhatsApp GIFs must be silent.
  async function convertVideo(bytes, mimeType, opts) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType || "video/mp4" }));
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    let pipeline = null;
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new EncodeError("decode", "that video took too long to load")),
          20000
        );
        video.onloadeddata = () => { clearTimeout(timer); resolve(); };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new EncodeError("decode", "couldn't read that video"));
        };
        video.src = url;
      });

      if (!video.videoWidth || !video.videoHeight) {
        throw new EncodeError("decode", "that file has no video track");
      }

      const { width, height } = getOutputSize(video.videoWidth, video.videoHeight);

      const sourceDuration = Number.isFinite(video.duration) ? video.duration : 0;
      const clipSeconds = sourceDuration > 0
        ? Math.min(sourceDuration, MAX_DURATION_US / 1_000_000)
        : MAX_DURATION_US / 1_000_000;

      const frameUs = Math.round(1_000_000 / VIDEO_FPS);
      const totalFrames = Math.max(
        1,
        Math.min(MAX_FRAMES, Math.round(clipSeconds * VIDEO_FPS))
      );

      pipeline = await createEncoderPipeline(width, height, VIDEO_FPS);

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d", { alpha: false });

      const seekTo = (timeSec) => new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          video.removeEventListener("seeked", done);
          resolve();
        };
        video.addEventListener("seeked", done);
        video.currentTime = timeSec;
        setTimeout(done, 3000); // don't hang on a seek that never completes
      });

      for (let i = 0; i < totalFrames; i++) {
        if (opts.shouldCancel && opts.shouldCancel()) {
          throw new EncodeError("cancelled", "Cancelled");
        }

        await seekTo(Math.min(i / VIDEO_FPS, Math.max(0, clipSeconds - 0.001)));

        ctx.fillStyle = BACKGROUND_COLOR;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(video, 0, 0, width, height);

        await pipeline.addFrame(canvas, i * frameUs, frameUs);

        if (opts.onProgress) opts.onProgress("encode", i + 1, totalFrames);
        await yieldToPage();
      }

      if (opts.onProgress) opts.onProgress("mux", totalFrames, totalFrames);
      return await pipeline.finish();
    } catch (err) {
      if (pipeline) pipeline.abort();
      throw err;
    } finally {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load(); // releases the decoder
    }
  }

  // ------------------------------------------------------------------ entry ----
  globalThis.__waGifEncode = async function (file, opts) {
    opts = opts || {};

    if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
      throw new EncodeError("unsupported", "this browser is missing WebCodecs");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length) throw new EncodeError("empty", "that file is empty");

    const mimeType = detectType(bytes) || file.type;
    const outputName = (file.name || "clip").replace(/\.[^.]+$/, "") + ".mp4";

    if (mimeType.startsWith("video/")) {
      if (mimeType === "video/mp4" && isSafeToPassThrough(readMp4Info(bytes))) {
        if (opts.onProgress) opts.onProgress("mux", 1, 1);
        return { buffer: bytes.buffer, name: outputName };
      }
      return { buffer: await convertVideo(bytes, mimeType, opts), name: outputName };
    }

    if (typeof ImageDecoder === "undefined") {
      throw new EncodeError("unsupported", "this browser is missing WebCodecs");
    }
    if (!(await ImageDecoder.isTypeSupported(mimeType))) {
      throw new EncodeError(
        "unsupported",
        "that file type isn't supported — try a GIF, WebP, APNG or MP4"
      );
    }

    return { buffer: await convertAnimatedImage(bytes, mimeType, opts), name: outputName };
  };
})();
