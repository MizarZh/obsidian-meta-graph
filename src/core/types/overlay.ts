export type SidePanelId = 'nodes' | 'details' | 'pinned' | 'templates';
export type CornerPanelId = 'minimap' | 'legend' | 'trace';
export type OverlayPanelId = SidePanelId | CornerPanelId | 'timeline';
export type SidePosition = 'left' | 'right';
export type CornerPosition =
	'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type OverlayPosition = SidePosition | CornerPosition | 'top' | 'bottom';
export interface OverlayLayout {
	positions: Record<OverlayPanelId, OverlayPosition>;
	hiddenPanels: SidePanelId[];
	activeTabs: Partial<Record<OverlayPosition, OverlayPanelId>>;
}
