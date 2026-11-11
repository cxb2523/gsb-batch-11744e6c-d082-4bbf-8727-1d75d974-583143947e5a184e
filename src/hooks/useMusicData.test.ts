import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_FETCH_DELAY_MS } from "../constants";
import { MusicDataError } from "../types";
import {
    AdapterFailureReason,
    MusicLoadOutcome,
    type MusicTrack,
    useMusicData,
} from "./useMusicData";

const staleTracks: MusicTrack[] = [
    {
        id: "stale",
        name: "Stale Track",
        artist: "Old",
        url: "https://example.test/stale.mp3",
        cover: "",
        lrc: "",
    },
];

const playlistPayload = [
    {
        id: "song-1",
        name: "Song One",
        artist: "Artist One",
        url: "https://cdn.example.test/song-1.mp3",
        pic: "https://cdn.example.test/song-1.jpg",
        lrc: "",
    },
];

const fixedTrackPayload = [
    {
        name: "Fixed Track",
        artist: "Artist One",
        url: "https://cdn.example.test/fixed.mp3",
    },
];

// 用 hoisted 状态让个别用例可以替换 parseResponse，构造解析错误
const adapterMockState = vi.hoisted(() => ({
    parseResponseOverride: undefined as
        | ((data: unknown) => MusicTrack[])
        | undefined,
}));

vi.mock("../utils/musicApiAdapters", async () => {
    const actual = await vi.importActual<
        typeof import("../utils/musicApiAdapters")
    >("../utils/musicApiAdapters");
    const parseResponse = (data: unknown): MusicTrack[] => {
        if (adapterMockState.parseResponseOverride) {
            return adapterMockState.parseResponseOverride(data);
        }
        return actual.metingAdapter.parseResponse(data);
    };
    return {
        ...actual,
        getAdapters: () => [
            {
                buildUrl: () => "https://example.test/primary",
                buildTrackUrl: ({ id }: { id: string }) =>
                    `https://example.test/primary-song?id=${encodeURIComponent(id)}`,
                parseResponse,
                timeoutMs: 1000,
            },
            {
                buildUrl: () => "https://example.test/fallback",
                buildTrackUrl: ({ id }: { id: string }) =>
                    `https://example.test/fallback-song?id=${encodeURIComponent(id)}`,
                parseResponse,
                timeoutMs: 1000,
            },
        ],
    };
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
    adapterMockState.parseResponseOverride = undefined;
});

const flushLoad = async () => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(API_FETCH_DELAY_MS);
    });
};

