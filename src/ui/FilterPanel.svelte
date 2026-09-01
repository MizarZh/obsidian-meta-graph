<script lang="ts">
	import type { App } from 'obsidian';
	import FilterRulesPanel from './filter-panel/FilterRulesPanel.svelte';
	import GraphSettingsPanel from './filter-panel/GraphSettingsPanel.svelte';
	import LinkStylePanel from './filter-panel/LinkStylePanel.svelte';
	import NodeStylePanel from './filter-panel/NodeStylePanel.svelte';
	import StyleTransferControls from './filter-panel/StyleTransferControls.svelte';
	import TextStylePanel from './filter-panel/TextStylePanel.svelte';
	import { getDefaultLabelColor as resolveDefaultLabelColor } from './filter/color-commit';
	import type {
		ArcDirection,
		ArcLabelAngle,
		ChartGroupDefinition,
		ChartStyleConfig,
		DefaultLinkStyle,
		DefaultNodeStyle,
		FlowDirection,
		FlowEdgeStyle,
		FlowRelationRule,
		GraphQuery,
		LabelPosition,
		LayoutNodeSort,
		LayoutSortDirection,
		LinkStyleRule,
		NodeStyleRule,
		SettingsPanelMode,
		ThreeLabelResolution,
		ViewMode,
	} from '../core/types';

	let {
		app,
		panel,
		mode,
		fadeDistance,
		labelSize,
		threeLabelResolution,
		labelBold,
		labelItalic,
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
		onFlowCornerRadius,
		onFlowRelationRules,
		onArcDirection,
		onArcLabelAngle,
		onLayoutNodeSort,
		onLayoutSortDirection,
		onFadeDistance,
		onLabelSize,
		onThreeLabelResolution,
		onLabelBold,
		onLabelItalic,
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
		onMoveNodeStyleRule,
		onMoveLinkStyleRule,
		onChartStyle,
	}: {
		app: App;
		panel: SettingsPanelMode;
		mode: ViewMode;
		fadeDistance: number;
		labelSize: number;
		threeLabelResolution: ThreeLabelResolution;
		labelBold: boolean;
		labelItalic: boolean;
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
		groups: ChartGroupDefinition[];
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
		onFlowCornerRadius: (radius: number) => void;
		onFlowRelationRules: (rules: FlowRelationRule[]) => void;
		onArcDirection: (direction: ArcDirection) => void;
		onArcLabelAngle: (angle: ArcLabelAngle) => void;
		onLayoutNodeSort: (sort: LayoutNodeSort) => void;
		onLayoutSortDirection: (direction: LayoutSortDirection) => void;
		onFadeDistance: (value: number) => void;
		onLabelSize: (value: number) => void;
		onThreeLabelResolution: (value: ThreeLabelResolution) => void;
		onLabelBold: (value: boolean) => void;
		onLabelItalic: (value: boolean) => void;
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
		onMoveNodeStyleRule: (
			id: string,
			targetScope: 'global' | 'current',
		) => void;
		onMoveLinkStyleRule: (
			id: string,
			targetScope: 'global' | 'current',
		) => void;
		onChartStyle: (style: ChartStyleConfig) => void;
	} = $props();

	function getDefaultLabelColor(): string {
		return resolveDefaultLabelColor(document);
	}

	const chartStyle = $derived({
		nodeOverrides: nodeStyleOverrides,
		unresolvedNodeOverrides: unresolvedNodeStyleOverrides,
		linkOverrides: linkStyleOverrides,
		plainLinkOverrides: plainLinkStyleOverrides,
		unresolvedLinkOverrides: unresolvedLinkStyleOverrides,
		nodeRules: nodeStyleRules,
		linkRules: linkStyleRules,
	} satisfies ChartStyleConfig);
</script>

<aside class="knowledge-workspace-filters">
	{#if panel === 'note-style' || panel === 'link-style'}
		<StyleTransferControls style={chartStyle} onPaste={onChartStyle} />
	{/if}
	{#if panel === 'graph'}
		<GraphSettingsPanel
			{app}
			{mode}
			{fadeDistance}
			{labelDensity}
			{cubeFaceOpacity}
			{cubeSize}
			{cubeFreeCamera}
			{forceLabels}
			{enableForceLayout}
			{flowEdgeStyle}
			{flowDirection}
			{flowCornerRadius}
			{flowRelationRules}
			{flowRelationConflictCount}
			{flowRelationFieldSuggestions}
			{arcDirection}
			{arcLabelAngle}
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
			{onFlowCornerRadius}
			{onFlowRelationRules}
			{onArcDirection}
			{onArcLabelAngle}
			{onLayoutNodeSort}
			{onLayoutSortDirection}
			{onFadeDistance}
			{onLabelDensity}
			{onCubeFaceOpacity}
			{onCubeSize}
			{onCubeFreeCamera}
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
			{threeLabelResolution}
			{labelBold}
			{labelItalic}
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
			{onThreeLabelResolution}
			{onLabelBold}
			{onLabelItalic}
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
			{onMoveNodeStyleRule}
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
			{onMoveLinkStyleRule}
		/>
	{/if}
</aside>
