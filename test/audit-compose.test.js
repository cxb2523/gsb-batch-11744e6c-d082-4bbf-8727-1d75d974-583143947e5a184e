// The composition audit: it must explain composeScore() without ever
// disagreeing with it, and it must degrade, not throw, on prompts the lane
// cannot read.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { auditCompose, composeScore } from '../src/index.js';

// Every field the audit promises to keep in lockstep with composeScore().
const assertConsistent = (prompt, opts) => {
	const audit = auditCompose(prompt, opts);
	const { score, matched, reason } = composeScore(prompt, opts);
	assert.equal(audit.matched, matched, 'matched');
	assert.equal(audit.reason, reason, 'reason');
	assert.ok(score, 'the prompt is recognized');
	assert.equal(audit.seed, score.seed, 'seed');
	assert.equal(audit.effort, score.effort, 'effort');
	assert.equal(audit.beats.length, score.beats.length, 'beat count');
	// The seed encodes action:side:direction:effort:repeats:loop, so matching
	// seeds pin side, direction and repeats too; check them directly anyway.
	const [, side, direction, , repeats] = score.seed.split(':');
	assert.equal(audit.side, side, 'side');
	assert.equal(audit.direction, direction, 'direction');
	assert.equal(audit.repeats, Number(repeats), 'repeats');
	for (let i = 0; i < score.beats.length; i++) {
		assert.equal(audit.beats[i].in.scaled, score.beats[i].in, `beat ${i} in`);
		assert.equal(
			audit.beats[i].hold.scaled,
			typeof score.beats[i].hold === 'number' ? score.beats[i].hold : null,
			`beat ${i} hold`,
		);
	}
	return audit;
};

describe('composition audit', () => {
	it('reads manner, repetition and side out of a prompt and agrees with composeScore', () => {
		const prompt = 'wave with your left hand three times, gently';
		const audit = assertConsistent(prompt, {});

		assert.equal(audit.matched, 'wave');
		assert.equal(audit.matchedPhrase, 'wave');
		assert.equal(audit.matchSource, 'synonym');
		assert.equal(audit.side, 'left');
		assert.equal(audit.direction, 'left');
		assert.equal(audit.manner.word, 'gently');
		assert.equal(audit.manner.effort, 'gentle');
		assert.equal(audit.effort, 'gentle');
		assert.equal(audit.effortSource, 'manner');
		assert.equal(audit.repeats, 3);
		assert.equal(audit.repeatsExpression, 'three times');
		assert.equal(audit.degraded, false);
		assert.ok(audit.beats.length > 0);
		for (const beat of audit.beats) {
			assert.equal(typeof beat.label, 'string');
			assert.equal(typeof beat.in.raw, 'number');
			assert.equal(beat.factor, audit.factor);
		}
		assert.ok(audit.passed, 'every check passed');
		assert.ok(audit.checks.every((c) => c.passed), `failed: ${JSON.stringify(audit.checks.filter((c) => !c.passed))}`);
	});

	it('matches composeScore across a spread of prompts and options', () => {
		const cases = [
			['nod', {}],
			['clap 4 times', {}],
			['sit down heavily', { loop: true }],
			['point up', { effort: 'sharp' }],
			['turn around', { name: 'custom name' }],
			['stand up', {}],
			['walk twice', { effort: 'weary' }],
		];
		for (const [prompt, opts] of cases) {
			const audit = assertConsistent(prompt, opts);
			assert.ok(audit.passed, `"${prompt}" passes every check`);
		}
	});

	it('reports a bare action name as its own source', () => {
		// SYNONYMS only knows "shake head", so a bare "shake" falls through to
		// the action-name pass.
		const audit = auditCompose('shake');
		assert.equal(audit.matched, 'shake');
		assert.equal(audit.matchedPhrase, 'shake');
		assert.equal(audit.matchSource, 'action');
	});

	it('degrades on an unrecognized prompt instead of throwing', () => {
		const prompt = 'perform an interpretive dance about quarterly earnings';
		let audit;
		assert.doesNotThrow(() => {
			audit = auditCompose(prompt);
		});
		assert.equal(audit.matched, null);
		assert.equal(audit.matchedPhrase, null);
		assert.equal(audit.matchSource, null);
		assert.equal(audit.degraded, true);
		assert.equal(audit.degradation, 'unrecognized action');
		assert.equal(audit.reason, composeScore(prompt).reason);
		assert.match(audit.reason, /no known action/);
		assert.equal(audit.passed, false);
		const recognized = audit.checks.find((c) => c.name === 'action recognized');
		assert.equal(recognized.passed, false);
		assert.ok(recognized.reason, 'the failed check says why');
	});

	it('flags an empty or whitespace-only prompt as empty input, not an unrecognized action', () => {
		for (const prompt of ['', '   ', '\n\t ']) {
			const audit = auditCompose(prompt);
			assert.equal(audit.matched, null);
			assert.equal(audit.degraded, true);
			assert.equal(audit.degradation, 'empty input');
			assert.equal(audit.reason, composeScore(prompt).reason);
			assert.equal(audit.reason, 'empty prompt');
			assert.equal(audit.passed, false);
			const empty = audit.checks.find((c) => c.name === 'input is not empty');
			assert.equal(empty.passed, false);
		}
	});

	it('falls back to the manner word or neutral when opts.effort is not a real effort', () => {
		const mannered = assertConsistent('nod quickly', { effort: 'sassy' });
		assert.equal(mannered.effort, 'sharp', 'the manner word wins over an invalid option');
		assert.equal(mannered.effortSource, 'manner');
		assert.ok(mannered.passed);

		const plain = assertConsistent('nod', { effort: 'sassy' });
		assert.equal(plain.effort, 'neutral', 'no manner word means the neutral default');
		assert.equal(plain.effortSource, 'default');
		assert.ok(plain.passed);

		const valid = assertConsistent('nod quickly', { effort: 'heavy' });
		assert.equal(valid.effort, 'heavy', 'a valid option overrides the manner word');
		assert.equal(valid.effortSource, 'opts');
	});

	it('does not modify the options it is given', () => {
		const opts = { effort: 'sharp', loop: true, name: 'frozen' };
		const before = JSON.stringify(opts);
		auditCompose('wave', opts);
		assert.equal(JSON.stringify(opts), before);
	});

	it('returns plain JSON-serializable data', () => {
		for (const prompt of ['wave with your left hand three times, gently', 'reticulate splines', '']) {
			const audit = auditCompose(prompt);
			const roundTripped = JSON.parse(JSON.stringify(audit));
			assert.deepEqual(roundTripped, audit, `the audit of "${prompt}" survives JSON`);
		}
	});
});
