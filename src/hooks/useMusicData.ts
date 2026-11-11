import { useCallback, useEffect, useRef, useState } from "react";
import { musicSourceKey } from "../config/musicConfig";
import { API_FETCH_DELAY_MS } from "../constants";
import { MusicDataError } from "../types";
import { fetchWithTimeout, TimeoutError } from "../utils/fetchWithTimeout";
import { EmptyPlaylistError, getAdapters } from "../utils/musicApiAdapters";
import { useRetryOnReconnect } from "./useRetryOnReconnect";

export interface MusicTrack {
    /** 歌曲唯一标识符。如果不可用，可能为空字符串。 */
    id: string;
    name: string;
    artist: string;
    url: string;
    cover: string;
    lrc: string;
    theme?: string;
}

/**
 * 单个适配器请求失败的归类。仅用于诊断展示，不参与回退决策。
 */
export const AdapterFailureReason = {
    /** 上游以 HTTP 200 返回空数组或 `{ error }`：歌单无效/为空 */
    EMPTY_PLAYLIST: "empty-playlist",
    /** 请求超过适配器的 timeoutMs */
    TIMEOUT: "timeout",
    /** 网络层错误（如 fetch reject）或非 2xx 的 HTTP 状态码 */
    NETWORK_OR_HTTP: "network-or-http",
    /** 响应体无法解析为预期结构（EmptyPlaylistError 之外的解析异常） */
    PARSE_ERROR: "parse-error",
} as const;
export type AdapterFailureReason =
    (typeof AdapterFailureReason)[keyof typeof AdapterFailureReason];

/**
 * 最近一次歌单加载尝试的最终结论。
 */
export const MusicLoadOutcome = {
    SUCCESS: "success",
    PLAYLIST_UNAVAILABLE: MusicDataError.PLAYLIST_UNAVAILABLE,
    SERVICE_UNAVAILABLE: MusicDataError.SERVICE_UNAVAILABLE,
} as const;
export type MusicLoadOutcome =
    (typeof MusicLoadOutcome)[keyof typeof MusicLoadOutcome];

/**
 * 歌单加载过程中单个适配器的尝试记录。
 */
export interface AdapterAttemptDiagnostic {
    /** 适配器在 getAdapters() 返回数组中的序号 */
    adapterIndex: number;
    success: boolean;
    /** success 为 false 时的失败归类；成功时为 null */
    failureReason: AdapterFailureReason | null;
}

/**
 * 最近一次歌单加载尝试的诊断快照。每次加载（含重试）结束后整体替换。
 */
export interface MusicLoadDiagnostic {
    /** 按实际尝试顺序记录的各适配器结果 */
    attempts: AdapterAttemptDiagnostic[];
    /** 本次加载的最终结论 */
    outcome: MusicLoadOutcome;
    /** 成功时给出可用数据的适配器序号，否则为 null */
    activeAdapterIndex: number | null;
}

/**
 * 单曲回退过程中单个适配器的尝试记录。
 */
export interface TrackFetchAttemptDiagnostic {
    adapterIndex: number;
    success: boolean;
    failureReason: AdapterFailureReason | null;
    /** 该次尝试是否为「其它源全部失败后兜底再试当前生效源」 */
    isActiveSourceFallback: boolean;
}

/**
 * 最近一次单曲回退（fetchTrackUrl）的诊断快照。
 */
export interface TrackFetchDiagnostic {
    /** 本次回退请求的歌曲 id */
    trackId: string;
    /** 按实际尝试顺序记录的各适配器结果（不含缺少 buildTrackUrl 而跳过的源） */
    attempts: TrackFetchAttemptDiagnostic[];
    /** 是否拿到了可用的单曲地址 */
    resolved: boolean;
    /** resolved 为 true 时返回的地址，否则为 null */
    url: string | null;
}

interface UseMusicDataProps {
    server: string;
    type: string;
    id: string;
}

const withoutSignal = (fetchOptions?: RequestInit): RequestInit => {
    const safeFetchOptions = { ...(fetchOptions || {}) };
    if ("signal" in safeFetchOptions) {
        delete safeFetchOptions.signal;
    }
    return safeFetchOptions;
};

/**
 * 将异常归类为诊断用的失败原因。
 * 调用方需先处理 EmptyPlaylistError 与外部 abort，二者不会进入这里。
 *
 * @param err 捕获到的异常
 * @param parseStarted 是否已进入 parseResponse 阶段，用于区分请求阶段与解析阶段
 */
