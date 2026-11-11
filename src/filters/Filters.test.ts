import { describe, it, expect } from "vitest";
import { VolumeFilter, EqualizerFilter, KaraokeFilter, TimescaleFilter } from "./Filters.ts";
import { FilterChain } from "./FilterChain.ts";

describe("VolumeFilter", () => {
  it("should serialize volume", () => {
    const filter = new VolumeFilter(0.5);
    expect(filter.serialize()).toEqual({ volume: 0.5 });
  });

  it("should default to 1.0", () => {
    const filter = new VolumeFilter();
    expect(filter.serialize()).toEqual({ volume: 1.0 });
  });
});

describe("EqualizerFilter", () => {
  it("should serialize bands", () => {
    const filter = new EqualizerFilter([{ band: 0, gain: 0.2 }]);
    expect(filter.serialize()).toEqual({
      equalizer: [{ band: 0, gain: 0.2 }],
    });
  });

  it("should return empty if no bands", () => {
    const filter = new EqualizerFilter();
    expect(filter.serialize()).toEqual({});
  });

  it("should set individual bands", () => {
    const filter = new EqualizerFilter();
    filter.setBand(0, 0.2).setBand(1, -0.1);
    expect(filter.serialize()).toEqual({
      equalizer: [
        { band: 0, gain: 0.2 },
        { band: 1, gain: -0.1 },
      ],
    });
  });

  it("should clear bands", () => {
    const filter = new EqualizerFilter([{ band: 0, gain: 0.2 }]);
    filter.clear();
    expect(filter.serialize()).toEqual({});
  });
});

describe("TimescaleFilter", () => {
  it("should serialize with defaults", () => {
    const filter = new TimescaleFilter();
    expect(filter.serialize()).toEqual({
      timescale: { speed: 1.0, pitch: 1.0, rate: 1.0 },
    });
  });

  it("should override settings", () => {
    const filter = new TimescaleFilter({ speed: 2.0 });
    expect(filter.serialize()).toEqual({
      timescale: { speed: 2.0, pitch: 1.0, rate: 1.0 },
    });
  });

  it("should chain setters", () => {
    const filter = new TimescaleFilter();
    filter.setSpeed(1.5).setPitch(1.2).setRate(1.1);
    expect(filter.serialize()).toEqual({
      timescale: { speed: 1.5, pitch: 1.2, rate: 1.1 },
    });
  });
});

describe("KaraokeFilter", () => {
  it("should return empty with no settings", () => {
    const filter = new KaraokeFilter();
    expect(filter.serialize()).toEqual({});
  });

  it("should serialize with settings", () => {
    const filter = new KaraokeFilter({ level: 1.0 });
    expect(filter.serialize()).toEqual({ karaoke: { level: 1.0 } });
  });
});

describe("FilterChain", () => {
  it("should add and retrieve filters", () => {
    const chain = new FilterChain();
    const filter = new VolumeFilter(0.5);

    chain.add(filter);
    expect(chain.get("volume")).toBe(filter);
    expect(chain.has("volume")).toBe(true);
  });

  it("should remove filters", () => {
    const chain = new FilterChain();
    chain.add(new VolumeFilter(0.5));
    chain.remove("volume");
    expect(chain.has("volume")).toBe(false);
  });

  it("should serialize to payload", () => {
    const chain = new FilterChain();
    chain.add(new VolumeFilter(0.5));
    chain.add(new TimescaleFilter({ speed: 2.0 }));

    const payload = chain.toPayload();
    expect(payload.volume).toBe(0.5);
    expect(payload.timescale).toEqual({ speed: 2.0, pitch: 1.0, rate: 1.0 });
  });

  it("should clear all filters", () => {
    const chain = new FilterChain();
    chain.add(new VolumeFilter(0.5));
    chain.add(new EqualizerFilter());
    chain.clear();

    expect(chain.getAll()).toHaveLength(0);
  });

  it("should clone", () => {
    const chain = new FilterChain();
    chain.add(new VolumeFilter(0.5));

    const clone = chain.clone();
    expect(clone.has("volume")).toBe(true);
    // The clone owns independent instances — same payload, not the same object,
    // so mutating the clone can never affect the original chain
    expect(clone.get("volume")).not.toBe(chain.get("volume"));
    expect(clone.toPayload()).toEqual(chain.toPayload());

    clone.remove("volume");
    expect(chain.has("volume")).toBe(true);
  });

  it("should apply payload to rebuild filters", () => {
    const chain = new FilterChain();
    chain.apply({
      volume: 0.3,
      equalizer: [{ band: 0, gain: 0.2 }],
      timescale: { speed: 1.5, pitch: 1.0, rate: 1.0 },
    });

    expect(chain.has("volume")).toBe(true);
    expect(chain.has("equalizer")).toBe(true);
    expect(chain.has("timescale")).toBe(true);
    expect(chain.has("karaoke")).toBe(false);

    const payload = chain.toPayload();
    expect(payload.volume).toBe(0.3);
  });

  it("should rebuild all filter types from payload", () => {
    const chain = new FilterChain();
    chain.apply({
      karaoke: { level: 0.5 },
      tremolo: { frequency: 2.0, depth: 0.5 },
      vibrato: { frequency: 2.0, depth: 0.5 },
      rotation: { rotationHz: 0.2 },
      distortion: { sinOffset: 0.0, sinScale: 1.0 },
      channelMix: { leftToLeft: 1.0, leftToRight: 0.0 },
      lowPass: { smoothing: 20.0 },
    });

    expect(chain.has("karaoke")).toBe(true);
    expect(chain.has("tremolo")).toBe(true);
    expect(chain.has("vibrato")).toBe(true);
    expect(chain.has("rotation")).toBe(true);
    expect(chain.has("distortion")).toBe(true);
    expect(chain.has("channelMix")).toBe(true);
    expect(chain.has("lowPass")).toBe(true);

    const payload = chain.toPayload();
    expect(payload.karaoke).toEqual({ level: 0.5 });
    expect(payload.lowPass).toEqual({ smoothing: 20.0 });
  });

  it("should apply Pop, Soft, Rock, TrebleBass, Classical, Electronic EQ presets", () => {
    const chain = new FilterChain();
    chain.setPop();
    expect(chain.has("equalizer")).toBe(true);

    chain.setSoft();
    expect(chain.has("equalizer")).toBe(true);

    chain.setRock();
    expect(chain.has("equalizer")).toBe(true);

    chain.setTrebleBass();
    expect(chain.has("equalizer")).toBe(true);

    chain.setClassical();
    expect(chain.has("equalizer")).toBe(true);

    chain.setElectronic();
    expect(chain.has("equalizer")).toBe(true);

    chain.setPop(false);
    expect(chain.has("equalizer")).toBe(false);
  });
});
