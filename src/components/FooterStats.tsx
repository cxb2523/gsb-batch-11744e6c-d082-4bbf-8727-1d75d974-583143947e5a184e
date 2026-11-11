import React from "react";
import { useTranslation } from "../utils/i18n";

type FooterStatsProps = {
    footerRef: React.RefObject<HTMLElement | null>;
    hours: number;
    minutes: number;
    seconds: number;
    t: ReturnType<typeof useTranslation>;
};

const FooterStats: React.FC<FooterStatsProps> = ({
    footerRef,
    hours,
    minutes,
    seconds,
    t,
}) => {
    return (
        <footer
            ref={footerRef}
            className="fixed bottom-0 left-0 right-0 z-40 border-t border-theme-highlight/30 bg-theme-base/80 backdrop-blur-md text-ui-micro font-ui-mono text-theme-dim py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] select-none"
        >
            <div className="max-w-[1920px] mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-theme-primary/80 uppercase tracking-ui-wider">
                        {t("TOTAL_STUDY_TIME")}:
                    </span>
                    <span className="text-theme-text">
                        {hours > 0 ? (
                            <>
                                <span className="mr-1">
                                    {hours}
                                    <span className="text-theme-dim ml-0.5">
                                        {t("HOURS")}
                                    </span>
                                </span>
                                <span className="mr-1">
                                    {minutes}
                                    <span className="text-theme-dim ml-0.5">
                                        {t("MINUTES")}
                                    </span>
                                </span>
                                <span>
                                    {seconds}
                                    <span className="text-theme-dim ml-0.5">
                                        {t("SECONDS")}
                                    </span>
                                </span>
                            </>
                        ) : minutes > 0 ? (
                            <>
                                <span className="mr-1">
                                    {minutes}
                                    <span className="text-theme-dim ml-0.5">
                                        {t("MINUTES")}
                                    </span>
                                </span>
                                <span>
                                    {seconds}
                                    <span className="text-theme-dim ml-0.5">
                                        {t("SECONDS")}
                                    </span>
                                </span>
                            </>
                        ) : (
                            <span>
                                {seconds}
                                <span className="text-theme-dim ml-0.5">
                                    {t("SECONDS")}
                                </span>
                            </span>
                        )}
                    </span>
                </div>
                <div className="flex items-center gap-4 opacity-60 hover:opacity-100 transition-opacity">
                    <span>{t("COPYRIGHT")}</span>
                    <span className="inline text-theme-highlight">|</span>
                    <a
                        href="https://github.com/ChuwuYo/Endfield-Pomodoro"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-theme-primary transition-colors"
                    >
                        <i className="ri-github-fill"></i>
                        <span>@ChuwuYo</span>
                    </a>
                </div>
            </div>
        </footer>
    );
};

export default FooterStats;
