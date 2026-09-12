import type {
	OverlayLayout,
	OverlayPanelId,
	OverlayPosition,
	SidePanelId,
} from '@/core/types/overlay';
export const COLLAPSED_SIDE_WIDTH = 32;
export const SIDE_PANELS: SidePanelId[] = [
	'nodes',
	'details',
	'pinned',
	'templates',
];
export const CORNER_POSITIONS = [
	'top-left',
	'top-right',
	'bottom-left',
	'bottom-right',
] as const;
export const PANEL_LABELS: Record<OverlayPanelId, string> = {
	nodes: 'Node list',
	details: 'Details',
	pinned: 'Pinned notes',
	templates: 'Templates',
	minimap: 'Minimap',
	legend: 'Legend',
	trace: 'Trace',
	timeline: 'Timeline',
};
export function overlayPositions(
	id: OverlayPanelId,
): readonly OverlayPosition[] {
	return id === 'timeline'
		? ['top', 'bottom']
		: SIDE_PANELS.includes(id as SidePanelId)
			? ['left', 'right']
			: CORNER_POSITIONS;
}
export function createOverlayLayout(): OverlayLayout {
	return {
		positions: {
			nodes: 'left',
			details: 'right',
			pinned: 'right',
			templates: 'right',
			minimap: 'bottom-right',
			legend: 'bottom-right',
			trace: 'bottom-right',
			timeline: 'bottom',
		},
		hiddenPanels: [],
		activeTabs: {},
	};
}
export function normalizeOverlayLayout(value: unknown): OverlayLayout {
	const result = createOverlayLayout();
	if (!value || typeof value !== 'object') return result;
	const raw = value as Partial<OverlayLayout>;
	for (const id of Object.keys(result.positions) as OverlayPanelId[]) {
		const position = raw.positions?.[id];
		if (position && overlayPositions(id).includes(position))
			result.positions[id] = position;
	}
	result.hiddenPanels = SIDE_PANELS.filter(
		(id) =>
			Array.isArray(raw.hiddenPanels) && raw.hiddenPanels.includes(id),
	);
	for (const position of ['left', 'right', ...CORNER_POSITIONS] as const) {
		const id = raw.activeTabs?.[position];
		if (id && result.positions[id] === position)
			result.activeTabs[position] = id;
	}
	return result;
}
export function sidePanelsAt(
	layout: OverlayLayout,
	position: 'left' | 'right',
): SidePanelId[] {
	return SIDE_PANELS.filter(
		(id) =>
			layout.positions[id] === position &&
			!layout.hiddenPanels.includes(id),
	);
}
export function activeOverlayTab<T extends OverlayPanelId>(
	layout: OverlayLayout,
	position: OverlayPosition,
	panels: readonly T[],
): T | undefined {
	const active = layout.activeTabs[position];
	return panels.find((id) => id === active) ?? panels[0];
}
