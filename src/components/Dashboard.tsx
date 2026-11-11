import React from "react";
import type { Settings } from "../types";
import { TimerMode } from "../types";
import AudioPlayer from "./AudioPlayer";
import Pomodoro from "./Pomodoro";
import TaskManager from "./TaskManager";

type DashboardProps = {
    settings: Settings;
    sessionCount: number;
    isOnline: boolean;
    onSessionsUpdate: (newCount: number) => void;
    onTick: (timeLeft: number, mode: TimerMode, isActive: boolean) => void;
};

const Dashboard: React.FC<DashboardProps> = ({
    settings,
    sessionCount,
    isOnline,
    onSessionsUpdate,
    onTick,
}) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start lg:items-stretch max-w-7xl mx-auto w-full">
            <div className="lg:col-span-7 flex flex-col min-h-[36rem] lg:min-h-[42rem] xl:min-h-[44rem] h-full">
                <Pomodoro
                    settings={settings}
                    sessionCount={sessionCount}
                    onSessionsUpdate={onSessionsUpdate}
                    onTick={onTick}
                />
            </div>

            <div className="lg:col-span-5 flex flex-col lg:grid lg:grid-rows-[minmax(0,1fr)_15rem] gap-6 min-h-[32rem] lg:min-h-[42rem] xl:min-h-[44rem] h-full">
                <div className="min-h-[18rem] lg:min-h-0 h-full">
                    <TaskManager language={settings.language} />
                </div>
                <div className="min-h-[14rem] lg:h-[15rem] shrink-0">
                    <AudioPlayer
                        language={settings.language}
                        musicConfig={settings.musicConfig}
                        isOnline={isOnline}
                    />
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
