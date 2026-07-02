<script lang="ts">
	import type { App } from 'obsidian';
	import { onDestroy } from 'svelte';
	import FilterRulesPanel from './filter-panel/FilterRulesPanel.svelte';
	import GraphSettingsPanel from './filter-panel/GraphSettingsPanel.svelte';
	import LinkStylePanel from './filter-panel/LinkStylePanel.svelte';
	import NodeStylePanel from './filter-panel/NodeStylePanel.svelte';
	import TextStylePanel from './filter-panel/TextStylePanel.svelte';
	import {
		ColorCommitScheduler,
		getDefaultLabelColor as resolveDefaultLabelColor,
	} from './filter/color-commit';
	import type {
		ArcDirection,
		ChartGroup,
		DefaultLinkStyle,
		DefaultNodeStyle,
		FlowDirection,
		FlowEdgeStyle,
		GraphQuery,
		LabelPosition,
		LayoutNodeSort,
		LayoutSortDirection,
		LinkStyleRule,
		NodeStyleRule,
		SettingsPanelMode,
		ViewMode,
	} from '../core/types';

	let {
		app,
		panel,
		mode,
		fadeDistance,
		labelSize,
		labelPosition,
		labelOffset,
		labelColor,
		labelLightTextColor,
		labelLightBackgroundColor,
		labelLightBackgroundOpacity,
		labelDarkTextColor,
		labelDarkBackgroundColor,
		labelDarkBackgroundOpacity,
		labelBackgroundOpacity,
		labelDensity,
		cubeFaceOpacity,
		forceLabels,
		enableForceLayout,
		flowEdgeStyle,
		flowDirection,
		arcDirection,
		nodeSort,
		nodeSortDirection,
		graphSpacing,
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
		globalQuery,
		folders,
		tags,
		metadataFieldSuggestions,
		metadataFieldTypes,
		metadataFieldValueSuggestions,
		filePathSuggestions,
		groups,
		defaultNodeStyle,
		defaultLinkStyle,
		globalNodeStyleRules,
		nodeStyleOverrides,
		unresolvedNodeStyleOverrides,
		nodeStyleRules,
		globalLinkStyleRules,
		linkStyleOverrides,
		plainLinkStyleOverrides,
		unresolvedLinkStyleOverrides,
		linkStyleRules,
		onFlowEdgeStyle,
		onFlowDirection,
		onArcDirection,
		onLayoutNodeSort,
		onLayoutSortDirection,
		onFadeDistance,
		onLabelSize,
		onLabelPosition,
		onLabelOffset,
		onLabelColor,
		onLabelLightTextColor,
		onLabelLightBackgroundColor,
		onLabelLightBackgroundOpacity,
		onLabelDarkTextColor,
		onLabelDarkBackgroundColor,
		onLabelDarkBackgroundOpacity,
		onLabelBackgroundOpacity,
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
		onGlobalChange,
		onDefaultNodeStyle,
		onDefaultLinkStyle,
		onGlobalNodeStyleRulesChange,
		onNodeStyleOverrides,
		onUnresolvedNodeStyleOverrides,
		onNodeStyleRulesChange,
		onGlobalLinkStyleRulesChange,
		onLinkStyleOverrides,
		onPlainLinkStyleOverrides,
		onUnresolvedLinkStyleOverrides,
		onLinkStyleRulesChange,
	}: {
		app: App;
		panel: SettingsPanelMode;
		mode: ViewMode;
		fadeDistance: number;
		labelSize: number;
		labelPosition: LabelPosition;
		labelOffset: number;
		labelColor: string;
		labelLightTextColor: string;
		labelLightBackgroundColor: string;
		labelLightBackgroundOpacity: number;
		labelDarkTextColor: string;
		labelDarkBackgroundColor: string;
		labelDarkBackgroundOpacity: number;
		labelBackgroundOpacity: number;
		labelDensity: number;
		cubeFaceOpacity: number;
		forceLabels: boolean;
		enableForceLayout: boolean;
		flowEdgeStyle: FlowEdgeStyle;
		flowDirection: FlowDirection;
		arcDirection: ArcDirection;
		nodeSort: LayoutNodeSort;
		nodeSortDirection: LayoutSortDirection;
		graphSpacing: number;
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
		globalQuery: GraphQuery;
		folders: string[];
		tags: string[];
		metadataFieldSuggestions: string[];
		metadataFieldTypes: Record<string, string>;
		metadataFieldValueSuggestions: Record<string, string[]>;
		filePathSuggestions: string[];
		groups: ChartGroup[];
		defaultNodeStyle: Required<DefaultNodeStyle>;
		defaultLinkStyle: Required<DefaultLinkStyle>;
		globalNodeStyleRules: NodeStyleRule[];
		nodeStyleOverrides: DefaultNodeStyle;
		unresolvedNodeStyleOverrides: DefaultNodeStyle;
		nodeStyleRules: NodeStyleRule[];
		globalLinkStyleRules: LinkStyleRule[];
		linkStyleOverrides: DefaultLinkStyle;
		plainLinkStyleOverrides: DefaultLinkStyle;
		unresolvedLinkStyleOverrides: DefaultLinkStyle;
		linkStyleRules: LinkStyleRule[];
		onFlowEdgeStyle: (style: FlowEdgeStyle) => void;
		onFlowDirection: (direction: FlowDirection) => void;
		onArcDirection: (direction: ArcDirection) => void;
		onLayoutNodeSort: (sort: LayoutNodeSort) => void;
		onLayoutSortDirection: (direction: LayoutSortDirection) => void;
		onFadeDistance: (value: number) => void;
		onLabelSize: (value: number) => void;
		onLabelPosition: (position: LabelPosition) => void;
		onLabelOffset: (value: number) => void;
		onLabelColor: (color: string) => void;
		onLabelLightTextColor: (color: string) => void;
		onLabelLightBackgroundColor: (color: string) => void;
		onLabelLightBackgroundOpacity: (value: number) => void;
		onLabelDarkTextColor: (color: string) => void;
		onLabelDarkBackgroundColor: (color: string) => void;
		onLabelDarkBackgroundOpacity: (value: number) => void;
		onLabelBackgroundOpacity: (value: number) => void;
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
		onGlobalChange: (patch: Partial<Omit<GraphQuery, 'roots'>>) => void;
		onDefaultNodeStyle: (style: Required<DefaultNodeStyle>) => void;
		onDefaultLinkStyle: (style: Required<DefaultLinkStyle>) => void;
		onGlobalNodeStyleRulesChange: (rules: NodeStyleRule[]) => void;
		onNodeStyleOverrides: (style: DefaultNodeStyle) => void;
		onUnresolvedNodeStyleOverrides: (style: DefaultNodeStyle) => void;
		onNodeStyleRulesChange: (rules: NodeStyleRule[]) => void;
		onGlobalLinkStyleRulesChange: (rules: LinkStyleRule[]) => void;
		onLinkStyleOverrides: (style: DefaultLinkStyle) => void;
		onPlainLinkStyleOverrides: (style: DefaultLinkStyle) => void;
		onUnresolvedLinkStyleOverrides: (style: DefaultLinkStyle) => void;
		onLinkStyleRulesChange: (rules: LinkStyleRule[]) => void;
	} = $props();

	const colorCommitScheduler = new ColorCommitScheduler(window);

	function scheduleColorCommit(
		key: string,
		currentColor: string,
		nextColor: string,
		commit: (color: string) => void,
	): void {
		colorCommitScheduler.schedule(key, currentColor, nextColor, commit);
	}

	function commitColor(
		key: string,
		currentColor: string,
		nextColor: string,
		commit: (color: string) => void,
	): void {
		colorCommitScheduler.commit(key, currentColor, nextColor, commit);
	}

	function getDefaultLabelColor(): string {
		return resolveDefaultLabelColor(document);
	}

	onDestroy(() => {
		colorCommitScheduler.clearAll();
	});
