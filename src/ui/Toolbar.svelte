<script lang="ts">
	import type {
		FlowDirection,
		FlowEdgeStyle,
		MetaGraphChart,
		ViewMode,
	} from '../core/types';

	let {
		mode,
		charts,
		activeChartId,
		flowEdgeStyle,
		flowDirection,
		onSelectChart,
		onAddChart,
		onDeleteChart,
		onFlowEdgeStyle,
		onFlowDirection,
		onFit,
		onRefresh,
	}: {
		mode: ViewMode;
		charts: MetaGraphChart[];
		activeChartId: string;
		flowEdgeStyle: FlowEdgeStyle;
		flowDirection: FlowDirection;
		onSelectChart: (id: string) => void;
		onAddChart: (mode: ViewMode) => void;
		onDeleteChart: () => void;
		onFlowEdgeStyle: (style: FlowEdgeStyle) => void;
		onFlowDirection: (direction: FlowDirection) => void;
		onFit: () => void;
		onRefresh: () => void;
	} = $props();

</script>

<div class="knowledge-workspace-toolbar">
	<div class="knowledge-workspace-workspace-picker">
		<select
			aria-label="Chart"
			value={activeChartId}
			onchange={(event) => onSelectChart(event.currentTarget.value)}
		>
			{#each charts as chart (chart.id)}
				<option
					value={chart.id}
					selected={chart.id === activeChartId}
				>
					{chart.name}
				</option>
			{/each}
		</select>
		<button onclick={() => onAddChart('graph')}>Add graph</button>
		<button onclick={() => onAddChart('flow')}>Add flow</button>
		<button disabled={charts.length <= 1} onclick={onDeleteChart}>Delete</button>
	</div>
	<span class="knowledge-workspace-chart-type">{mode === 'graph' ? 'Graph' : 'Flow'}</span>
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