describe("useMusicData", () => {
    it("does not commit tracks when aborted after response resolves but before body", async () => {
        vi.useFakeTimers();

        let resolveJson!: (value: MusicTrack[]) => void;
        const jsonPromise = new Promise<MusicTrack[]>((resolve) => {
            resolveJson = resolve;
        });

        const fetchMock = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: () => jsonPromise,
        }));
        vi.stubGlobal("fetch", fetchMock);

        const { result, unmount } = renderHook(() =>
            useMusicData({
                server: "netease",
                type: "playlist",
                id: "1",
            }),
        );

        await flushLoad();

        expect(fetchMock).toHaveBeenCalled();
        expect(result.current.audioList).toEqual([]);

        unmount();

        await act(async () => {
            resolveJson(staleTracks);
            await Promise.resolve();
        });

        expect(result.current.audioList).toEqual([]);
    });

    it("reports an invalid playlist separately from a service outage", async () => {
        vi.useFakeTimers();

        // 上游对不存在的歌单同样返回 HTTP 200，内容为错误对象
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                status: 200,
                json: async () => ({ error: "unknown playlist id" }),
            })),
        );

        const { result } = renderHook(() =>
            useMusicData({ server: "netease", type: "playlist", id: "404" }),
        );

        await flushLoad();

        expect(result.current.error).toBe(MusicDataError.PLAYLIST_UNAVAILABLE);
        // 两个源都判定为空歌单，结论才是歌单不可用
        expect(result.current.loadDiagnostic).toEqual({
            attempts: [
                {
                    adapterIndex: 0,
                    success: false,
                    failureReason: AdapterFailureReason.EMPTY_PLAYLIST,
                },
                {
                    adapterIndex: 1,
                    success: false,
                    failureReason: AdapterFailureReason.EMPTY_PLAYLIST,
                },
            ],
            outcome: MusicLoadOutcome.PLAYLIST_UNAVAILABLE,
            activeAdapterIndex: null,
        });
    });

    it("stays conservative when one source fails and another reports an empty playlist", async () => {
        vi.useFakeTimers();

        let call = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                call += 1;
                if (call === 1) throw new TypeError("Failed to fetch");
                return {
                    ok: true,
                    status: 200,
                    json: async () => [],
                };
            }),
        );

        const { result } = renderHook(() =>
            useMusicData({ server: "netease", type: "playlist", id: "1" }),
        );

        await flushLoad();

        expect(result.current.error).toBe(MusicDataError.SERVICE_UNAVAILABLE);
        expect(result.current.loadDiagnostic).toEqual({
            attempts: [
                {
                    adapterIndex: 0,
                    success: false,
                    failureReason: AdapterFailureReason.NETWORK_OR_HTTP,
                },
                {
                    adapterIndex: 1,
                    success: false,
                    failureReason: AdapterFailureReason.EMPTY_PLAYLIST,
                },
            ],
            outcome: MusicLoadOutcome.SERVICE_UNAVAILABLE,
            activeAdapterIndex: null,
        });
    });

    it("reports a service outage when the request fails at the network layer", async () => {
        vi.useFakeTimers();

        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            }),
        );

        const { result } = renderHook(() =>
            useMusicData({ server: "netease", type: "playlist", id: "1" }),
        );

        await flushLoad();

        expect(result.current.error).toBe(MusicDataError.SERVICE_UNAVAILABLE);
        expect(result.current.loadDiagnostic?.outcome).toBe(
            MusicLoadOutcome.SERVICE_UNAVAILABLE,
        );
        expect(
            result.current.loadDiagnostic?.attempts.every(
                (attempt) =>
                    attempt.failureReason ===
                    AdapterFailureReason.NETWORK_OR_HTTP,
            ),
        ).toBe(true);
    });

    it("records a single successful attempt when the first source works", async () => {
        vi.useFakeTimers();

        const fetchMock = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => playlistPayload,
        }));
        vi.stubGlobal("fetch", fetchMock);

        const { result } = renderHook(() =>
            useMusicData({ server: "netease", type: "playlist", id: "1" }),
        );

        await flushLoad();

        expect(result.current.audioList).toHaveLength(1);
        expect(result.current.activeAdapterIndex).toBe(0);
        expect(result.current.error).toBeNull();
        expect(result.current.loadDiagnostic).toEqual({
            attempts: [
                {
                    adapterIndex: 0,
                    success: true,
                    failureReason: null,
                },
            ],
            outcome: MusicLoadOutcome.SUCCESS,
            activeAdapterIndex: 0,
        });
        // 诊断写入是本地 state 更新，不得诱发额外网络请求
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("classifies a timed-out source as timeout and continues to the next source", async () => {
        vi.useFakeTimers();

        let call = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (
                    _url: string,
                    init?: RequestInit,
                ): Promise<{
                    ok: boolean;
                    status: number;
                    json: () => unknown;
                }> => {
                    call += 1;
                    if (call === 1) {
                        // 模拟超时：fetch 只在 abort 时 reject，由 fetchWithTimeout 转成 TimeoutError
                        return new Promise((_resolve, reject) => {
                            init?.signal?.addEventListener("abort", () => {
                                reject(
                                    new DOMException(
                                        "The operation was aborted.",
                                        "AbortError",
                                    ),
                                );
                            });
                        });
                    }
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        json: async () => playlistPayload,
                    });
                },
            ),
        );

        const { result } = renderHook(() =>
            useMusicData({ server: "netease", type: "playlist", id: "1" }),
        );

        await flushLoad();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });

        expect(result.current.activeAdapterIndex).toBe(1);
        expect(result.current.loadDiagnostic).toEqual({
            attempts: [
                {
                    adapterIndex: 0,
                    success: false,
                    failureReason: AdapterFailureReason.TIMEOUT,
                },
                {
                    adapterIndex: 1,
                    success: true,
                    failureReason: null,
                },
            ],
            outcome: MusicLoadOutcome.SUCCESS,
            activeAdapterIndex: 1,
        });
    });

    it("classifies a non-empty-playlist parse failure as a parse error and service outage", async () => {
        vi.useFakeTimers();

        adapterMockState.parseResponseOverride = () => {
            throw new Error("Unexpected response shape");
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                status: 200,
                json: async () => [{ unexpected: true }],
            })),
        );

        const { result } = renderHook(() =>
            useMusicData({ server: "netease", type: "playlist", id: "1" }),
        );

        await flushLoad();

        expect(result.current.error).toBe(MusicDataError.SERVICE_UNAVAILABLE);
        expect(result.current.loadDiagnostic?.outcome).toBe(
            MusicLoadOutcome.SERVICE_UNAVAILABLE,
        );
        expect(
            result.current.loadDiagnostic?.attempts.every(
                (attempt) =>
                    attempt.failureReason === AdapterFailureReason.PARSE_ERROR,
            ),
        ).toBe(true);
    });
});