</script>

<aside class="knowledge-workspace-filters">
	{#if panel === 'graph'}
		<GraphSettingsPanel
			{mode}
			{fadeDistance}
			{labelDensity}
			{cubeFaceOpacity}
			{forceLabels}
			{enableForceLayout}
			{flowEdgeStyle}
			{flowDirection}
			{arcDirection}
			{nodeSort}
			{nodeSortDirection}
			{graphCenterForce}
			{graphRepelForce}
			{graphLinkForce}
			{graphDragLinkForce}
			{graphReturnForce}
			{graphLinkDistance}
			{flowLayerSpacing}
			{flowLaneSpacing}
			{arcSpacing}
			{query}
			{onFlowEdgeStyle}
			{onFlowDirection}
			{onArcDirection}
			{onLayoutNodeSort}
			{onLayoutSortDirection}
			{onFadeDistance}
			{onLabelDensity}
			{onCubeFaceOpacity}
			{onForceLabels}
			{onEnableForceLayout}
			{onGraphSpacing}
			{onGraphCenterForce}
			{onGraphRepelForce}
			{onGraphLinkForce}
			{onGraphDragLinkForce}
			{onGraphReturnForce}
			{onGraphLinkDistance}
			{onFlowLayerSpacing}
			{onFlowLaneSpacing}
			{onArcSpacing}
			{onChange}
		/>
	{:else if panel === 'text-style'}
		<TextStylePanel
			{mode}
			{labelSize}
			{labelPosition}
			{labelOffset}
			{labelColor}
			{labelLightTextColor}
			{labelLightBackgroundColor}
			{labelLightBackgroundOpacity}
			{labelDarkTextColor}
			{labelDarkBackgroundColor}
			{labelDarkBackgroundOpacity}
			{labelBackgroundOpacity}
			{onLabelSize}
			{onLabelPosition}
			{onLabelOffset}
			{onLabelColor}
			{onLabelLightTextColor}
			{onLabelLightBackgroundColor}
			{onLabelLightBackgroundOpacity}
			{onLabelDarkTextColor}
			{onLabelDarkBackgroundColor}
			{onLabelDarkBackgroundOpacity}
			{onLabelBackgroundOpacity}
			{scheduleColorCommit}
			{commitColor}
			{getDefaultLabelColor}
		/>
	{:else if panel === 'filters'}
		<FilterRulesPanel
			{app}
			{query}
			{globalQuery}
			{folders}
			{tags}
			{metadataFieldSuggestions}
			{metadataFieldTypes}
			{metadataFieldValueSuggestions}
			{filePathSuggestions}
			{onChange}
			{onGlobalChange}
		/>
	{:else if panel === 'note-style'}
		<NodeStylePanel
			{app}
			{folders}
			{tags}
			{metadataFieldSuggestions}
			{metadataFieldTypes}
			{metadataFieldValueSuggestions}
			{filePathSuggestions}
			{groups}
			{defaultNodeStyle}
			{globalNodeStyleRules}
			{nodeStyleOverrides}
			{unresolvedNodeStyleOverrides}
			{nodeStyleRules}
			showUnresolvedLinks={query.showUnresolvedLinks}
			{onDefaultNodeStyle}
			{onGlobalNodeStyleRulesChange}
			{onNodeStyleOverrides}
			{onUnresolvedNodeStyleOverrides}
			{onNodeStyleRulesChange}
			{scheduleColorCommit}
			{commitColor}
		/>
	{:else}
		<LinkStylePanel
			{app}
			{metadataFieldSuggestions}
			{defaultLinkStyle}
			{globalLinkStyleRules}
			{linkStyleOverrides}
			{plainLinkStyleOverrides}
			{unresolvedLinkStyleOverrides}
			{linkStyleRules}
			showPlainLinks={query.showPlainLinks}
			showUnresolvedLinks={query.showUnresolvedLinks}
			{onDefaultLinkStyle}
			{onGlobalLinkStyleRulesChange}
			{onLinkStyleOverrides}
			{onPlainLinkStyleOverrides}
			{onUnresolvedLinkStyleOverrides}
			{onLinkStyleRulesChange}
			{scheduleColorCommit}
			{commitColor}
		/>
	{/if}
</aside>
