// Composition audit: a pure, structured explanation of what the model-free
// lane in compose.js did with a prompt.
//
// composeScore() answers "what score does this prompt produce". This module
// answers "why": which phrase matched and from which table, which side,
// direction, manner and repeat count were read out of the words, where the
// effort came from (an explicit option, a manner word, or the neutral
// default), and how each beat's timing was scaled by that effort. Every claim
// is rechecked against composeScore() itself and reported as an ordered list
// of named checks, so a caller can show a user (or a log) exactly what was
// understood before a clip is ever built.
//
// The audit is a pure function of its arguments: it reads nothing from disk
// or network, mutates nothing it is given, and returns only JSON-serializable
// data. A prompt the lane cannot recognize is not an error here; it is a
// degraded result with `matched: null` and the same reason composeScore()
// gives, so an audit can be run unconditionally on user input.

import { composeScore } from './compose.js';
import { EFFORTS } from './vocabulary.js';

// The tables below mirror the private ones in compose.js. They are
// duplicated, not imported, because compose.js does not export them and its
// public surface is frozen. The checks at the bottom of auditCompose() exist
// to catch any drift: the seed and matched action are recomputed here and
// compared against what composeScore() actually produced.

const SYNONYMS = Object.freeze([
	['stand up', 'stand_up'], ['get up', 'stand_up'], ['stand back up', 'stand_up'], ['rise', 'stand_up'],
	['shake head', 'shake'], ['say no', 'shake'], ['disagree', 'shake'], ['refuse', 'shake'],
	['nod', 'nod'], ['agree', 'nod'], ['say yes', 'nod'],
	['wave', 'wave'], ['greet', 'wave'], ['say hi', 'wave'], ['say hello', 'wave'], ['hello', 'wave'], ['goodbye', 'wave'], ['bye', 'wave'],
	['shrug', 'shrug'], ['dunno', 'shrug'], ["don't know", 'shrug'], ['no idea', 'shrug'],
	['applaud', 'clap'], ['clap', 'clap'],
	['point', 'point'], ['indicate', 'point'], ['gesture at', 'point'],
	['take a bow', 'bow'], ['bow', 'bow'],
	['sit down', 'sit'], ['sit', 'sit'], ['take a seat', 'sit'],
	['crouch', 'crouch'], ['duck', 'crouch'], ['squat', 'crouch'], ['kneel down', 'crouch'],
	['jump', 'jump'], ['leap', 'jump'], ['hop', 'jump'],
	['walk', 'walk'], ['step forward', 'walk'], ['stroll', 'walk'], ['pace', 'walk'],
	['turn around', 'turn'], ['turn', 'turn'], ['spin', 'turn'],
	['think', 'think'], ['ponder', 'think'], ['consider', 'think'], ['wonder', 'think'],
	['celebrate', 'celebrate'], ['cheer', 'celebrate'], ['victory', 'celebrate'], ['win', 'celebrate'],
	['reach', 'reach'], ['grab', 'reach'], ['pick up', 'reach'], ['take', 'reach'],
	['breathe', 'breathe'], ['sigh', 'breathe'], ['catch breath', 'breathe'],
	['idle', 'idle'], ['stand still', 'idle'], ['wait', 'idle'], ['do nothing', 'idle'],
]);

const BARE_ACTIONS = Object.freeze([
	'bow', 'breathe', 'celebrate', 'clap', 'crouch', 'idle', 'jump', 'nod',
	'point', 'reach', 'shake', 'shrug', 'sit', 'stand up', 'think', 'turn',
	'walk', 'wave',
]);

const MANNERS = Object.freeze([
	['excited', 'playful'], ['excitedly', 'playful'], ['playful', 'playful'], ['cheerful', 'playful'],
	['gently', 'gentle'], ['gentle', 'gentle'], ['softly', 'gentle'], ['slowly', 'sustained'], ['slow', 'sustained'],
	['calmly', 'sustained'], ['calm', 'sustained'], ['relaxed', 'sustained'],
	['sharply', 'sharp'], ['sharp', 'sharp'], ['quickly', 'sharp'], ['quick', 'sharp'], ['fast', 'sharp'], ['suddenly', 'sharp'], ['snap', 'sharp'],
	['heavily', 'heavy'], ['heavy', 'heavy'], ['hard', 'heavy'], ['forcefully', 'heavy'],
	['lightly', 'light'], ['light', 'light'], ['delicately', 'light'],
	['carefully', 'precise'], ['precisely', 'precise'], ['deliberately', 'precise'],
	['urgently', 'urgent'], ['frantically', 'urgent'], ['desperately', 'urgent'],
	['wearily', 'weary'], ['tired', 'weary'], ['exhausted', 'weary'], ['sadly', 'weary'], ['reluctantly', 'weary'],
]);

