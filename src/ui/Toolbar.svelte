<script lang="ts">
	import type { FlowEdgeStyle, ViewMode } from '../core/types';

	let {
		mode,
		flowEdgeStyle,
		onMode,
		onFlowEdgeStyle,
		onCurrentNote,
		onFit,
		onRefresh,
	}: {
		mode: ViewMode;
		flowEdgeStyle: FlowEdgeStyle;
		onMode: (mode: ViewMode) => void;
		onFlowEdgeStyle: (style: FlowEdgeStyle) => void;
		onCurrentNote: () => void;
		onFit: () => void;
		onRefresh: () => void;
	} = $props();
</script>

<div class="knowledge-workspace-toolbar">
	<div class="knowledge-workspace-segmented" aria-label="Layout mode">
		<button class:active={mode === 'graph'} onclick={() => onMode('graph')}>Graph</button>
		<button class:active={mode === 'flow'} onclick={() => onMode('flow')}>Flow</button>
	</div>
	{#if mode === 'flow'}
		<div class="knowledge-workspace-segmented" aria-label="Flow edge style">
			<button
				class:active={flowEdgeStyle === 'straight'}
				onclick={() => onFlowEdgeStyle('straight')}>Straight</button
			>
			<button
				class:active={flowEdgeStyle === 'orthogonal'}
				onclick={() => onFlowEdgeStyle('orthogonal')}>Orthogonal</button
			>
		</div>
	{/if}
	<button onclick={onCurrentNote}>Current note</button>
	<button onclick={onFit}>Fit graph</button>
	<button onclick={onRefresh}>Refresh</button>
</div>