describe("useMusicData fetchTrackUrl diagnostics and fallback", () => {
    const renderReadyHook = async () => {
        const rendered = renderHook(() =>
            useMusicData({
                server: "netease",
                type: "playlist",
                id: "1",
            }),
        );
        await flushLoad();
        return rendered;
    };

    it("tries the active source last when every other source fails and returns its url", async () => {
        vi.useFakeTimers();

        const fetchMock = vi.fn(async (url: string) => {
            if (url === "https://example.test/primary") {
                return {
                    ok: true,
                    status: 200,
                    json: async () => playlistPayload,
                };
            }
            if (url.startsWith("https://example.test/fallback-song")) {
                return { ok: false, status: 502, json: async () => ({}) };
            }
            if (url.startsWith("https://example.test/primary-song")) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => fixedTrackPayload,
                };
            }
            throw new Error(`Unexpected url: ${url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const { result } = await renderReadyHook();
        expect(result.current.activeAdapterIndex).toBe(0);

        let resolved: string | null = null;
        await act(async () => {
            resolved = await result.current.fetchTrackUrl("song-1");
        });

        expect(resolved).toBe("https://cdn.example.test/fixed.mp3");

        // 回退顺序：先问非生效源（1），最后兜底当前生效源（0）
        const trackUrls = fetchMock.mock.calls
            .map(([url]) => String(url))
            .filter((url) => url.includes("-song"));
        expect(trackUrls).toEqual([
            "https://example.test/fallback-song?id=song-1",
            "https://example.test/primary-song?id=song-1",
        ]);
        // 同一轮内每个适配器最多请求一次
        expect(new Set(trackUrls).size).toBe(trackUrls.length);

        expect(result.current.trackFetchDiagnostic).toEqual({
            trackId: "song-1",
            attempts: [
                {
                    adapterIndex: 1,
                    success: false,
                    failureReason: AdapterFailureReason.NETWORK_OR_HTTP,
                    isActiveSourceFallback: false,
                },
                {
                    adapterIndex: 0,
                    success: true,
                    failureReason: null,
                    isActiveSourceFallback: true,
                },
            ],
            resolved: true,
            url: "https://cdn.example.test/fixed.mp3",
        });
    });

    it("does not retry the active source when another source resolves a usable url", async () => {
        vi.useFakeTimers();

        const fetchMock = vi.fn(async (url: string) => {
            if (url === "https://example.test/primary") {
                return {
                    ok: true,
                    status: 200,
                    json: async () => playlistPayload,
                };
            }
            if (url.startsWith("https://example.test/fallback-song")) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => fixedTrackPayload,
                };
            }
            throw new Error(`Unexpected url: ${url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const { result } = await renderReadyHook();

        let resolved: string | null = null;
        await act(async () => {
            resolved = await result.current.fetchTrackUrl("song-1");
        });

        expect(resolved).toBe("https://cdn.example.test/fixed.mp3");
        const trackUrls = fetchMock.mock.calls
            .map(([url]) => String(url))
            .filter((url) => url.includes("-song"));
        expect(trackUrls).toEqual([
            "https://example.test/fallback-song?id=song-1",
        ]);
        expect(result.current.trackFetchDiagnostic).toEqual({
            trackId: "song-1",
            attempts: [
                {
                    adapterIndex: 1,
                    success: true,
                    failureReason: null,
                    isActiveSourceFallback: false,
                },
            ],
            resolved: true,
            url: "https://cdn.example.test/fixed.mp3",
        });
    });

    it("never requests the same adapter twice when activeAdapterIndex is null", async () => {
        vi.useFakeTimers();

        // 歌单加载在所有源都失败：activeAdapterIndex 保持 null
        const fetchMock =
            vi.fn<
                (url: string) => Promise<{
                    ok: boolean;
                    status: number;
                    json: () => Promise<Record<string, unknown>>;
                }>
            >();
        fetchMock.mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({}),
        });
        vi.stubGlobal("fetch", fetchMock);

        const { result } = await renderReadyHook();
        expect(result.current.activeAdapterIndex).toBeNull();
        expect(result.current.error).toBe(MusicDataError.SERVICE_UNAVAILABLE);

        let resolved: string | null = null;
        await act(async () => {
            resolved = await result.current.fetchTrackUrl("song-1");
        });

        expect(resolved).toBeNull();

        const trackUrls = fetchMock.mock.calls
            .map(([url]) => String(url))
            .filter((url) => url.includes("-song"));
        expect(trackUrls).toHaveLength(2);
        // 每个适配器在同一轮内只请求一次，无兜底重复
        expect(new Set(trackUrls).size).toBe(2);

        expect(result.current.trackFetchDiagnostic).toEqual({
            trackId: "song-1",
            attempts: [
                {
                    adapterIndex: 0,
                    success: false,
                    failureReason: AdapterFailureReason.NETWORK_OR_HTTP,
                    isActiveSourceFallback: false,
                },
                {
                    adapterIndex: 1,
                    success: false,
                    failureReason: AdapterFailureReason.NETWORK_OR_HTTP,
                    isActiveSourceFallback: false,
                },
            ],
            resolved: false,
            url: null,
        });
    });

    it("records empty-playlist failures during track fallback, including the active-source last try", async () => {
        vi.useFakeTimers();

        const fetchMock = vi.fn(async (url: string) => {
            if (url === "https://example.test/primary") {
                return {
                    ok: true,
                    status: 200,
                    json: async () => playlistPayload,
                };
            }
            // 单曲接口在两个源上都以 200 返回空数组
            return { ok: true, status: 200, json: async () => [] };
        });
        vi.stubGlobal("fetch", fetchMock);

        const { result } = await renderReadyHook();
        expect(result.current.activeAdapterIndex).toBe(0);

        let resolved: string | null = "sentinel";
        await act(async () => {
            resolved = await result.current.fetchTrackUrl("song-1");
        });

        expect(resolved).toBeNull();
        expect(result.current.trackFetchDiagnostic).toEqual({
            trackId: "song-1",
            attempts: [
                {
                    adapterIndex: 1,
                    success: false,
                    failureReason: AdapterFailureReason.EMPTY_PLAYLIST,
                    isActiveSourceFallback: false,
                },
                {
                    adapterIndex: 0,
                    success: false,
                    failureReason: AdapterFailureReason.EMPTY_PLAYLIST,
                    isActiveSourceFallback: true,
                },
            ],
            resolved: false,
            url: null,
        });
    });
});
