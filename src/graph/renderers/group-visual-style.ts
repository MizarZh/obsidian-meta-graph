export const GROUP_TITLE_FONT_SIZE = 11;
export const GROUP_TITLE_FONT_WEIGHT = 600;
export const GROUP_TITLE_HEIGHT = 18;
export const GROUP_TITLE_HORIZONTAL_PADDING = 10;
export const GROUP_TITLE_CENTER_OFFSET = 11;
export const GROUP_TITLE_BACKGROUND_OPACITY = 0.88;
export const GROUP_TITLE_STROKE_OPACITY = 0.22;
export const GROUP_CONTAINER_CORNER_RADIUS = 8;
export const GROUP_MEMBER_HALO_GAP = 2.5;
export const GROUP_FOCUS_MUTED_OPACITY = 0.38;

export interface GroupVisualState {
	selected?: boolean;
	hovered?: boolean;
	dropTarget?: boolean;
	muted?: boolean;
}

export interface GroupRegionVisualStyle {
	fillOpacity: number;
	strokeOpacity: number;
	lineWidth: number;
	opacity: number;
}

export interface GroupHaloVisualStyle {
	strokeOpacity: number;
	lineWidth: number;
	opacity: number;
}

export function resolveGroupRegionVisualStyle(
	state: GroupVisualState,
): GroupRegionVisualStyle {
	return {
		fillOpacity: state.dropTarget
			? 0.18
			: state.selected
				? 0.12
				: state.hovered
					? 0.08
					: 0.06,
		strokeOpacity: state.dropTarget
			? 1
			: state.selected
				? 0.9
				: state.hovered
					? 0.8
					: 0.55,
		lineWidth: state.dropTarget
			? 2.5
			: state.selected
				? 2
				: state.hovered
					? 1.75
					: 1.5,
		opacity: state.muted ? GROUP_FOCUS_MUTED_OPACITY : 1,
	};
}

export function resolveGroupHaloVisualStyle(
	state: GroupVisualState,
): GroupHaloVisualStyle {
	return {
		strokeOpacity: state.selected ? 1 : state.hovered ? 0.85 : 0.65,
		lineWidth: state.selected ? 2.5 : state.hovered ? 2 : 1.5,
		opacity: state.muted ? GROUP_FOCUS_MUTED_OPACITY : 1,
	};
}
