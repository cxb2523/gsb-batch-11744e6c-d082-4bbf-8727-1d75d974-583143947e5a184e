'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { AlertTriangle, WifiOff } from 'lucide-react';
import { useToast } from '@/components/ui';
import { apiGet } from '@/lib/api/client';
import { membersAPI } from '@/lib/api/settings';
import {
  Lifecycle,
  LifecycleEvent,
  LifecycleModule,
  LifecycleStage,
  ModulePatch,
  StageDraft,
  StagePatch,
  StageAttachment,
  StageDetail as StageDetailData,
  errorStatus,
  lifecycleAPI,
} from '@/lib/api/lifecycle';
import { ActivityTrail } from '@/components/lifecycle/ActivityTrail';
import { FlowEditor } from '@/components/lifecycle/FlowEditor';
import { LifecycleStyles } from '@/components/lifecycle/LifecycleStyles';
import { ModuleChecklist } from '@/components/lifecycle/ModuleChecklist';
import { CodeTag, JourneyTrack, StateChip } from '@/components/lifecycle/JourneyTrack';
import { StageDrawer } from '@/components/lifecycle/StageDrawer';
import { StageRecord } from '@/components/lifecycle/StageRecord';
import { DocumentViewer } from '@/components/lifecycle/DocumentViewer';
import { ModuleDetail } from '@/components/lifecycle/ModuleDetail';
import { LifecycleHero } from '@/components/lifecycle/LifecycleHero';
import { type MemberOption, StageDetail } from '@/components/lifecycle/StageDetail';
import { C, RADIUS, space } from '@/components/lifecycle/tokens';

type LoadError = { title: string; detail: string; offline?: boolean };

function describeError(error: unknown): LoadError {
  const code = errorStatus(error);
  if (code === 'offline') return { title: "You're offline", detail: 'Reconnect to see the lifecycle.', offline: true };
  if (code === 'timeout') return { title: 'This is taking too long', detail: 'Check your connection and try again.' };
  if (code === 403) return { title: "You don't have access to this project", detail: 'Ask a project admin to add you.' };
  if (code === 404) return { title: 'Project not found', detail: 'It may have been deleted.' };
  if (typeof code === 'number' && code >= 500) return { title: 'Something went wrong on our side', detail: 'Try again in a moment.' };
  return { title: "Couldn't load the lifecycle", detail: 'Try again in a moment.' };
}

function actionMessage(code: ReturnType<typeof errorStatus>, fallback: string): string {
  if (code === 'offline') return `You're offline. ${fallback}`;
  if (code === 403) return "You don't have access to this project.";
  // Someone else moved this project while the screen was open; the page reloads behind this.
  if (code === 409) return 'Someone else just changed this lifecycle. The page has been refreshed.';
  return fallback;
}

