<script lang="ts">
	import { supportsPlanarRenderer } from '@/core/types';
	import { supportsTimeline } from '@/graph/timeline';
	import type { OverlayPanelId, OverlayPosition } from '@/core/types/overlay';
	import type {
		WorkspaceGraphSettingsView,
		WorkspaceGraphSettingsActions,
	} from '@/ui/workspace/settings-ports';
	import {
		PANEL_LABELS,
		overlayPositions,
		SIDE_PANELS,
	} from '@/workspace/meta-graph/overlay-layout';
	import ObsidianDropdown from '@/ui/obsidian/ObsidianDropdown.svelte';
	import ObsidianToggle from '@/ui/obsidian/ObsidianToggle.svelte';
	let {
		view,
		actions,
	}: {
		view: WorkspaceGraphSettingsView;
		actions: WorkspaceGraphSettingsActions;
	} = $props();
	const positions: Record<OverlayPosition, string> = {
		left: 'Left',
		right: 'Right',
		'top-left': 'Top left',
		'top-right': 'Top right',
		'bottom-left': 'Bottom left',
		'bottom-right': 'Bottom right',
		top: 'Top',
		bottom: 'Bottom',
	};
	const panels = $derived(
		(Object.keys(PANEL_LABELS) as OverlayPanelId[]).filter(
			(id) =>
				(id !== 'minimap' || supportsPlanarRenderer(view.mode)) &&
				(id !== 'timeline' || supportsTimeline(view.mode)),
		),
	);
	function visible(id: OverlayPanelId): boolean {
		if (id === 'minimap') return view.showMinimap;
		if (id === 'legend') return view.showLegend;
		if (id === 'trace') return view.showTrace;
		if (id === 'timeline') return view.timelineEnabled;
		return !view.overlayLayout.hiddenPanels.includes(id);
	}
	function setVisible(id: OverlayPanelId, value: boolean): void {
		if (id === 'minimap') actions.setShowMinimap(value);
		else if (id === 'legend') actions.setShowLegend(value);
		else if (id === 'trace') actions.setShowTrace(value);
		else if (id === 'timeline') actions.setTimelineEnabled(value);
		else
			actions.setOverlayLayout({
				...view.overlayLayout,
				hiddenPanels: SIDE_PANELS.filter((panel) =>
					panel === id
						? !value
						: view.overlayLayout.hiddenPanels.includes(panel),
				),
			});
	}
</script>

<section>
	<header><h3>Overlays</h3></header>
	<div class="knowledge-workspace-overlay-settings">
		{#each panels as id}
			<div class="knowledge-workspace-overlay-setting">
				<span>{PANEL_LABELS[id]}</span>
				<ObsidianToggle
					value={visible(id)}
					ariaLabel={`Show ${PANEL_LABELS[id]}`}
					onChange={(value) => setVisible(id, value)}
				/>
				<ObsidianDropdown
					ariaLabel={`${PANEL_LABELS[id]} position`}
					value={view.overlayLayout.positions[id]}
					options={overlayPositions(id).map((value) => ({
						value,
						label: positions[value],
					}))}
					onChange={(value) =>
						actions.setOverlayLayout({
							...view.overlayLayout,
							positions: {
								...view.overlayLayout.positions,
								[id]: value as OverlayPosition,
							},
						})}
				/>
			</div>
		{/each}
	</div>
</section>
