<script lang="ts">
	import type {
		FlowDirection,
		FlowEdgeStyle,
		ViewMode,
	} from '../core/types';

	let {
		mode,
		flowEdgeStyle,
		flowDirection,
		onMode,
		onFlowEdgeStyle,
		onFlowDirection,
		onFit,
		onRefresh,
	}: {
		mode: ViewMode;
		flowEdgeStyle: FlowEdgeStyle;
		flowDirection: FlowDirection;
		onMode: (mode: ViewMode) => void;
		onFlowEdgeStyle: (style: FlowEdgeStyle) => void;
		onFlowDirection: (direction: FlowDirection) => void;
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
		<div class="knowledge-workspace-segmented" aria-label="Flow direction">
			{#each ['LR', 'RL', 'TD', 'DT'] as direction}
				<button
					class:active={flowDirection === direction}
					onclick={() => onFlowDirection(direction as FlowDirection)}
					>{direction}</button
				>
			{/each}
		</div>
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
	<button onclick={onFit}>Fit graph</button>
	<button onclick={onRefresh}>Refresh</button>
</div>
