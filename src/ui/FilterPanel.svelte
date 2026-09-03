<script lang="ts">
	import type { App } from 'obsidian';
	import FilterRulesPanel from './filter-panel/FilterRulesPanel.svelte';
	import GraphSettingsPanel from './filter-panel/GraphSettingsPanel.svelte';
	import LinkStylePanel from './filter-panel/LinkStylePanel.svelte';
	import NodeStylePanel from './filter-panel/NodeStylePanel.svelte';
	import StyleTransferControls from './filter-panel/StyleTransferControls.svelte';
	import TextStylePanel from './filter-panel/TextStylePanel.svelte';
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
		scaleLabelsWithZoom,
		threeLabelResolution,
		labelBold,
		labelItalic,
		labelPosition,
		labelOffset,
		labelLightTextColor,
		labelLightBackgroundColor,
		labelLightBackgroundOpacity,
		labelDarkTextColor,
		labelDarkBackgroundColor,
		labelDarkBackgroundOpacity,
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
		onScaleLabelsWithZoom,
		onThreeLabelResolution,
		onLabelBold,
		onLabelItalic,
		onLabelPosition,
		onLabelOffset,
		onLabelLightTextColor,
		onLabelLightBackgroundColor,
		onLabelLightBackgroundOpacity,
		onLabelDarkTextColor,
		onLabelDarkBackgroundColor,
		onLabelDarkBackgroundOpacity,
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
		scaleLabelsWithZoom: boolean;
		threeLabelResolution: ThreeLabelResolution;
		labelBold: boolean;
		labelItalic: boolean;
		labelPosition: LabelPosition;
		labelOffset: number;
		labelLightTextColor: string;
		labelLightBackgroundColor: string;
		labelLightBackgroundOpacity: number;
		labelDarkTextColor: string;
		labelDarkBackgroundColor: string;
		labelDarkBackgroundOpacity: number;
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
		onScaleLabelsWithZoom: (value: boolean) => void;
		onThreeLabelResolution: (value: ThreeLabelResolution) => void;
		onLabelBold: (value: boolean) => void;
		onLabelItalic: (value: boolean) => void;
		onLabelPosition: (position: LabelPosition) => void;
		onLabelOffset: (value: number) => void;
		onLabelLightTextColor: (color: string) => void;
		onLabelLightBackgroundColor: (color: string) => void;
		onLabelLightBackgroundOpacity: (value: number) => void;
		onLabelDarkTextColor: (color: string) => void;
		onLabelDarkBackgroundColor: (color: string) => void;
		onLabelDarkBackgroundOpacity: (value: number) => void;
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
			{enableForceLayout}
			{flowEdgeStyle}
			{flowDirection}
			{flowCornerRadius}
			{flowRelationRules}
			{flowRelationConflictCount}
			{flowRelationFieldSuggestions}
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
			{onFlowCornerRadius}
			{onFlowRelationRules}
			{onArcDirection}
			{onLayoutNodeSort}
			{onLayoutSortDirection}
			{onFadeDistance}
			{onLabelDensity}
			{onCubeFaceOpacity}
			{onCubeSize}
			{onCubeFreeCamera}
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
			{scaleLabelsWithZoom}
			{forceLabels}
			{arcLabelAngle}
			{threeLabelResolution}
			{labelBold}
			{labelItalic}
			{labelPosition}
			{labelOffset}
			{labelLightTextColor}
			{labelLightBackgroundColor}
			{labelLightBackgroundOpacity}
			{labelDarkTextColor}
			{labelDarkBackgroundColor}
			{labelDarkBackgroundOpacity}
			{onLabelSize}
			{onScaleLabelsWithZoom}
			{onForceLabels}
			{onArcLabelAngle}
			{onThreeLabelResolution}
			{onLabelBold}
			{onLabelItalic}
			{onLabelPosition}
			{onLabelOffset}
			{onLabelLightTextColor}
			{onLabelLightBackgroundColor}
			{onLabelLightBackgroundOpacity}
			{onLabelDarkTextColor}
			{onLabelDarkBackgroundColor}
			{onLabelDarkBackgroundOpacity}
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
