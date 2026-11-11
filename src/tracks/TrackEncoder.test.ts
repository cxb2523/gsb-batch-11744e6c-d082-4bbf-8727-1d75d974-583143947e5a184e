import { describe, it, expect } from "vitest";
import { Track } from "./Track.ts";
import { encodeTrackInfo, decodeTrackInfo } from "./TrackEncoder.ts";
import type { TrackInfo } from "../types/protocol.ts";

const info: TrackInfo = {
  identifier: "dQw4w9WgXcQ",
  isSeekable: true,
  author: "RickAstleyVEVO",
  length: 212000,
  isStream: false,
  position: 0,
  title: "Never Gonna Give You Up",
  uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  artworkUrl: null,
  isrc: null,
  sourceName: "youtube",
};

const realEncodedTrack =
  "QAAAjQIAJVJpY2sgQXN0bGV5IC0gTmV2ZXIgR29ubmEgR2l2ZSBZb3UgVXAADlJpY2tBc3RsZXlWRVZPAAAAAAADPCAAC2RRdzR3OVdnWGNRAAEAK2h0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9ZFF3NHc5V2dYY1EAB3lvdXR1YmUAAAAAAAAAAA==";

describe("TrackEncoder", () => {
  it("decodes a real Lavalink v4 encoded track", () => {
    const decoded = decodeTrackInfo(realEncodedTrack);
    expect(decoded.title).toBe("Rick Astley - Never Gonna Give You Up");
    expect(decoded.author).toBe("RickAstleyVEVO");
    expect(decoded.identifier).toBe("dQw4w9WgXcQ");
    expect(decoded.length).toBe(212000);
    expect(decoded.sourceName).toBe("youtube");
    expect(decoded.uri).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(decoded.isStream).toBe(false);
    expect(decoded.isSeekable).toBe(true);
  });

  it("round-trips encode -> decode -> encode identically", () => {
    const encoded = encodeTrackInfo(info);
    const decoded = decodeTrackInfo(encoded);
    expect(decoded).toEqual(info);
    expect(encodeTrackInfo(decoded)).toBe(encoded);
  });

  it("derives isSeekable from isStream on decode", () => {
    const encoded = encodeTrackInfo({ ...info, isStream: true, isSeekable: false });
    const decoded = decodeTrackInfo(encoded);
    expect(decoded.isStream).toBe(true);
    expect(decoded.isSeekable).toBe(false);
  });

  it("handles multi-byte UTF-8 titles and authors", () => {
    const track = Track.build({ title: "日本語の曲 🎵", author: "作詞者", uri: "https://x" });
    const decoded = Track.decode(track.encoded);
    expect(decoded.title).toBe("日本語の曲 🎵");
    expect(decoded.author).toBe("作詞者");
  });

  it("omits null uri from the payload and decodes it back as null", () => {
    const encoded = encodeTrackInfo({ ...info, uri: null });
    expect(decodeTrackInfo(encoded).uri).toBeNull();
  });

  it("throws on empty input", () => {
    expect(() => decodeTrackInfo("")).toThrow();
  });

  it("throws on truncated input", () => {
    const short = Buffer.from(encodeTrackInfo(info), "base64").subarray(0, 4).toString("base64");
    expect(() => decodeTrackInfo(short)).toThrow();
  });
});

describe("Track.build", () => {
  it("creates a playable track without a node", () => {
    const track = Track.build({ title: "Custom Track", author: "Me", sourceName: "local", length: 60000 });
    expect(track.encoded).toBeTruthy();
    expect(track.title).toBe("Custom Track");
    expect(track.duration).toBe(60000);
    expect(track.sourceName).toBe("local");
    expect(track.isSeekable).toBe(true);
    expect(track.uri).toBeNull();
  });

  it("carries the requester and defaults identifier to the title", () => {
    const requester = { id: "user-1" };
    const track = Track.build({ title: "No Identifier", author: "A" }, requester);
    expect(track.identifier).toBe("No Identifier");
    expect(track.requester).toBe(requester);
  });
});
