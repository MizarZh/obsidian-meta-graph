import type { ModeCapabilities } from '../../graph/renderer-adapter';

export type SigmaDragAction =
	| { kind: 'manual-position' }
	| { kind: 'force-simulation' };

export type SigmaDragEndAction =
	| { kind: 'commit-manual-position' }
	| { kind: 'release-force-simulation' };

export function getSigmaDragAction(
	capabilities: Pick<ModeCapabilities, 'supportsFreeNodeDrag'>,
): SigmaDragAction {
	return capabilities.supportsFreeNodeDrag
		? { kind: 'manual-position' }
		: { kind: 'force-simulation' };
}

export function getSigmaDragEndAction(
	capabilities: Pick<ModeCapabilities, 'supportsFreeNodeDrag'>,
): SigmaDragEndAction {
	return capabilities.supportsFreeNodeDrag
		? { kind: 'commit-manual-position' }
		: { kind: 'release-force-simulation' };
}

export function shouldOpenNode(now: number, suppressUntil: number): boolean {
	return now >= suppressUntil;
}

export function getNextNodeOpenSuppressUntil(
	now: number,
	durationMs = 700,
): number {
	return now + durationMs;
}
