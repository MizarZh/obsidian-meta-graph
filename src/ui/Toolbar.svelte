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
		onRenameChart,
		onChartType,
		onDeleteChart,
		onFlowEdgeStyle,
		onFlowDirection,
		onFit,
		onRefresh,
		showDebugButton,
		debugOpen,
		onToggleDebug,
	}: {
		mode: ViewMode;
		charts: MetaGraphChart[];
		activeChartId: string;
		flowEdgeStyle: FlowEdgeStyle;
		flowDirection: FlowDirection;
		onSelectChart: (id: string) => void;
		onAddChart: () => void;
		onRenameChart: (name: string) => void;
		onChartType: (mode: ViewMode) => void;
		onDeleteChart: () => void;
		onFlowEdgeStyle: (style: FlowEdgeStyle) => void;
		onFlowDirection: (direction: FlowDirection) => void;
		onFit: () => void;
		onRefresh: () => void;
		showDebugButton: boolean;
		debugOpen: boolean;
		onToggleDebug: () => void;
	} = $props();

	let pickerOpen = $state(false);
	let configOpen = $state(false);
	let creatingView = $state(false);
	let search = $state('');
	let draftName = $state('');

	const activeChart = $derived(
		charts.find((chart) => chart.id === activeChartId) ?? charts[0],
	);
	const filteredCharts = $derived(
		charts.filter((chart) =>
			chart.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
		),
	);

	function togglePicker(): void {
		pickerOpen = !pickerOpen;
		configOpen = false;
		creatingView = false;
		search = '';
	}

	function openConfig(isCreating = false): void {
		draftName = activeChart?.name ?? '';
		configOpen = true;
		creatingView = isCreating;
		pickerOpen = false;
	}

	function closeConfig(): void {
		configOpen = false;
		creatingView = false;
	}

	function selectChart(id: string): void {
		onSelectChart(id);
		pickerOpen = false;
	}

	function configureChart(id: string): void {
		onSelectChart(id);
		pickerOpen = false;
		window.requestAnimationFrame(() => openConfig());
	}

	function addChart(): void {
		onAddChart();
		pickerOpen = false;
		window.requestAnimationFrame(() => openConfig(true));
	}

	function commitName(): void {
		onRenameChart(draftName);
	}
</script>

<div class="knowledge-workspace-toolbar">
	<div class="knowledge-workspace-view-switcher">
		<button
			class="knowledge-workspace-view-trigger"
			aria-haspopup="menu"
			aria-expanded={pickerOpen}
			onclick={togglePicker}
		>
			<span
				class={`knowledge-workspace-view-icon ${activeChart?.type ?? 'graph'}`}
				aria-hidden="true"
			></span>
			<span class="knowledge-workspace-view-name">{activeChart?.name ?? 'View'}</span>
			<span class="knowledge-workspace-view-caret" aria-hidden="true">v</span>
		</button>
		<button
			class="knowledge-workspace-view-config-button"
			aria-label="Configure view"
			onclick={() => openConfig()}
		>
			...
		</button>

		{#if pickerOpen}
			<div class="knowledge-workspace-view-menu" role="menu">
				<label class="knowledge-workspace-view-search">
					<span aria-hidden="true"></span>
					<input
						type="search"
						placeholder="Search views..."
						bind:value={search}
					/>
				</label>
				<div class="knowledge-workspace-view-list">
					{#each filteredCharts as chart (chart.id)}
						<div
							class:active={chart.id === activeChartId}
							class="knowledge-workspace-view-row"
						>
							<button role="menuitem" onclick={() => selectChart(chart.id)}>
								<span
									class={`knowledge-workspace-view-icon ${chart.type}`}
									aria-hidden="true"
								></span>
								<span>{chart.name}</span>
							</button>
							<button
								class="knowledge-workspace-view-row-config"
								aria-label={`Configure ${chart.name}`}
								onclick={() => configureChart(chart.id)}
							>
								&gt;
							</button>
						</div>
					{/each}
				</div>
				<button
					class="knowledge-workspace-add-view"
					role="menuitem"
					onclick={addChart}
				>
					<span aria-hidden="true">+</span>
					<span>Add view</span>
				</button>
			</div>
		{/if}

		{#if configOpen}
			<div class="knowledge-workspace-view-config" role="dialog" aria-label="Configure view">
				<header>
					<button aria-label="Back to views" onclick={() => {
						configOpen = false;
						creatingView = false;
						pickerOpen = true;
					}}>&lt;</button>
					<span>{creatingView ? 'Create view' : 'Configure view'}</span>
					<button aria-label="Close" onclick={closeConfig}>x</button>
				</header>
				<input
					class="knowledge-workspace-view-title-input"
					type="text"
					value={draftName}
					oninput={(event) => {
						draftName = event.currentTarget.value;
					}}
					onchange={commitName}
					onblur={commitName}
				/>
				<label>
					<span>Layout</span>
					<select
						value={mode}
						onchange={(event) =>
							onChartType(event.currentTarget.value as ViewMode)}
					>
						<option value="graph">Graph</option>
						<option value="flow">Flow</option>
					</select>
				</label>
				{#if !creatingView}
					<button
						class="knowledge-workspace-delete-view"
						disabled={charts.length <= 1}
						onclick={() => {
							onDeleteChart();
							closeConfig();
						}}
					>
						Delete view
					</button>
				{/if}
			</div>
		{/if}
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
	{#if showDebugButton}
		<button class:active={debugOpen} onclick={onToggleDebug}>Debug</button>
	{/if}
</div>
