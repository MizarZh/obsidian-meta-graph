import type { ModeCapabilities } from '../../graph/renderers/renderer-adapter';

export type PlanarDragAction =
	{ kind: 'manual-position' } | { kind: 'force-simulation' };

export type PlanarDragEndAction =
	{ kind: 'commit-manual-position' } | { kind: 'release-force-simulation' };

export function getPlanarDragAction(
	capabilities: Pick<ModeCapabilities, 'supportsFreeNodeDrag'>,
): PlanarDragAction {
	return capabilities.supportsFreeNodeDrag
		? { kind: 'manual-position' }
		: { kind: 'force-simulation' };
}

export function getPlanarDragEndAction(
	capabilities: Pick<ModeCapabilities, 'supportsFreeNodeDrag'>,
): PlanarDragEndAction {
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
