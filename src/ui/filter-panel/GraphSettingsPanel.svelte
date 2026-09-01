<script lang="ts">
	import type { App } from 'obsidian';
	import SettingsSection from '../settings/SettingsSection.svelte';
	import DropdownSetting from '../settings/fields/DropdownSetting.svelte';
	import SegmentedSetting from '../settings/fields/SegmentedSetting.svelte';
	import SliderSetting from '../settings/fields/SliderSetting.svelte';
	import TextSetting from '../settings/fields/TextSetting.svelte';
	import ToggleSetting from '../settings/fields/ToggleSetting.svelte';
	import FlowRelationRules from './FlowRelationRules.svelte';
	import { MAX_FLOW_CORNER_RADIUS } from '../../workspace/meta-graph-model';
	import type {
		ArcDirection,
		ArcLabelAngle,
		FlowDirection,
		FlowEdgeStyle,
		FlowRelationRule,
		GraphQuery,
		LayoutNodeSort,
		LayoutSortDirection,
		ViewMode,
	} from '../../core/types';

	let {
		app,
		mode,
		fadeDistance,
		labelDensity,
		cubeFaceOpacity,
		cubeSize,
		cubeFreeCamera,
		forceLabels,
		enableForceLayout,
		flowEdgeStyle,
		flowDirection,
		flowCornerRadius,
		flowRelationRules,
		flowRelationConflictCount,
		flowRelationFieldSuggestions,
		arcDirection,
		arcLabelAngle,
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
		onFlowCornerRadius,
		onFlowRelationRules,
		onArcDirection,
		onArcLabelAngle,
		onLayoutNodeSort,
		onLayoutSortDirection,
		onFadeDistance,
		onLabelDensity,
		onCubeFaceOpacity,
		onCubeSize,
		onCubeFreeCamera,
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
		app: App;
		mode: ViewMode;
		fadeDistance: number;
		labelDensity: number;
		cubeFaceOpacity: number;
		cubeSize: number;
		cubeFreeCamera: boolean;
		forceLabels: boolean;
		enableForceLayout: boolean;
		flowEdgeStyle: FlowEdgeStyle;
		flowDirection: FlowDirection;
		flowCornerRadius: number;
		flowRelationRules: FlowRelationRule[];
		flowRelationConflictCount: number;
		flowRelationFieldSuggestions: string[];
		arcDirection: ArcDirection;
		arcLabelAngle: ArcLabelAngle;
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
		onFlowCornerRadius: (radius: number) => void;
		onFlowRelationRules: (rules: FlowRelationRule[]) => void;
		onArcDirection: (direction: ArcDirection) => void;
		onArcLabelAngle: (angle: ArcLabelAngle) => void;
		onLayoutNodeSort: (sort: LayoutNodeSort) => void;
		onLayoutSortDirection: (direction: LayoutSortDirection) => void;
		onFadeDistance: (value: number) => void;
		onLabelDensity: (value: number) => void;
		onCubeFaceOpacity: (value: number) => void;
		onCubeSize: (value: number) => void;
		onCubeFreeCamera: (value: boolean) => void;
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

	type ModeSettingVisibility = {
		graphLayout: boolean;
		graph3dLayout: boolean;
		graphForces: boolean;
		flowLayout: boolean;
		arcLayout: boolean;
		sort: boolean;
		sigmaDisplay: boolean;
		cubeDisplay: boolean;
		forceLabels: boolean;
	};

	const MODE_SETTING_VISIBILITY: Record<ViewMode, ModeSettingVisibility> = {
		graph: {
			graphLayout: true,
			graph3dLayout: false,
			graphForces: true,
			flowLayout: false,
			arcLayout: false,
			sort: false,
			sigmaDisplay: true,
			cubeDisplay: false,
			forceLabels: true,
		},
		'graph-3d': {
			graphLayout: false,
			graph3dLayout: true,
			graphForces: false,
			flowLayout: false,
			arcLayout: false,
			sort: false,
			sigmaDisplay: false,
			cubeDisplay: false,
			forceLabels: false,
		},
		cube: {
			graphLayout: false,
			graph3dLayout: false,
			graphForces: false,
			flowLayout: false,
			arcLayout: false,
			sort: false,
			sigmaDisplay: false,
			cubeDisplay: true,
			forceLabels: true,
		},
		free: {
			graphLayout: false,
			graph3dLayout: false,
			graphForces: false,
			flowLayout: false,
			arcLayout: false,
			sort: false,
			sigmaDisplay: true,
			cubeDisplay: false,
			forceLabels: true,
		},
		flow: {
			graphLayout: false,
			graph3dLayout: false,
			graphForces: false,
			flowLayout: true,
			arcLayout: false,
			sort: false,
			sigmaDisplay: true,
			cubeDisplay: false,
			forceLabels: true,
		},
		arc: {
			graphLayout: false,
			graph3dLayout: false,
			graphForces: false,
			flowLayout: false,
			arcLayout: true,
			sort: true,
			sigmaDisplay: true,
			cubeDisplay: false,
			forceLabels: true,
		},
		'hierarchical-edge-bundling': {
			graphLayout: false,
			graph3dLayout: false,
			graphForces: false,
			flowLayout: false,
			arcLayout: false,
			sort: true,
			sigmaDisplay: true,
			cubeDisplay: false,
			forceLabels: true,
		},
	};

	const settingsVisibility = $derived(MODE_SETTING_VISIBILITY[mode]);

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
	const ARC_DIRECTION_OPTIONS: Array<{
		value: ArcDirection;
		label: string;
	}> = [
		{ value: 'right', label: 'Right' },
		{ value: 'left', label: 'Left' },
		{ value: 'up', label: 'Up' },
		{ value: 'down', label: 'Down' },
	];
	const ARC_LABEL_ANGLE_OPTIONS: Array<{
		value: ArcLabelAngle;
		label: string;
	}> = [
		{ value: 'auto', label: 'Auto' },
		{ value: 0, label: '0°' },
		{ value: 45, label: '45°' },
		{ value: 90, label: '90°' },
	];
	const FLOW_DIRECTION_OPTIONS: Array<{
		value: FlowDirection;
		label: string;
	}> = [
		{ value: 'LR', label: 'LR' },
		{ value: 'RL', label: 'RL' },
		{ value: 'TD', label: 'TD' },
		{ value: 'DT', label: 'DT' },
	];
	const FLOW_EDGE_STYLE_OPTIONS: Array<{
		value: FlowEdgeStyle;
		label: string;
	}> = [
		{ value: 'straight', label: 'Straight' },
		{ value: 'curve', label: 'Curve' },
		{ value: 'orthogonal', label: 'Orthogonal' },
		{ value: 'bundled', label: 'Bundled' },
	];
	const CAMERA_MODE_OPTIONS = [
		{ value: 'free', label: 'Free' },
		{ value: 'locked', label: 'Lock up' },
	] as const;
</script>

<section>
	<header><h3>Graph settings</h3></header>
	<SettingsSection title="Query" bind:open={queryOpen}>
		<TextSetting
			label="Max nodes"
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
		<ToggleSetting
			label="Show isolated nodes"
			value={query.showIsolatedNodes}
			onChange={(value) => onChange({ showIsolatedNodes: value })}
		/>
		<ToggleSetting
			label="Show plain links"
			value={query.showPlainLinks}
			onChange={(value) => onChange({ showPlainLinks: value })}
		/>
		<ToggleSetting
			label="Show unresolved links"
			value={query.showUnresolvedLinks}
			onChange={(value) => onChange({ showUnresolvedLinks: value })}
		/>
	</SettingsSection>
	{#if settingsVisibility.graphLayout}
		<SettingsSection title="Layout" bind:open={layoutOpen}>
			<ToggleSetting
				label="Force layout"
				value={enableForceLayout}
				onChange={onEnableForceLayout}
			/>
			<SliderSetting
				label="Link distance"
				value={graphLinkDistance}
				min={50}
				max={800}
				step={10}
				format={(value) => `${Math.round(value)}`}
				onChange={onGraphLinkDistance}
				onCommit={onGraphLinkDistance}
			/>
		</SettingsSection>
	{:else if settingsVisibility.graph3dLayout}
		<SettingsSection title="Layout" bind:open={layoutOpen}>
			<ToggleSetting
				label="Drag nodes"
				value={enableForceLayout}
				onChange={onEnableForceLayout}
			/>
		</SettingsSection>
	{/if}
	{#if settingsVisibility.graphForces}
		<SettingsSection title="Forces" bind:open={forcesOpen}>
			<SliderSetting
				label="Center force"
				value={graphCenterForce}
				min={0}
				max={5}
				step={0.05}
				format={(value) => formatCompact(value, 2)}
				onChange={onGraphCenterForce}
				onCommit={onGraphCenterForce}
			/>
			<SliderSetting
				label="Repel force"
				value={graphRepelForce}
				min={0}
				max={20}
				step={0.1}
				format={(value) => formatCompact(value, 1)}
				onChange={onGraphRepelForce}
				onCommit={onGraphRepelForce}
			/>
			<SliderSetting
				label="Link force"
				value={graphLinkForce}
				min={0}
				max={5}
				step={0.05}
				format={(value) => formatCompact(value, 2)}
				onChange={onGraphLinkForce}
				onCommit={onGraphLinkForce}
			/>
			<SliderSetting
				label="Drag link force"
				value={graphDragLinkForce}
				min={0}
				max={5}
				step={0.05}
				format={(value) => formatCompact(value, 2)}
				onChange={onGraphDragLinkForce}
				onCommit={onGraphDragLinkForce}
			/>
			<SliderSetting
				label="Return force"
				value={graphReturnForce}
				min={0}
				max={5}
				step={0.05}
				format={(value) => formatCompact(value, 2)}
				onChange={onGraphReturnForce}
				onCommit={onGraphReturnForce}
			/>
		</SettingsSection>
	{/if}
	{#if settingsVisibility.flowLayout}
		<SettingsSection title="Layout" bind:open={layoutOpen}>
			<SliderSetting
				label="Layer spacing"
				value={flowLayerSpacing}
				min={0.25}
				max={4}
				step={0.25}
				format={(value) => formatCompact(value, 2)}
				onChange={onFlowLayerSpacing}
				onCommit={onFlowLayerSpacing}
			/>
			<SliderSetting
				label="Lane spacing"
				value={flowLaneSpacing}
				min={0.25}
				max={4}
				step={0.25}
				format={(value) => formatCompact(value, 2)}
				onChange={onFlowLaneSpacing}
				onCommit={onFlowLaneSpacing}
			/>
		</SettingsSection>
	{:else if settingsVisibility.arcLayout}
		<SettingsSection title="Layout" bind:open={layoutOpen}>
			<SliderSetting
				label="Spacing"
				value={arcSpacing}
				min={0.25}
				max={4}
				step={0.25}
				format={(value) => formatCompact(value, 2)}
				onChange={commitSpacing}
				onCommit={commitSpacing}
			/>
		</SettingsSection>
	{/if}
	{#if settingsVisibility.sort}
		<SettingsSection title="Sort" bind:open={sortOpen}>
			<DropdownSetting
				label="Sort by"
				value={nodeSort}
				options={NODE_SORT_OPTIONS}
				onChange={(value) => onLayoutNodeSort(value as LayoutNodeSort)}
			/>
			<DropdownSetting
				label="Order"
				value={nodeSortDirection}
				options={SORT_DIRECTION_OPTIONS}
				onChange={(value) =>
					onLayoutSortDirection(value as LayoutSortDirection)}
			/>
		</SettingsSection>
	{/if}
	{#if settingsVisibility.sigmaDisplay || settingsVisibility.cubeDisplay || settingsVisibility.forceLabels}
		<SettingsSection title="Display" bind:open={displayOpen}>
			{#if settingsVisibility.sigmaDisplay}
				<SliderSetting
					label="Fade distance"
					value={fadeDistance}
					min={0.25}
					max={4}
					step={0.05}
					format={(value) => formatCompact(value, 2)}
					onChange={onFadeDistance}
					onCommit={onFadeDistance}
				/>
				<SliderSetting
					label="Label density"
					value={labelDensity}
					min={0}
					max={1}
					step={0.05}
					format={(value) => `${Math.round(value * 100)}%`}
					onChange={onLabelDensity}
					onCommit={onLabelDensity}
				/>
			{/if}
			{#if settingsVisibility.cubeDisplay}
				<SegmentedSetting
					label="Camera mode"
					value={cubeFreeCamera ? 'free' : 'locked'}
					options={CAMERA_MODE_OPTIONS}
					onChange={(value) => onCubeFreeCamera(value === 'free')}
				/>
				<SliderSetting
					label="Cube size"
					value={cubeSize}
					min={120}
					max={320}
					step={10}
					format={(value) => `${Math.round(value)}`}
					onChange={onCubeSize}
					onCommit={onCubeSize}
				/>
				<SliderSetting
					label="Face opacity"
					value={cubeFaceOpacity}
					min={0.05}
					max={1}
					step={0.05}
					format={(value) => `${Math.round(value * 100)}%`}
					onChange={onCubeFaceOpacity}
					onCommit={onCubeFaceOpacity}
				/>
			{/if}
			{#if settingsVisibility.forceLabels}
				<ToggleSetting
					label="Always show labels"
					value={forceLabels}
					onChange={onForceLabels}
				/>
			{/if}
		</SettingsSection>
	{/if}
	{#if mode === 'flow'}
		<SettingsSection title="Flow details" bind:open={flowDetailsOpen}>
			<SegmentedSetting
				label="Direction"
				value={flowDirection}
				options={FLOW_DIRECTION_OPTIONS}
				onChange={onFlowDirection}
			/>
			<SegmentedSetting
				label="Line"
				value={flowEdgeStyle}
				options={FLOW_EDGE_STYLE_OPTIONS}
				onChange={onFlowEdgeStyle}
			/>
			{#if flowEdgeStyle === 'orthogonal' || flowEdgeStyle === 'bundled'}
				<SliderSetting
					label="Corner radius"
					value={flowCornerRadius}
					min={0}
					max={MAX_FLOW_CORNER_RADIUS}
					step={1}
					format={(value) => `${Math.round(value)}`}
					onChange={onFlowCornerRadius}
					onCommit={onFlowCornerRadius}
				/>
			{/if}
			<FlowRelationRules
				{app}
				rules={flowRelationRules}
				fields={flowRelationFieldSuggestions}
				conflictCount={flowRelationConflictCount}
				onChange={onFlowRelationRules}
			/>
		</SettingsSection>
	{:else if mode === 'arc'}
		<SettingsSection title="Arc details" bind:open={arcDetailsOpen}>
			<SegmentedSetting
				label="Direction"
				value={arcDirection}
				options={ARC_DIRECTION_OPTIONS}
				onChange={onArcDirection}
			/>
			<SegmentedSetting
				label="Label angle"
				value={arcLabelAngle}
				options={ARC_LABEL_ANGLE_OPTIONS}
				onChange={onArcLabelAngle}
			/>
		</SettingsSection>
	{/if}
</section>
