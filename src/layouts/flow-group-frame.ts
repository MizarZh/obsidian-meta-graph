/** Graph units: reserve space during layout, not while drawing the frame. */
export const FLOW_GROUP_BASE_PADDING = 24;
export const FLOW_GROUP_TITLE_FONT_SIZE = 12;
export const FLOW_GROUP_TITLE_HEIGHT = 24;
export const FLOW_GROUP_TITLE_MAX_WIDTH = 160;
export const FLOW_GROUP_TITLE_GAP = 8;
/** Reserve only nominal title dimensions; zoom never inflates the layout. */
export const FLOW_GROUP_TITLE_RESERVE_SCALE = 1;
export const FLOW_GROUP_HEADER_HEIGHT =
	(FLOW_GROUP_TITLE_HEIGHT + FLOW_GROUP_TITLE_GAP * 2) /
	FLOW_GROUP_TITLE_RESERVE_SCALE;

export function getFlowGroupTitleWidth(
	name?: string,
	measuredTextWidth?: number,
): number {
	const textWidth =
		measuredTextWidth ??
		(name === undefined
			? FLOW_GROUP_TITLE_MAX_WIDTH - 20
			: Array.from(name).reduce(
					(width, character) =>
						width +
						(character.charCodeAt(0) > 255 ||
						/[MW@]/.test(character)
							? 12
							: 8),
					0,
				));
	return Math.max(48, Math.min(FLOW_GROUP_TITLE_MAX_WIDTH, textWidth + 20));
}

export function getFlowGroupMinimumWidth(
	name?: string,
	measuredTextWidth?: number,
): number {
	return (
		(getFlowGroupTitleWidth(name, measuredTextWidth) +
			FLOW_GROUP_TITLE_GAP * 2) /
		FLOW_GROUP_TITLE_RESERVE_SCALE
	);
}

export function getFlowGroupHeaderHeight(shape?: string): number {
	// Circular frames need a wider chord below their topmost point.
	return FLOW_GROUP_HEADER_HEIGHT * (shape === 'circle' ? 2 : 1);
}