export default function ProjectLifecyclePage() {
  const params = useParams();
  const projectId = Number(params?.id);
  const toast = useToast();

  const [board, setBoard] = useState<Lifecycle | null>(null);
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [activityLoading, setActivityLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [flowOpen, setFlowOpen] = useState(false);
  // The dock on the right. A stage is "selected" for the route's highlight even
  // when the dock is shut, so closing it does not lose your place.
  const [dockOpen, setDockOpen] = useState(false);
  const [detail, setDetail] = useState<StageDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewing, setViewing] = useState<StageAttachment | null>(null);
  const [openModuleId, setOpenModuleId] = useState<number | null>(null);
  const [me, setMe] = useState<{ email: string; role: string }>({ email: '', role: '' });
  const requestRef = useRef<AbortController | null>(null);
  const detailRef = useRef<AbortController | null>(null);

  /* ---------- loading ---------- */

  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      if (!silent) {
        setLoading(true);
        setLoadError(null);
      }
      try {
        const data = await lifecycleAPI.get(projectId, controller.signal);
        if (controller.signal.aborted) return;
        setBoard(data);
        setLoadError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (!silent) setLoadError(describeError(error));
      } finally {
        if (requestRef.current === controller) setLoading(false);
      }
    },
    [projectId],
  );

  /** The open stage's remarks and documents, reloaded whenever the dock changes stage. */
  const loadDetail = useCallback(
    async (stageKey: string) => {
      detailRef.current?.abort();
      const controller = new AbortController();
      detailRef.current = controller;
      setDetailLoading(true);
      try {
        const data = await lifecycleAPI.stageDetail(projectId, stageKey, controller.signal);
        if (!controller.signal.aborted) setDetail(data);
      } catch {
        if (!controller.signal.aborted) setDetail(null);
      } finally {
        if (detailRef.current === controller) setDetailLoading(false);
      }
    },
    [projectId],
  );

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      setEvents(await lifecycleAPI.activity(projectId));
    } catch {
      // The trail is secondary: the board stays usable without it.
    } finally {
      setActivityLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!Number.isFinite(projectId)) return;
    load();
    loadActivity();
    membersAPI
      .getMembers(projectId)
      .then((list) =>
        setMembers(
          list
            .filter((member) => member.email)
            .map((member) => ({ email: member.email.toLowerCase(), name: member.name || member.email.split('@')[0] })),
        ),
      )
      .catch(() => setMembers([]));
    // Who is looking, so a remark only offers its own remove control.
    apiGet<{ email: string; role: string }>('/auth/me')
      .then((user) => setMe({ email: user.email ?? '', role: user.role ?? '' }))
      .catch(() => setMe({ email: '', role: '' }));
    return () => {
      requestRef.current?.abort();
      detailRef.current?.abort();
    };
  }, [projectId, load, loadActivity]);

  // Only show the skeleton if loading takes a noticeable moment, so fast loads don't flash.
  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => setShowSkeleton(true), 300);
    return () => clearTimeout(timer);
  }, [loading]);

  // Opening a stage loads its record; closing the dock stops that work.
  useEffect(() => {
    if (!dockOpen || !selectedKey) return;
    loadDetail(selectedKey);
  }, [dockOpen, selectedKey, loadDetail]);

  const openStage = (stage: LifecycleStage) => {
    setSelectedKey(stage.key);
    setDockOpen(true);
  };

  const stages = board?.stages ?? [];
  const selected = useMemo(
    () => stages.find((stage) => stage.key === selectedKey) ?? stages.find((stage) => stage.key === board?.current_stage) ?? stages[0] ?? null,
    [stages, selectedKey, board?.current_stage],
  );

  /* ---------- changes ---------- */

  const run = useCallback(
    async (request: () => Promise<Lifecycle | void>, { success, failure }: { success?: string; failure: string }) => {
      setSaving(true);
      try {
        const updated = await request();
        if (updated) setBoard(updated);
        else await load({ silent: true });
        if (success) toast.success(success);
        loadActivity();
        return true;
      } catch (error) {
        toast.error(actionMessage(errorStatus(error), failure));
        await load({ silent: true }); // put the screen back to what the server has
        return false;
      } finally {
        setSaving(false);
      }
    },
    [load, loadActivity, toast],
  );

  const changeStage = (stage: LifecycleStage, patch: StagePatch) =>
    run(() => lifecycleAPI.updateStage(projectId, stage.key, patch), {
      success: patch.state ? `${stage.name} is now ${patch.state.replace('_', ' ')}` : undefined,
      failure: `Couldn't update ${stage.name}. Try again.`,
    });

  /** Finish the stage in hand and start the next one, in a single request. */
  const advance = (stage: LifecycleStage) => {
    const following = stages.slice(stages.findIndex((item) => item.key === stage.key) + 1)
      .find((item) => item.state !== 'done' && item.state !== 'skipped');
    return run(() => lifecycleAPI.advance(projectId, stage.key), {
      success: following ? `${stage.name} done. ${following.name} is now in progress.` : `${stage.name} done. Every stage is complete.`,
      failure: `Couldn't move on from ${stage.name}. Try again.`,
    });
  };

  /**
   * The record calls answer with the stage's remaining remarks and documents, so
   * the dock updates from the response, and the board reloads only for the
   * counts on the cards.
   */
  const runDetail = async (request: () => Promise<StageDetailData>, failure: string): Promise<boolean> => {
    setSaving(true);
    try {
      setDetail(await request());
      load({ silent: true });
      loadActivity();
      return true;
    } catch (error) {
      toast.error(actionMessage(errorStatus(error), failure));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveFlow = async (drafts: StageDraft[]) => {
    const ok = await run(() => lifecycleAPI.replaceFlow(projectId, drafts), {
      success: 'Stages updated',
      failure: "Couldn't save the stages. Try again.",
    });
    if (ok) setFlowOpen(false);
  };

  const addModule = (name: string) =>
    run(() => lifecycleAPI.addModule(projectId, { name }), { failure: "Couldn't add the module. Try again." });

  const changeModule = (module: LifecycleModule, patch: ModulePatch) =>
    run(() => lifecycleAPI.updateModule(projectId, module.id, patch), {
      success: patch.done === true ? `${module.name} done` : undefined,
      failure: `Couldn't update ${module.name}. Try again.`,
    });

  const removeModule = (module: LifecycleModule) =>
    run(() => lifecycleAPI.removeModule(projectId, module.id), {
      success: `Removed ${module.name}`,
      failure: `Couldn't remove ${module.name}. Try again.`,
    });

  const linkTickets = (module: LifecycleModule, ticketIds: number[]) =>
    run(() => lifecycleAPI.linkModuleTickets(projectId, module.id, ticketIds), {
      success: ticketIds.length
        ? `${module.name} now follows ${ticketIds.length} ${ticketIds.length === 1 ? 'ticket' : 'tickets'}`
        : `${module.name} is back to a manual tick`,
      failure: `Couldn't link tickets to ${module.name}. Try again.`,
    });

  const reorderModules = (ids: number[]) =>
    run(() => lifecycleAPI.reorderModules(projectId, ids), { failure: "Couldn't reorder the modules. Try again." });

  /* ---------- render ---------- */

  if (loading && !board) {
    return (
      <div className="lc-backdrop">
      <div className="lc-page">
        <LifecycleStyles />
        {showSkeleton && (
          <div aria-busy="true" aria-label="Loading the lifecycle" style={{ display: 'flex', flexDirection: 'column', gap: space(2) }}>
            <div className="lc-skeleton" style={{ height: 206, borderRadius: 16 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: space(1.5) }}>
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '60px minmax(0, 1fr)', gap: 12 }}>
                  <div className="lc-skeleton" style={{ width: 34, height: 34, borderRadius: '50%', justifySelf: 'center' }} />
                  <div className="lc-skeleton" style={{ height: 72, borderRadius: RADIUS.lg }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    );
  }

  if (loadError && !board) {
    return (
      <div className="lc-backdrop">
      <div className="lc-page">
        <LifecycleStyles />
        <div style={{ maxWidth: 420, margin: `${space(8)}px auto`, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space(1.5) }}>
          <span aria-hidden style={{ width: 48, height: 48, borderRadius: '50%', background: C.surface, border: `1px solid ${C.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.textSubtle }}>
            {loadError.offline ? <WifiOff size={24} /> : <AlertTriangle size={24} />}
          </span>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: C.text }}>{loadError.title}</h1>
          <p style={{ margin: 0, fontSize: 14, color: C.textMuted }}>{loadError.detail}</p>
          <button type="button" className="lc-btn lc-btn--primary" onClick={() => load()}>Try Again</button>
        </div>
        </div>
      </div>
    );
  }

  if (!board) return null;

  const momentum = describeMomentum(board, events);
  // Read from the board, so the modal follows a ticket closing without reopening.
  const openModule = board.modules.find((module) => module.id === openModuleId) ?? null;
  const setOpenModule = (module: LifecycleModule) => setOpenModuleId(module.id);

  return (
    <div className={`lc-backdrop${dockOpen ? ' is-docked' : ''}`}>
      <div className="lc-page">
      <LifecycleStyles />

      <div className="lc-enter" style={{ marginBottom: space(2.5) }}>
        <LifecycleHero
          board={board}
          momentum={momentum}
          selectedKey={selected?.key ?? null}
          onSelectStage={(stage) => setSelectedKey(stage.key)}
          onAdvance={advance}
          onStart={(stage) => changeStage(stage, { state: 'in_progress' })}
          onEditFlow={() => setFlowOpen(true)}
          disabled={saving}
        />
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ marginBottom: space(2) }}>
          <JourneyTrack
              stages={stages}
              currentStage={board.current_stage}
              selectedKey={dockOpen ? selected?.key ?? null : null}
              saving={saving}
              members={members}
              onSelect={openStage}
              onAssign={(stage, emails) => changeStage(stage, emails.length ? { assignees: emails } : { clear: ['assignees'] })}
              onStateChange={(stage, state) => changeStage(stage, { state })}
              onAdvance={advance}
            />
          </div>

          <div className="lc-panels">
            <ModuleChecklist
              modules={board.modules}
              members={members}
              saving={saving}
              onAdd={addModule}
              onChange={changeModule}
              onRemove={removeModule}
              onReorder={reorderModules}
              onLinkTickets={linkTickets}
              onOpen={setOpenModule}
              onSearchTickets={(query, signal) => lifecycleAPI.searchTickets(projectId, query, signal)}
            />
            <ActivityTrail events={events} loading={activityLoading} />
          </div>
        </div>
      </div>

      {dockOpen && selected && (
        <StageDrawer
            open={dockOpen}
            title={selected.name}
            subtitle={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: space(1), flexWrap: 'wrap' }}>
                <StateChip state={selected.state} small />
                {selected.codename && <CodeTag codename={selected.codename} />}
                {selected.team && <span style={{ fontSize: 11, color: C.textMuted }}>{selected.team}</span>}
              </span>
            }
            onClose={() => setDockOpen(false)}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: space(3) }}>
              <StageDetail
                key={selected.key}
                stage={selected}
                members={members}
                saving={saving}
                onChange={(patch) => changeStage(selected, patch)}
              />
              <StageRecord
                tracks={selected.tracks}
                detail={detail?.stage_key === selected.key ? detail : null}
                loading={detailLoading}
                saving={saving}
                currentUserEmail={me.email}
                isAdmin={me.role === 'admin'}
                downloadUrl={(id) => lifecycleAPI.downloadUrl(projectId, selected.key, id)}
                onOpen={setViewing}
                onAddRemark={(remarkBody, track) => runDetail(() => lifecycleAPI.addRemark(projectId, selected.key, remarkBody, track), "Couldn't post that remark. Try again.")}
                onRemoveRemark={(remark) => runDetail(() => lifecycleAPI.removeRemark(projectId, selected.key, remark.id), "Couldn't remove that remark. Try again.")}
                onAddLink={(url, label, track) => runDetail(() => lifecycleAPI.addLink(projectId, selected.key, url, label || undefined, track), "Couldn't save that link. Try again.")}
                onUpload={(file, track) => runDetail(() => lifecycleAPI.uploadFile(projectId, selected.key, file, track), `Couldn't upload ${file.name}. Try again.`)}
                onRemoveAttachment={(attachment) => runDetail(() => lifecycleAPI.removeAttachment(projectId, selected.key, attachment.id), "Couldn't remove that. Try again.")}
              />
            </div>
          </StageDrawer>
        )}

      <ModuleDetail module={openModule} onClose={() => setOpenModuleId(null)} />

      <DocumentViewer
        attachment={viewing}
        downloadUrl={(id) => lifecycleAPI.downloadUrl(projectId, viewing?.stage_key ?? '', id)}
        onClose={() => setViewing(null)}
      />

      <FlowEditor open={flowOpen} stages={stages} saving={saving} onClose={() => setFlowOpen(false)} onSave={saveFlow} />
    </div>
  );
}

/**
 * One honest, motivating line: what the project is waiting on, or how long since
 * anything moved. No points, no badges; the facts are the encouragement.
 */
function describeMomentum(board: Lifecycle, events: LifecycleEvent[]): string {
  const { summary } = board;
  if (summary.delivered_on) {
    return `Delivered in ${summary.total_days} ${summary.total_days === 1 ? 'day' : 'days'}. Nicely done.`;
  }

  const current = board.stages.find((stage) => stage.key === board.current_stage);
  if (current?.target_date) {
    const days = differenceInCalendarDays(parseISO(current.target_date), new Date());
    if (days > 0) return `${current.name} is due in ${days} ${days === 1 ? 'day' : 'days'}, on track.`;
    if (days === 0) return `${current.name} is due today.`;
    return `${current.name} is ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} past its target.`;
  }

  const lastMove = events.find((event) => event.action === 'stage_moved');
  if (lastMove) {
    const days = differenceInCalendarDays(new Date(), parseISO(lastMove.at));
    if (days === 0) return 'A stage moved today. Keep it rolling.';
    if (days === 1) return 'A stage moved yesterday.';
    return `Nothing has moved for ${days} days.`;
  }
  return summary.started_on ? 'No stage has been completed yet.' : 'Nothing started yet. Set the first stage moving.';
}