const classifyFailure = (
    err: unknown,
    parseStarted: boolean,
): AdapterFailureReason => {
    if (err instanceof TimeoutError) {
        return AdapterFailureReason.TIMEOUT;
    }
    if (err instanceof EmptyPlaylistError) {
        return AdapterFailureReason.EMPTY_PLAYLIST;
    }
    if (parseStarted) {
        return AdapterFailureReason.PARSE_ERROR;
    }
    // fetch reject（网络错误）与 `throw new Error(`HTTP ${status}`)` 都落在请求阶段
    return AdapterFailureReason.NETWORK_OR_HTTP;
};

export const useMusicData = ({ server, type, id }: UseMusicDataProps) => {
    const [audioList, setAudioList] = useState<MusicTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<MusicDataError | null>(null);
    const [adapterStartIndex, setAdapterStartIndex] = useState(0);
    const [activeAdapterIndex, setActiveAdapterIndex] = useState<number | null>(
        null,
    );
    const [reloadToken, setReloadToken] = useState(0);
    // 最近一次歌单加载尝试的诊断；尚未产生过完整尝试时为 null
    const [loadDiagnostic, setLoadDiagnostic] =
        useState<MusicLoadDiagnostic | null>(null);
    // 最近一次单曲回退的诊断；从未触发过 fetchTrackUrl 时为 null
    const [trackFetchDiagnostic, setTrackFetchDiagnostic] =
        useState<TrackFetchDiagnostic | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const retryWithNextAdapter = useCallback(() => {
        const adapters = getAdapters();
        if (adapters.length === 0) return;
        setAdapterStartIndex((prev) => (prev + 1) % adapters.length);
    }, []);

    const hasSource = Boolean(server && type && id);

    const sourceKey = musicSourceKey({ server, type, id });
    const [prevSourceKey, setPrevSourceKey] = useState(sourceKey);
    if (prevSourceKey !== sourceKey) {
        setPrevSourceKey(sourceKey);
        setAdapterStartIndex(0);
    }

    useEffect(() => {
        if (!server || !type || !id) {
            return;
        }

        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            setActiveAdapterIndex(null);

            const adapters = getAdapters();
            // 除空歌单外的请求或解析失败都按服务故障处理，不判定歌单无效
            let sawServiceFailure = false;
            // 诊断数据只随本次尝试在内存中累积，不触发任何额外请求
            const attempts: AdapterAttemptDiagnostic[] = [];

            for (let i = 0; i < adapters.length; i += 1) {
                const adapterIndex = (adapterStartIndex + i) % adapters.length;
                const adapter = adapters[adapterIndex];
                if (controller.signal.aborted) return;

                let parseStarted = false;
                try {
                    const url = adapter.buildUrl({ server, type, id });
                    const response = await fetchWithTimeout(
                        url,
                        withoutSignal(adapter.fetchOptions),
                        {
                            externalSignal: controller.signal,
                            timeoutMs: adapter.timeoutMs,
                        },
                    );

                    if (!response.ok)
                        throw new Error(`HTTP ${response.status}`);

                    const data = await response.json();
                    if (controller.signal.aborted) return;

                    parseStarted = true;
                    const tracks = adapter.parseResponse(data);

                    attempts.push({
                        adapterIndex,
                        success: true,
                        failureReason: null,
                    });
                    setAudioList(tracks);
                    setActiveAdapterIndex(adapterIndex);
                    setLoadDiagnostic({
                        attempts,
                        outcome: MusicLoadOutcome.SUCCESS,
                        activeAdapterIndex: adapterIndex,
                    });
                    setLoading(false);
                    return;
                } catch (err) {
                    if (controller.signal.aborted) {
                        return;
                    }
                    // 上游以 200 表示歌单无效/为空：不是服务故障，继续问下一个源
                    if (err instanceof EmptyPlaylistError) {
                        attempts.push({
                            adapterIndex,
                            success: false,
                            failureReason: AdapterFailureReason.EMPTY_PLAYLIST,
                        });
                        continue;
                    }
                    sawServiceFailure = true;
                    if (
                        err instanceof TimeoutError ||
                        (err instanceof DOMException &&
                            err.name === "AbortError")
                    ) {
                        // 超时或中止不打 console.warn，但仍计入诊断并继续回退
                        attempts.push({
                            adapterIndex,
                            success: false,
                            failureReason: classifyFailure(err, parseStarted),
                        });
                        continue;
                    }
                    console.warn(`API adapter failed:`, err);
                    attempts.push({
                        adapterIndex,
                        success: false,
                        failureReason: classifyFailure(err, parseStarted),
                    });
                }
            }

            const outcome = sawServiceFailure
                ? MusicLoadOutcome.SERVICE_UNAVAILABLE
                : MusicLoadOutcome.PLAYLIST_UNAVAILABLE;
            setError(
                sawServiceFailure
                    ? MusicDataError.SERVICE_UNAVAILABLE
                    : MusicDataError.PLAYLIST_UNAVAILABLE,
            );
            setLoadDiagnostic({
                attempts,
                outcome,
                activeAdapterIndex: null,
            });
            setLoading(false);
        };

        const timeoutId = setTimeout(fetchData, API_FETCH_DELAY_MS);
        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, [server, type, id, adapterStartIndex, reloadToken]);

    const reload = useCallback(() => {
        setReloadToken((prev) => prev + 1);
    }, []);

    useRetryOnReconnect(
        hasSource && error === MusicDataError.SERVICE_UNAVAILABLE,
        reload,
    );

    const fetchTrackUrl = useCallback(
        async (
            trackId: string,
            signal?: AbortSignal,
        ): Promise<string | null> => {
            const adapters = getAdapters();
            // 先跳过当前生效源询问其它源；顺序与 getAdapters() 的固定回退顺序一致
            const otherAdapterIndexes = adapters
                .map((_, index) => index)
                .filter((index) => index !== activeAdapterIndex);
            // 其它源全部未给出可用地址时，把当前生效源作为最后一档再试一次；
            // activeAdapterIndex 为 null（尚无生效源）时不做重复尝试
            const targetIndexes =
                activeAdapterIndex !== null
                    ? [...otherAdapterIndexes, activeAdapterIndex]
                    : otherAdapterIndexes;

            const attempts: TrackFetchAttemptDiagnostic[] = [];
            let resolvedUrl: string | null = null;

            for (const adapterIndex of targetIndexes) {
                const adapter = adapters[adapterIndex];
                if (!adapter.buildTrackUrl) continue;
                if (signal?.aborted) break;

                const isActiveSourceFallback =
                    adapterIndex === activeAdapterIndex;
                let parseStarted = false;

                try {
                    const url = adapter.buildTrackUrl({ server, id: trackId });
                    const response = await fetchWithTimeout(
                        url,
                        withoutSignal(adapter.fetchOptions),
                        {
                            externalSignal: signal,
                            timeoutMs: adapter.timeoutMs,
                        },
                    );

                    if (!response.ok)
                        throw new Error(`HTTP ${response.status}`);

                    const data = await response.json();
                    parseStarted = true;
                    const tracks = adapter.parseResponse(data);
                    if (tracks.length > 0 && tracks[0].url) {
                        resolvedUrl = tracks[0].url;
                        attempts.push({
                            adapterIndex,
                            success: true,
                            failureReason: null,
                            isActiveSourceFallback,
                        });
                        break;
                    }
                    // 200 但无可播地址：与空歌单同类
                    attempts.push({
                        adapterIndex,
                        success: false,
                        failureReason: AdapterFailureReason.EMPTY_PLAYLIST,
                        isActiveSourceFallback,
                    });
                } catch (err) {
                    if (signal?.aborted) break;
                    if (
                        err instanceof DOMException &&
                        err.name === "AbortError"
                    ) {
                        break;
                    }
                    if (err instanceof TimeoutError) {
                        attempts.push({
                            adapterIndex,
                            success: false,
                            failureReason: AdapterFailureReason.TIMEOUT,
                            isActiveSourceFallback,
                        });
                        continue;
                    }
                    console.warn("Track fallback fetch failed:", err);
                    attempts.push({
                        adapterIndex,
                        success: false,
                        failureReason: classifyFailure(err, parseStarted),
                        isActiveSourceFallback,
                    });
                }
            }

            setTrackFetchDiagnostic({
                trackId,
                attempts,
                resolved: resolvedUrl !== null,
                url: resolvedUrl,
            });
            return resolvedUrl;
        },
        [server, activeAdapterIndex],
    );

    return {
        audioList,
        loading: hasSource ? loading : false,
        error,
        retryWithNextAdapter,
        activeAdapterIndex,
        fetchTrackUrl,
        /** 最近一次歌单加载尝试的诊断信息（仅用于展示与调试） */
        loadDiagnostic,
        /** 最近一次单曲回退的诊断信息（仅用于展示与调试） */
        trackFetchDiagnostic,
    };
};
