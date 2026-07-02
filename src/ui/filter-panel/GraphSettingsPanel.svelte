<script lang="ts">
	import CollapsibleSettingsGroup from './CollapsibleSettingsGroup.svelte';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '../obsidian/ObsidianDropdown.svelte';
	import ObsidianSlider from '../obsidian/ObsidianSlider.svelte';
	import ObsidianTextInput from '../obsidian/ObsidianTextInput.svelte';
	import ObsidianToggle from '../obsidian/ObsidianToggle.svelte';
	import type {
		ArcDirection,
		FlowDirection,
		FlowEdgeStyle,
		GraphQuery,
		LayoutNodeSort,
		LayoutSortDirection,
		ViewMode,
	} from '../../core/types';

	let {
		mode,
		fadeDistance,
		labelDensity,
		cubeFaceOpacity,
		forceLabels,
		enableForceLayout,
		flowEdgeStyle,
		flowDirection,
		arcDirection,
		nodeSort,
		nodeSortDirection,
		graphCenterForce,
		graphRepelForce,
		graphLinkForce,
		graphDragLinkForce,
		graphReturnForce,
		graphLinkDistance,
		flowLayerSpacing,
		flowLaneSpacing,
		arcSpacing,
		query,
		onFlowEdgeStyle,
		onFlowDirection,
		onArcDirection,
		onLayoutNodeSort,
		onLayoutSortDirection,
		onFadeDistance,
		onLabelDensity,
		onCubeFaceOpacity,
		onForceLabels,
		onEnableForceLayout,
		onGraphSpacing,
		onGraphCenterForce,
		onGraphRepelForce,
		onGraphLinkForce,
		onGraphDragLinkForce,
		onGraphReturnForce,
		onGraphLinkDistance,
		onFlowLayerSpacing,
		onFlowLaneSpacing,
		onArcSpacing,
		onChange,
	}: {
		mode: ViewMode;
		fadeDistance: number;
		labelDensity: number;
		cubeFaceOpacity: number;
		forceLabels: boolean;
		enableForceLayout: boolean;
		flowEdgeStyle: FlowEdgeStyle;
		flowDirection: FlowDirection;
		arcDirection: ArcDirection;
		nodeSort: LayoutNodeSort;
		nodeSortDirection: LayoutSortDirection;
		graphCenterForce: number;
		graphRepelForce: number;
		graphLinkForce: number;
		graphDragLinkForce: number;
		graphReturnForce: number;
		graphLinkDistance: number;
		flowLayerSpacing: number;
		flowLaneSpacing: number;
		arcSpacing: number;
		query: GraphQuery;
		onFlowEdgeStyle: (style: FlowEdgeStyle) => void;
		onFlowDirection: (direction: FlowDirection) => void;
		onArcDirection: (direction: ArcDirection) => void;
		onLayoutNodeSort: (sort: LayoutNodeSort) => void;
		onLayoutSortDirection: (direction: LayoutSortDirection) => void;
		onFadeDistance: (value: number) => void;
		onLabelDensity: (value: number) => void;
		onCubeFaceOpacity: (value: number) => void;
		onForceLabels: (value: boolean) => void;
		onEnableForceLayout: (value: boolean) => void;
		onGraphSpacing: (spacing: number) => void;
		onGraphCenterForce: (value: number) => void;
		onGraphRepelForce: (value: number) => void;
		onGraphLinkForce: (value: number) => void;
		onGraphDragLinkForce: (value: number) => void;
		onGraphReturnForce: (value: number) => void;
		onGraphLinkDistance: (value: number) => void;
		onFlowLayerSpacing: (spacing: number) => void;
		onFlowLaneSpacing: (spacing: number) => void;
		onArcSpacing: (spacing: number) => void;
		onChange: (patch: Partial<Omit<GraphQuery, 'roots'>>) => void;
	} = $props();

	let queryOpen = $state(true);
	let layoutOpen = $state(true);
	let forcesOpen = $state(true);
	let displayOpen = $state(true);
	let flowDetailsOpen = $state(true);
	let arcDetailsOpen = $state(true);
	let sortOpen = $state(true);

	function formatCompact(value: number, precision: number): string {
		return value.toFixed(precision).replace(/\.?0+$/u, '');
	}

	function commitSpacing(spacing: number): void {
		if (mode === 'graph' || mode === 'graph-3d' || mode === 'cube') {
			onGraphSpacing(spacing);
		}
		if (mode === 'arc') onArcSpacing(spacing);
	}

	const NODE_SORT_OPTIONS: Array<{ value: LayoutNodeSort; label: string }> = [
		{ value: 'name', label: 'Name' },
		{ value: 'path', label: 'Path' },
		{ value: 'folder', label: 'Folder' },
		{ value: 'type', label: 'Type' },
		{ value: 'tag', label: 'Tag' },
		{ value: 'domain', label: 'Domain' },
		{ value: 'created', label: 'Created time' },
		{ value: 'modified', label: 'Modified time' },
		{ value: 'degree', label: 'Degree' },
		{ value: 'in-degree', label: 'In degree' },
		{ value: 'out-degree', label: 'Out degree' },
	];

	const SORT_DIRECTION_OPTIONS: Array<{
		value: LayoutSortDirection;
		label: string;
	}> = [
		{ value: 'asc', label: 'Ascending' },
		{ value: 'desc', label: 'Descending' },
	];