const NUMBER_WORDS = Object.freeze({ once: 1, twice: 2, two: 2, three: 3, four: 4, five: 5, six: 6, several: 3, a: 1, one: 1 });

// The same three-decimal rounding compose.js applies after pacing.
const round3 = (n) => Math.round(n * 1000) / 1000;
// Two decimals, used only to recover a beat's authored (pre-scale) timing
// from the scaled value: every timing authored in compose.js has at most two
// decimal places, and the pacing factor keeps the round-trip error under
// half a hundredth, so this snaps back to the exact authored number.
const round2 = (n) => Math.round(n * 100) / 100;

const paceFactor = (effort) => 1.45 - 0.9 * (EFFORTS[effort] ?? EFFORTS.neutral).time;

/**
 * Read the repeat count out of a lowercased prompt, keeping the expression
 * that set it. Mirrors readRepeats() in compose.js, including the default of
 * 2 when the prompt says nothing about repetition.
 */
function readRepeatsDetailed(text) {
	const digits = text.match(/\b(\d{1,2})\s*(times|x)\b/);
	if (digits) return { repeats: Math.min(6, Math.max(1, Number(digits[1]))), expression: digits[0] };
	for (const [word, value] of Object.entries(NUMBER_WORDS)) {
		const found = text.match(new RegExp(`\\b${word}\\s+times\\b`));
		if (found) return { repeats: Math.min(6, value), expression: found[0] };
	}
	if (/\btwice\b/.test(text)) return { repeats: 2, expression: 'twice' };
	const stock = text.match(/\brepeatedly\b|\bover and over\b|\bseveral\b/);
	if (stock) return { repeats: 3, expression: stock[0] };
	return { repeats: 2, expression: null };
}

/**
 * Audit how the model-free lane composes a prompt.
 *
 * @param {string} prompt the raw prompt, exactly as composeScore() would get it
 * @param {{ name?: string, loop?: boolean, effort?: string }} [opts]
 *   read only, never modified
 * @returns {object} a JSON-serializable audit. On a recognized prompt:
 *   `matched`, `matchedPhrase`, `matchSource` ('synonym' or 'action'),
 *   `side`, `direction`, `manner` ({ word, effort }), `effort`,
 *   `effortSource` ('opts', 'manner' or 'default'), `repeats`,
 *   `repeatsExpression`, `seed`, `loop`, `factor`, and one entry per beat in
 *   `beats` with the label, the pre-scale and post-scale in/hold, and the
 *   factor used. On an empty prompt the result is degraded with
 *   `degradation: 'empty input'`; on an unrecognized one with
 *   `degradation: 'unrecognized action'`. Either way `reason` matches
 *   composeScore() and nothing throws. `checks` is an ordered list of
 *   { name, passed, reason } items; `passed` is their conjunction.
 */
