<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SidePanelId, SidePosition } from '@/core/types/overlay';
	import {
		PANEL_LABELS,
		COLLAPSED_SIDE_WIDTH,
	} from '@/workspace/meta-graph/overlay-layout';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import DockResizeHandle from '@/ui/dock-panel/DockResizeHandle.svelte';
	let {
		side,
		panels,
		active,
		open,
		width,
		onSelect,
		onToggle,
		onResize,
		children,
	}: {
		side: SidePosition;
		panels: SidePanelId[];
		active: SidePanelId;
		open: boolean;
		width: number;
		onSelect: (id: SidePanelId) => void;
		onToggle: () => void;
		onResize: (width: number) => void;
		children: Snippet;
	} = $props();
</script>

<aside
	class="knowledge-workspace-overlay-side"
	class:overlay-left={side === 'left'}
	class:overlay-right={side === 'right'}
	class:collapsed={!open}
	style:width={`${open ? width : COLLAPSED_SIDE_WIDTH}px`}
	aria-label={`${side === 'left' ? 'Left' : 'Right'} panels`}
>
	<ObsidianButton
		class="knowledge-workspace-overlay-side-toggle"
		showLabelWithIcon
		text={open ? PANEL_LABELS[active] : ''}
		icon={side === 'left'
			? open
				? 'panel-left-close'
				: 'panel-left-open'
			: open
				? 'panel-right-close'
				: 'panel-right-open'}
		ariaLabel={`${open ? 'Collapse' : 'Expand'} ${PANEL_LABELS[active]}`}
		tooltip={`${open ? 'Collapse' : 'Expand'} ${PANEL_LABELS[active]}`}
		onClick={onToggle}
	/>
	{#if open}
		{#if panels.length > 1}
			<div
				class="knowledge-workspace-overlay-side-tabs knowledge-workspace-segmented knowledge-workspace-setting-segmented"
				role="group"
				aria-label={`${side} panel tabs`}
			>
				{#each panels as id}
					<ObsidianButton
						text={PANEL_LABELS[id]}
						active={id === active}
						onClick={() => onSelect(id)}
					/>
				{/each}
			</div>
		{/if}
		<div class="knowledge-workspace-overlay-side-content">
			{@render children()}
		</div>
		<DockResizeHandle
			{width}
			minWidth={260}
			maxWidth={520}
			ariaLabel={`Resize ${PANEL_LABELS[active]}`}
			class="knowledge-workspace-overlay-side-resize"
			readDelta={(start, current) =>
				side === 'left' ? current - start : start - current}
			{onResize}
		/>
	{/if}
</aside>