</script>

<section>
	<header><h3>Graph settings</h3></header>
	<CollapsibleSettingsGroup title="Query" bind:open={queryOpen}>
		<label class="knowledge-workspace-rule-label">
			<span>Max nodes</span>
			<ObsidianTextInput
				type="number"
				min="1"
				max="9999"
				step="1"
				value={query.maxNodes}
				onChange={(value) => {
					const parsed = Number.parseInt(value, 10);
					if (Number.isFinite(parsed) && parsed > 0) {
						onChange({ maxNodes: parsed });
					}
				}}
			/>
		</label>
		<label class="knowledge-workspace-rule-label">
			<span>Show isolated nodes</span>
			<ObsidianToggle
				value={query.showIsolatedNodes}
				onChange={(value) => onChange({ showIsolatedNodes: value })}
			/>
		</label>
		<label class="knowledge-workspace-rule-label">
			<span>Show plain links</span>
			<ObsidianToggle
				value={query.showPlainLinks}
				onChange={(value) => onChange({ showPlainLinks: value })}
			/>
		</label>
	</CollapsibleSettingsGroup>
	{#if mode === 'graph' || mode === 'graph-3d' || mode === 'cube'}
		<CollapsibleSettingsGroup title="Layout" bind:open={layoutOpen}>
			<label class="knowledge-workspace-rule-label">
				<span>Force layout</span>
				<ObsidianToggle
					value={enableForceLayout}
					onChange={onEnableForceLayout}
				/>
			</label>
			<label class="knowledge-workspace-rule-label">
				<span>Link distance</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						min={50}
						max={800}
						step={10}
						value={graphLinkDistance}
						format={(value) => `${Math.round(value)}`}
						onChange={onGraphLinkDistance}
						onCommit={onGraphLinkDistance}
					/>
					<span>{Math.round(graphLinkDistance)}</span>
				</div>
			</label>
		</CollapsibleSettingsGroup>
		<CollapsibleSettingsGroup title="Forces" bind:open={forcesOpen}>
			<label class="knowledge-workspace-rule-label">
				<span>Center force</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						min={0}
						max={5}
						step={0.05}
						value={graphCenterForce}
						format={(value) => formatCompact(value, 2)}
						onChange={onGraphCenterForce}
						onCommit={onGraphCenterForce}
					/>
					<span>{formatCompact(graphCenterForce, 2)}</span>
				</div>
			</label>
			<label class="knowledge-workspace-rule-label">
				<span>Repel force</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						min={0}
						max={20}
						step={0.1}
						value={graphRepelForce}
						format={(value) => formatCompact(value, 1)}
						onChange={onGraphRepelForce}
						onCommit={onGraphRepelForce}
					/>
					<span>{formatCompact(graphRepelForce, 1)}</span>
				</div>
			</label>
			<label class="knowledge-workspace-rule-label">
				<span>Link force</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						min={0}
						max={5}
						step={0.05}
						value={graphLinkForce}
						format={(value) => formatCompact(value, 2)}
						onChange={onGraphLinkForce}
						onCommit={onGraphLinkForce}
					/>
					<span>{formatCompact(graphLinkForce, 2)}</span>
				</div>
			</label>
			<label class="knowledge-workspace-rule-label">
				<span>Drag link force</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						min={0}
						max={5}
						step={0.05}
						value={graphDragLinkForce}
						format={(value) => formatCompact(value, 2)}
						onChange={onGraphDragLinkForce}
						onCommit={onGraphDragLinkForce}
					/>
					<span>{formatCompact(graphDragLinkForce, 2)}</span>
				</div>
			</label>
			<label class="knowledge-workspace-rule-label">
				<span>Return force</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						min={0}
						max={5}
						step={0.05}
						value={graphReturnForce}
						format={(value) => formatCompact(value, 2)}
						onChange={onGraphReturnForce}
						onCommit={onGraphReturnForce}
					/>
					<span>{formatCompact(graphReturnForce, 2)}</span>
				</div>
			</label>
		</CollapsibleSettingsGroup>
	{:else if mode === 'flow'}
		<CollapsibleSettingsGroup title="Layout" bind:open={layoutOpen}>
			<label class="knowledge-workspace-rule-label">
				<span>Layer spacing</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						min={0.25}
						max={4}
						step={0.25}
						value={flowLayerSpacing}
						format={(value) => formatCompact(value, 2)}
						onChange={onFlowLayerSpacing}
						onCommit={onFlowLayerSpacing}
					/>
					<span>{formatCompact(flowLayerSpacing, 2)}</span>
				</div>
			</label>
			<label class="knowledge-workspace-rule-label">
				<span>Lane spacing</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						min={0.25}
						max={4}
						step={0.25}
						value={flowLaneSpacing}
						format={(value) => formatCompact(value, 2)}
						onChange={onFlowLaneSpacing}
						onCommit={onFlowLaneSpacing}
					/>
					<span>{formatCompact(flowLaneSpacing, 2)}</span>
				</div>
			</label>
		</CollapsibleSettingsGroup>
	{:else if mode === 'arc'}
		<CollapsibleSettingsGroup title="Layout" bind:open={layoutOpen}>
			<label class="knowledge-workspace-rule-label">
				<span>Spacing</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						min={0.25}
						max={4}
						step={0.25}
						value={arcSpacing}
						format={(value) => formatCompact(value, 2)}
						onChange={commitSpacing}
						onCommit={commitSpacing}
					/>
					<span>{formatCompact(arcSpacing, 2)}</span>
				</div>
			</label>
		</CollapsibleSettingsGroup>
	{/if}
	{#if mode === 'arc' || mode === 'hierarchical-edge-bundling'}
		<CollapsibleSettingsGroup title="Sort" bind:open={sortOpen}>
			<label class="knowledge-workspace-rule-label">
				<span>Sort by</span>
				<ObsidianDropdown
					value={nodeSort}
					options={NODE_SORT_OPTIONS}
					onChange={(value) => onLayoutNodeSort(value as LayoutNodeSort)}
				/>
			</label>
			<label class="knowledge-workspace-rule-label">
				<span>Order</span>
				<ObsidianDropdown
					value={nodeSortDirection}
					options={SORT_DIRECTION_OPTIONS}
					onChange={(value) =>
						onLayoutSortDirection(value as LayoutSortDirection)}
				/>
			</label>
		</CollapsibleSettingsGroup>
	{/if}
	<CollapsibleSettingsGroup title="Display" bind:open={displayOpen}>
		<label class="knowledge-workspace-rule-label">
			<span>Fade distance</span>
			<div class="knowledge-workspace-slider-value">
				<ObsidianSlider
					value={fadeDistance}
					min={0.25}
					max={4}
					step={0.05}
					format={(value) => formatCompact(value, 2)}
					onChange={onFadeDistance}
					onCommit={onFadeDistance}
				/>
				<span>{formatCompact(fadeDistance, 2)}</span>
			</div>
		</label>
		<label class="knowledge-workspace-rule-label">
			<span>Label density</span>
			<div class="knowledge-workspace-slider-value">
				<ObsidianSlider
					value={labelDensity}
					min={0}
					max={1}
					step={0.05}
					format={(value) => `${Math.round(value * 100)}%`}
					onChange={onLabelDensity}
					onCommit={onLabelDensity}
				/>
				<span>{Math.round(labelDensity * 100)}%</span>
			</div>
		</label>
		{#if mode === 'cube'}
			<label class="knowledge-workspace-rule-label">
				<span>Face opacity</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						value={cubeFaceOpacity}
						min={0.05}
						max={1}
						step={0.05}
						format={(value) => `${Math.round(value * 100)}%`}
						onChange={onCubeFaceOpacity}
						onCommit={onCubeFaceOpacity}
					/>
					<span>{Math.round(cubeFaceOpacity * 100)}%</span>
				</div>
			</label>
		{/if}
		<label class="knowledge-workspace-rule-label">
			<span>Always show labels</span>
			<ObsidianToggle value={forceLabels} onChange={onForceLabels} />
		</label>
	</CollapsibleSettingsGroup>
	{#if mode === 'flow'}
		<CollapsibleSettingsGroup
			title="Flow details"
			bind:open={flowDetailsOpen}
		>
			<div class="knowledge-workspace-rule-label segmented">
				<span>Direction</span>
				<div class="knowledge-workspace-segmented">
					{#each ['LR', 'RL', 'TD', 'DT'] as direction}
						<ObsidianButton
							active={flowDirection === direction}
							text={direction}
							onClick={() =>
								onFlowDirection(direction as FlowDirection)}
						/>
					{/each}
				</div>
			</div>
			<div class="knowledge-workspace-rule-label segmented">
				<span>Line</span>
				<div class="knowledge-workspace-segmented">
					<ObsidianButton
						active={flowEdgeStyle === 'straight'}
						text="Straight"
						onClick={() => onFlowEdgeStyle('straight')}
					/>
					<ObsidianButton
						active={flowEdgeStyle === 'orthogonal'}
						text="Orthogonal"
						onClick={() => onFlowEdgeStyle('orthogonal')}
					/>
				</div>
			</div>
		</CollapsibleSettingsGroup>
	{:else if mode === 'arc'}
		<CollapsibleSettingsGroup
			title="Arc details"
			bind:open={arcDetailsOpen}
		>
			<label class="knowledge-workspace-rule-label">
				<span>Direction</span>
				<ObsidianDropdown
					value={arcDirection}
					options={[
						{ value: 'right', label: 'Right' },
						{ value: 'left', label: 'Left' },
						{ value: 'up', label: 'Up' },
						{ value: 'down', label: 'Down' },
					]}
					onChange={(value) => onArcDirection(value as ArcDirection)}
				/>
			</label>
		</CollapsibleSettingsGroup>
	{/if}
</section>
