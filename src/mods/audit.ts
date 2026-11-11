// Audit: a pure, side-effect-free answer to "what would resolve() do with this file, and why?".
// The input is a plain-data snapshot (who edits the file, in order, and what is already known about
// each edit); the output is a plain-data report: per-edit verdicts, the final produce/fall-back
// decision, and an ordered checklist. Nothing here touches the filesystem, the game keys, or the
// engine — the same snapshot always yields the same audit, and the result is JSON-serialisable.
import { formatOfGamePath, type Crypt, type EditKind, type Format } from './manifest.ts';

/** One edit, as known before anything is applied. `failReason` carries a failure the caller already
 *  determined (e.g. a patch op that does not apply, or invalid JSON in the source file). */
export interface AuditEditInput {
    mod: string;
    kind: EditKind;
    source: string;
    /** the mod's source file for this edit can be read */
    sourceReadable: boolean;
    /** caller-determined reason this edit throws when really applied, if any */
    failReason?: string | null;
}

export interface AuditInput {
    gamePath: string;
    /** the original game file exists (patches need it; replace/raw do not) */
    baseExists: boolean;
    /** edits in load order — the same order ModEngine.resolve applies them */
    edits: AuditEditInput[];
}

export interface AuditEditVerdict {
    mod: string;
    kind: EditKind;
    source: string;
    ok: boolean;
    /** human-readable failure reason, or 'ok' */
    reason: string;
}

export interface AuditCheck {
    name: string;
    passed: boolean;
    /** why it failed (absent when passed) */
    reason?: string;
}

export interface AuditResult {
    gamePath: string;
    /** how the target file is stored, from the same formatOfGamePath the engine uses */
    target: { game: string; fmt: Format; crypt: Crypt; encrypted: boolean };
    /** any mod edits this file at all */
    changed: boolean;
    /** same semantics as ModEngine.needsBase: any edit that is not replace/raw */
    needsBase: boolean;
    edits: AuditEditVerdict[];
    applied: number;
    /** every edit failed (only meaningful when `changed`) */
    allFailed: boolean;
    /** resolve() would return fresh bytes (at least one edit applied, or content was read before a failure) */
    producesBytes: boolean;
    /** resolve() would return null and the caller serves the original file */
    fallsBack: boolean;
    checks: AuditCheck[];
    summary: string;
}

const PATCH_KINDS: EditKind[] = ['jsonpatch', 'merge', 'text', 'append'];
const isPatch = (k: EditKind) => PATCH_KINDS.includes(k);

/**
 * Replay the edit list the way ModEngine.resolve does — same order, same skip-on-error, same
 * "a raw edit makes later patches fail" and "patches need a base" rules — but over plain data.
 * `content` mirrors resolve's plain/value state: once the current content has been read or
 * produced, resolve has bytes to emit even if a later edit fails.
 */
export function auditEdits(input: AuditInput): AuditResult {
    const target = formatOfGamePath(input.gamePath);
    let content = false; // resolve holds plain bytes or a parsed value at this point
    let final = false;   // a raw edit supplied already-encrypted content

    const edits: AuditEditVerdict[] = input.edits.map(e => {
        // structural failures, in the order resolve hits them (after reading the source, before the edit's own logic)
        let structural: string | null = null;
        if (isPatch(e.kind)) {
            if (final) structural = 'cannot patch content that a mod supplied already encrypted';
            else if ((e.kind === 'jsonpatch' || e.kind === 'merge') && target.crypt === 'rpg')
                structural = 'images and audio can only be replaced, not patched like data (image deltas are handled separately)';
            else if (!content && !input.baseExists)
                structural = `game file ${input.gamePath} does not exist, so it cannot be patched`;
        }

        let reason: string | null;
        if (!e.sourceReadable) reason = `source file "${e.source}" is missing or unreadable in mod "${e.mod}"`;
        else {
            reason = structural ?? e.failReason ?? null;
            // jsonpatch/merge parse the current content (asValue) before the edit itself can fail,
            // so from here on resolve has content to emit even when this edit is skipped
            if (!structural && (e.kind === 'jsonpatch' || e.kind === 'merge')) content = true;
        }

        const ok = reason === null;
        if (ok) {
            content = true;
            if (e.kind === 'raw') final = true;
            else if (e.kind === 'replace') final = false;
        }
        return { mod: e.mod, kind: e.kind, source: e.source, ok, reason: reason ?? 'ok' };
    });

    const applied = edits.filter(v => v.ok).length;
    // resolve(): `applied === 0 && plain === null` falls back to the original; once content exists it emits bytes
    const producesBytes = content;
    const fallsBack = !producesBytes;
    const allFailed = input.edits.length > 0 && applied === 0;
    const needsBase = input.edits.some(e => e.kind !== 'replace' && e.kind !== 'raw');

    const checks: AuditCheck[] = [];
    checks.push(input.edits.length
        ? { name: 'has-edits', passed: true }
        : { name: 'has-edits', passed: false, reason: 'no mod edits target this file' });

    const unreadable = edits.filter((v, i) => !input.edits[i]!.sourceReadable);
    checks.push(unreadable.length
        ? { name: 'sources-readable', passed: false, reason: `unreadable source(s): ${unreadable.map(v => `${v.mod}:${v.source}`).join(', ')}` }
        : { name: 'sources-readable', passed: true });

    // a patch can still run without the base file if an earlier successful edit supplied the content
    const firstPatch = input.edits.findIndex(e => isPatch(e.kind));
    const coveredByEarlierEdit = firstPatch >= 0 && edits.slice(0, firstPatch).some(v => v.ok);
    checks.push(!needsBase || input.baseExists || coveredByEarlierEdit
        ? { name: 'base-available', passed: true }
        : { name: 'base-available', passed: false, reason: `patches need the original ${input.gamePath}, but it does not exist and no mod replaces it first` });

    const failed = edits.filter(v => !v.ok);
    checks.push(input.edits.length > 0 && failed.length === 0
        ? { name: 'all-edits-applied', passed: true }
        : { name: 'all-edits-applied', passed: false, reason: `${failed.length} of ${edits.length} edit(s) failed: ${failed.map(v => `${v.mod} (${v.reason})`).join('; ') || 'none to run'}` });

    checks.push(producesBytes
        ? { name: 'produces-output', passed: true }
        : { name: 'produces-output', passed: false, reason: input.edits.length ? 'every edit failed and no content was produced, so the original file is served unchanged' : 'no mod changes' });

    const how = `${target.fmt}, ${target.crypt === 'none' ? 'unencrypted' : `${target.crypt}-encrypted`}`;
    const summary = !input.edits.length
        ? `no mod changes for ${input.gamePath}`
        : allFailed
            ? producesBytes
                ? `all ${edits.length} edit(s) failed for ${input.gamePath}; the file is re-saved without changes`
                : `all ${edits.length} edit(s) failed for ${input.gamePath}; the original file is served unchanged`
            : `${applied}/${edits.length} edit(s) applied to ${input.gamePath} (${how})`;

    return {
        gamePath: input.gamePath,
        target: { game: target.game, fmt: target.fmt, crypt: target.crypt, encrypted: target.encrypted },
        changed: input.edits.length > 0,
        needsBase, edits, applied, allFailed, producesBytes, fallsBack, checks, summary,
    };
}
