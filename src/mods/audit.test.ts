import { describe, expect, test } from 'bun:test';
import { auditEdits } from './audit.ts';
import { ModEngine } from './engine.ts';
import { applyJsonPatch } from './patch.ts';
import { memTree } from './vfs.ts';

const te = new TextEncoder(), td = new TextDecoder();
const tree = (files: Record<string, string>) => memTree(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, te.encode(v)])));

const key = '0123456789abcdef0123456789abcdef';
const mk = () => new ModEngine(() => key);
const modTree = (id: string, files: Record<string, string> = {}, extra = '') => tree({ 'mod.json': `{"id":"${id}","name":"${id}"${extra}}`, ...files });

describe('audit', () => {
    test('two mods patching the same data/*.KEL: audit agrees with resolve and every check passes', () => {
        const x = mk();
        const base = x.encrypt(te.encode(JSON.stringify([null, { name: 'A', tags: [] }])));
        x.load([
            { label: 'one', tree: modTree('mod-one', { 'patches/data/T.json.patch.json': '[{"op":"replace","path":"/1/name","value":"B"}]' }) },
            { label: 'two', tree: modTree('mod-two', { 'patches/data/T.json.patch.json': '[{"op":"add","path":"/1/tags/-","value":"c"}]' }) },
        ]);

        const out = x.resolve('data/T.KEL', () => base);
        expect(out).not.toBeNull();
        const json = JSON.parse(td.decode(x.decrypt(out!)));
        expect(json[1]).toEqual({ name: 'B', tags: ['c'] });

        const audit = x.auditFile('data/T.KEL', true);
        expect(audit.target).toEqual({ game: 'data/T.KEL', fmt: 'json', crypt: 'aes', encrypted: true });
        expect(audit.changed).toBe(true);
        expect(audit.needsBase).toBe(x.needsBase('data/T.KEL'));
        expect(audit.edits).toEqual([
            { mod: 'mod-one', kind: 'jsonpatch', source: 'patches/data/T.json.patch.json', ok: true, reason: 'ok' },
            { mod: 'mod-two', kind: 'jsonpatch', source: 'patches/data/T.json.patch.json', ok: true, reason: 'ok' },
        ]);
        // the audit's produce/fall-back decision matches what resolve actually did
        expect(audit.producesBytes).toBe(out !== null);
        expect(audit.fallsBack).toBe(false);
        expect(audit.checks.every(c => c.passed)).toBe(true);
        expect(JSON.parse(JSON.stringify(audit))).toEqual(audit); // JSON-serialisable
    });

    test('a patch whose path does not exist is marked failed; when everything fails the original is served', () => {
        const baseJson = [null, { name: 'A' }];
        const ops = [{ op: 'remove', path: '/9' }];
        // the failure resolve() would hit, captured as plain data for the snapshot
        let failReason = '';
        try { applyJsonPatch(baseJson, ops); } catch (e) { failReason = (e as Error).message; }
        expect(failReason).toContain('op #0');

        const audit = auditEdits({
            gamePath: 'data/T.KEL',
            baseExists: true,
            edits: [{ mod: 'bad-mod', kind: 'jsonpatch', source: 'patches/data/T.json.patch.json', sourceReadable: true, failReason }],
        });
        expect(audit.edits[0]!.ok).toBe(false);
        expect(audit.edits[0]!.reason).toBe(failReason);
        expect(audit.allFailed).toBe(true);

        // same edit list through the real engine: the audit's produce/fall-back call must match resolve's
        const x = mk();
        const base = x.encrypt(te.encode(JSON.stringify(baseJson)));
        x.load([{ label: 'bad', tree: modTree('bad-mod', { 'patches/data/T.json.patch.json': JSON.stringify(ops) }) }]);
        const out = x.resolve('data/T.KEL', () => base);
        expect(audit.producesBytes).toBe(out !== null);
        expect(audit.fallsBack).toBe(out === null);

        // when the failed edit never produced content (its source file is missing), the original is served
        const missing = auditEdits({
            gamePath: 'data/T.KEL',
            baseExists: true,
            edits: [{ mod: 'bad-mod', kind: 'jsonpatch', source: 'patches/data/T.json.patch.json', sourceReadable: false }],
        });
        expect(missing.edits[0]!.ok).toBe(false);
        expect(missing.edits[0]!.reason).toContain('missing or unreadable');
        expect(missing.producesBytes).toBe(false);
        expect(missing.fallsBack).toBe(true);
        expect(missing.summary).toContain('original file');
        expect(missing.checks.find(c => c.name === 'produces-output')).toMatchObject({ passed: false });
    });

    test('a patch against a missing base file fails the same way in audit and resolve', () => {
        const x = mk();
        x.load([{ label: 'one', tree: modTree('mod-one', { 'patches/data/T.json.patch.json': '[{"op":"add","path":"/1/x","value":1}]' }) }]);
        expect(x.resolve('data/T.KEL', () => null)).toBeNull();
        const audit = x.auditFile('data/T.KEL', false);
        expect(audit.edits[0]).toMatchObject({ ok: false });
        expect(audit.edits[0]!.reason).toContain('does not exist, so it cannot be patched');
        expect(audit.producesBytes).toBe(false);
        expect(audit.fallsBack).toBe(true);
        expect(audit.checks.find(c => c.name === 'base-available')).toMatchObject({ passed: false });
    });

    test('jsonpatch on an img/*.rpgmvp target fails with a readable reason', () => {
        const x = mk();
        x.load([{ label: 'img', tree: modTree('img-mod', { 'patches/img/pictures/a.png.patch.json': '[{"op":"add","path":"/x","value":1}]' }) }]);
        const audit = x.auditFile('img/pictures/a.rpgmvp', true);
        expect(audit.target.crypt).toBe('rpg');
        expect(audit.edits[0]!.ok).toBe(false);
        expect(audit.edits[0]!.reason).toContain('images and audio can only be replaced, not patched');
        expect(audit.fallsBack).toBe(true);
        // resolve hits the same restriction
        expect(x.resolve('img/pictures/a.rpgmvp', () => te.encode('png'))).toBeNull();
        expect(x.diagnostics.some(d => d.level === 'error' && /only be replaced/.test(d.message))).toBe(true);
    });

    test('replace edits need no base; patch edits do (needsBase semantics)', () => {
        const x = mk();
        x.load([{ label: 'one', tree: modTree('mod-one', { 'files/data/T.json': '[null,{"name":"B"}]' }) }]);
        const audit = x.auditFile('data/T.KEL', false);
        expect(audit.needsBase).toBe(false);
        expect(audit.needsBase).toBe(x.needsBase('data/T.KEL'));
        expect(audit.producesBytes).toBe(true); // a replace produces bytes even with no base file
        expect(audit.checks.every(c => c.passed)).toBe(true);
        expect(td.decode(x.decrypt(x.resolve('data/T.KEL', () => null)!))).toBe('[null,{"name":"B"}]');
    });

    test('auditFile with no edits reports "no changes" instead of throwing', () => {
        const x = mk();
        x.load([{ label: 'one', tree: modTree('mod-one') }]);
        const audit = x.auditFile('data/Nope.KEL', false);
        expect(audit.changed).toBe(false);
        expect(audit.edits).toEqual([]);
        expect(audit.producesBytes).toBe(false);
        expect(audit.fallsBack).toBe(true);
        expect(audit.summary).toContain('no mod changes');
        expect(audit.checks.find(c => c.name === 'has-edits')).toMatchObject({ passed: false });
        expect(x.resolve('data/Nope.KEL', () => null)).toBeNull();
    });
});
