<script lang="ts">
	import type { App } from 'obsidian';
	import type { SettingsPanelMode } from '../core/types';
	import type {
		WorkspaceSettingsActions,
		WorkspaceSettingsView,
	} from './workspace/settings-ports';
	import FilterRulesPanel from './filter-panel/FilterRulesPanel.svelte';
	import GraphSettingsPanel from './filter-panel/GraphSettingsPanel.svelte';
	import LinkStylePanel from './filter-panel/LinkStylePanel.svelte';
	import NodeStylePanel from './filter-panel/NodeStylePanel.svelte';
	import StyleTransferControls from './filter-panel/StyleTransferControls.svelte';
	import TextStylePanel from './filter-panel/TextStylePanel.svelte';

	let {
		app,
		panel,
		view,
		actions,
	}: {
		app: App;
		panel: SettingsPanelMode;
		view: WorkspaceSettingsView;
		actions: WorkspaceSettingsActions;
	} = $props();
</script>

<aside class="knowledge-workspace-filters">
	{#if panel === 'note-style' || panel === 'link-style'}
		<StyleTransferControls
			style={view.styles.chart}
			onPaste={actions.styles.setChart}
		/>
	{/if}
	{#if panel === 'graph'}
		<GraphSettingsPanel
			{app}
			mode={view.graph.mode}
			fadeDistance={view.graph.fadeDistance}
			labelDensity={view.graph.labelDensity}
			cubeFaceOpacity={view.graph.cubeFaceOpacity}
			cubeSize={view.graph.cubeSize}
			cubeFreeCamera={view.graph.cubeFreeCamera}
			enableForceLayout={view.graph.enableForceLayout}
			flowEdgeStyle={view.graph.flowEdgeStyle}
			flowDirection={view.graph.flowDirection}
			flowCornerRadius={view.graph.flowCornerRadius}
			flowRelationRules={view.graph.flowRelationRules}
			flowRelationConflictCount={view.graph.flowRelationConflictCount}
			flowRelationFieldSuggestions={view.suggestions.flowRelationFields}
			arcDirection={view.graph.arcDirection}
			nodeSort={view.graph.nodeSort}
			nodeSortDirection={view.graph.nodeSortDirection}
			graphCenterForce={view.graph.graphCenterForce}
			graphRepelForce={view.graph.graphRepelForce}
			graphLinkForce={view.graph.graphLinkForce}
			graphDragLinkForce={view.graph.graphDragLinkForce}
			graphReturnForce={view.graph.graphReturnForce}
			graphLinkDistance={view.graph.graphLinkDistance}
			flowLayerSpacing={view.graph.flowLayerSpacing}
			flowLaneSpacing={view.graph.flowLaneSpacing}
			arcSpacing={view.graph.arcSpacing}
			query={view.graph.query}
			onFlowEdgeStyle={actions.graph.setFlowEdgeStyle}
			onFlowDirection={actions.graph.setFlowDirection}
			onFlowCornerRadius={actions.graph.setFlowCornerRadius}
			onFlowRelationRules={actions.graph.setFlowRelationRules}
			onArcDirection={actions.graph.setArcDirection}
			onLayoutNodeSort={actions.graph.setLayoutNodeSort}
			onLayoutSortDirection={actions.graph.setLayoutSortDirection}
			onFadeDistance={actions.graph.setFadeDistance}
			onLabelDensity={actions.graph.setLabelDensity}
			onCubeFaceOpacity={actions.graph.setCubeFaceOpacity}
			onCubeSize={actions.graph.setCubeSize}
			onCubeFreeCamera={actions.graph.setCubeFreeCamera}
			onEnableForceLayout={actions.graph.setEnableForceLayout}
			onGraphCenterForce={actions.graph.setGraphCenterForce}
			onGraphRepelForce={actions.graph.setGraphRepelForce}
			onGraphLinkForce={actions.graph.setGraphLinkForce}
			onGraphDragLinkForce={actions.graph.setGraphDragLinkForce}
			onGraphReturnForce={actions.graph.setGraphReturnForce}
			onGraphLinkDistance={actions.graph.setGraphLinkDistance}
			onFlowLayerSpacing={actions.graph.setFlowLayerSpacing}
			onFlowLaneSpacing={actions.graph.setFlowLaneSpacing}
			onArcSpacing={actions.graph.setArcSpacing}
			onChange={actions.graph.updateQuery}
		/>
	{:else if panel === 'text-style'}
		<TextStylePanel
			mode={view.labels.mode}
			labelSize={view.labels.labelSize}
			scaleLabelsWithZoom={view.labels.scaleLabelsWithZoom}
			forceLabels={view.labels.forceLabels}
			arcLabelAngle={view.labels.arcLabelAngle}
			threeLabelResolution={view.labels.threeLabelResolution}
			labelBold={view.labels.labelBold}
			labelItalic={view.labels.labelItalic}
			labelPosition={view.labels.labelPosition}
			labelOffset={view.labels.labelOffset}
			labelLightTextColor={view.labels.labelLightTextColor}
			labelLightBackgroundColor={view.labels.labelLightBackgroundColor}
			labelLightBackgroundOpacity={view.labels
				.labelLightBackgroundOpacity}
			labelDarkTextColor={view.labels.labelDarkTextColor}
			labelDarkBackgroundColor={view.labels.labelDarkBackgroundColor}
			labelDarkBackgroundOpacity={view.labels.labelDarkBackgroundOpacity}
			onLabelSize={actions.labels.setLabelSize}
			onScaleLabelsWithZoom={actions.labels.setScaleLabelsWithZoom}
			onForceLabels={actions.labels.setForceLabels}
			onArcLabelAngle={actions.labels.setArcLabelAngle}
			onThreeLabelResolution={actions.labels.setThreeLabelResolution}
			onLabelBold={actions.labels.setLabelBold}
			onLabelItalic={actions.labels.setLabelItalic}
			onLabelPosition={actions.labels.setLabelPosition}
			onLabelOffset={actions.labels.setLabelOffset}
			onLabelLightTextColor={actions.labels.setLabelLightTextColor}
			onLabelLightBackgroundColor={actions.labels
				.setLabelLightBackgroundColor}
			onLabelLightBackgroundOpacity={actions.labels
				.setLabelLightBackgroundOpacity}
			onLabelDarkTextColor={actions.labels.setLabelDarkTextColor}
			onLabelDarkBackgroundColor={actions.labels
				.setLabelDarkBackgroundColor}
			onLabelDarkBackgroundOpacity={actions.labels
				.setLabelDarkBackgroundOpacity}
		/>
	{:else if panel === 'filters'}
		<FilterRulesPanel
			{app}
			query={view.query.currentQuery}
			globalQuery={view.query.globalQuery}
			folders={view.suggestions.folders}
			tags={view.suggestions.tags}
			metadataFieldSuggestions={view.suggestions.metadataFields}
			metadataFieldTypes={view.suggestions.metadataFieldTypes}
			metadataFieldValueSuggestions={view.suggestions.metadataFieldValues}
			filePathSuggestions={view.suggestions.filePaths}
			onChange={actions.query.updateCurrent}
			onGlobalChange={actions.query.updateGlobal}
		/>
	{:else if panel === 'note-style'}
		<NodeStylePanel
			{app}
			folders={view.suggestions.folders}
			tags={view.suggestions.tags}
			metadataFieldSuggestions={view.suggestions.metadataFields}
			metadataFieldTypes={view.suggestions.metadataFieldTypes}
			metadataFieldValueSuggestions={view.suggestions.metadataFieldValues}
			filePathSuggestions={view.suggestions.filePaths}
			groups={view.suggestions.groups}
			defaultNodeStyle={view.styles.defaultNode}
			globalNodeStyleRules={view.styles.globalNodeRules}
			nodeStyleOverrides={view.styles.nodeOverrides}
			unresolvedNodeStyleOverrides={view.styles.unresolvedNodeOverrides}
			nodeStyleRules={view.styles.nodeRules}
			showUnresolvedLinks={view.query.currentQuery.showUnresolvedLinks}
			onDefaultNodeStyle={actions.styles.setDefaultNode}
			onGlobalNodeStyleRulesChange={actions.styles.setGlobalNodeRules}
			onNodeStyleOverrides={actions.styles.setNodeOverrides}
			onUnresolvedNodeStyleOverrides={actions.styles
				.setUnresolvedNodeOverrides}
			onNodeStyleRulesChange={actions.styles.setNodeRules}
			onMoveNodeStyleRule={actions.styles.moveNodeRule}
		/>
	{:else}
		<LinkStylePanel
			{app}
			metadataFieldSuggestions={view.suggestions.metadataFields}
			defaultLinkStyle={view.styles.defaultLink}
			globalLinkStyleRules={view.styles.globalLinkRules}
			linkStyleOverrides={view.styles.linkOverrides}
			plainLinkStyleOverrides={view.styles.plainLinkOverrides}
			unresolvedLinkStyleOverrides={view.styles.unresolvedLinkOverrides}
			linkStyleRules={view.styles.linkRules}
			showPlainLinks={view.query.currentQuery.showPlainLinks}
			showUnresolvedLinks={view.query.currentQuery.showUnresolvedLinks}
			onDefaultLinkStyle={actions.styles.setDefaultLink}
			onGlobalLinkStyleRulesChange={actions.styles.setGlobalLinkRules}
			onLinkStyleOverrides={actions.styles.setLinkOverrides}
			onPlainLinkStyleOverrides={actions.styles.setPlainLinkOverrides}
			onUnresolvedLinkStyleOverrides={actions.styles
				.setUnresolvedLinkOverrides}
			onLinkStyleRulesChange={actions.styles.setLinkRules}
			onMoveLinkStyleRule={actions.styles.moveLinkRule}
		/>
	{/if}
</aside>