export function auditCompose(prompt, opts = {}) {
	const text = String(prompt ?? '').toLowerCase().trim();
	const composed = composeScore(prompt, opts);
	const checks = [];
	const check = (name, passed, reason) => {
		checks.push({ name, passed, reason: passed ? null : reason });
		return passed;
	};

	const base = {
		prompt: String(prompt ?? ''),
		text,
		matched: null,
		matchedPhrase: null,
		matchSource: null,
		side: null,
		direction: null,
		manner: { word: null, effort: null },
		effort: null,
		effortSource: null,
		repeats: null,
		repeatsExpression: null,
		seed: null,
		loop: opts.loop === true,
		factor: null,
		beats: [],
		reason: composed.reason,
		degraded: true,
		degradation: null,
		checks,
		passed: false,
	};

	if (!check('input is not empty', text.length > 0, 'the prompt is empty or only whitespace')) {
		return { ...base, degradation: 'empty input' };
	}

	// Phrases first, then bare action names, in the same order compose.js
	// tries them, so the reported phrase is the one that actually won.
	const synonym = SYNONYMS.find(([phrase]) => text.includes(phrase));
	const bare = synonym ? null : BARE_ACTIONS.find((name) => text.includes(name));
	const matchedPhrase = synonym ? synonym[0] : bare ?? null;
	const matched = synonym ? synonym[1] : bare ? bare.replace(/ /g, '_') : null;
	const matchSource = synonym ? 'synonym' : bare ? 'action' : null;

	if (!check('action recognized', matched !== null, `no known action in the prompt; reason: ${composed.reason}`)) {
		return { ...base, degradation: 'unrecognized action' };
	}

	check(
		'matched phrase appears in the lowercased prompt',
		text.includes(matchedPhrase),
		`the phrase "${matchedPhrase}" was reported but does not appear in the lowercased prompt`,
	);
	check(
		'matched action agrees with composeScore',
		matched === composed.matched,
		`the audit read "${matched}" but composeScore matched "${composed.matched}"`,
	);

	const side = /\bleft\b/.test(text) && !/\bturn(s|ing)? left\b/.test(text) ? 'left' : 'right';
	const direction = /\b(down|downward|floor|ground)\b/.test(text)
		? 'down'
		: /\b(up|upward|sky|ceiling)\b/.test(text)
			? 'up'
			: /\bleft\b/.test(text)
				? 'left'
				: /\bright\b/.test(text)
					? 'right'
					: 'forward';

	const manner = MANNERS.find(([word]) => new RegExp(`\\b${word}\\b`).test(text)) ?? null;
	const effortFromOpts = Boolean(opts.effort) && Boolean(EFFORTS[opts.effort]);
	const effort = effortFromOpts ? opts.effort : manner ? manner[1] : 'neutral';
	const effortSource = effortFromOpts ? 'opts' : manner ? 'manner' : 'default';

	check(
		'effort is a known effort preset',
		Boolean(EFFORTS[effort]),
		`"${effort}" is not one of ${Object.keys(EFFORTS).join(', ')}`,
	);

	const { repeats, expression: repeatsExpression } = readRepeatsDetailed(text);
	check(
		'repeats within 1..6',
		repeats >= 1 && repeats <= 6,
		`repeats resolved to ${repeats}, outside the 1..6 range`,
	);

	const seed = `${matched}:${side}:${direction}:${effort}:${repeats}:${opts.loop ? 'loop' : 'once'}`;
	check(
		'seed consistent with the parsed modifiers',
		composed.score !== null && composed.score.seed === seed,
		`the parsed modifiers give seed "${seed}" but composeScore produced "${composed.score?.seed ?? null}"`,
	);

	const factor = paceFactor(composed.score?.effort ?? effort);
	const beats = (composed.score?.beats ?? []).map((beat, index) => {
		const rawIn = typeof beat.in === 'number' ? round2(beat.in / factor) : null;
		const rawHold = typeof beat.hold === 'number' ? round2(beat.hold / factor) : null;
		const inOk = rawIn === null || beat.in === round3(rawIn * factor);
		const holdOk = rawHold === null || beat.hold === round3(rawHold * factor);
		check(
			`beat ${index} "${beat.label ?? 'untitled'}" pacing`,
			inOk && holdOk,
			`scaled timing does not equal the pre-scale timing times the factor ${factor}`,
		);
		return {
			index,
			label: beat.label ?? null,
			in: { raw: rawIn, scaled: typeof beat.in === 'number' ? beat.in : null },
			hold: { raw: rawHold, scaled: typeof beat.hold === 'number' ? beat.hold : null },
			factor,
		};
	});

	return {
		...base,
		matched,
		matchedPhrase,
		matchSource,
		side,
		direction,
		manner: { word: manner ? manner[0] : null, effort: manner ? manner[1] : null },
		effort,
		effortSource,
		repeats,
		repeatsExpression,
		seed,
		factor,
		beats,
		reason: composed.reason,
		degraded: false,
		degradation: null,
		passed: checks.every((item) => item.passed),
	};
}
