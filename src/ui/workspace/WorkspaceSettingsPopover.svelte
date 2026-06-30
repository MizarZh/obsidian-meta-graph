<script lang="ts">
	import type { App } from "obsidian";
	import type { SettingsPanelMode, WorkspaceState } from "../../core/types";
	import type { WorkspaceController } from "../../workspace/workspace-controller";
	import FilterPanel from "../FilterPanel.svelte";
	import GroupPanel from "../GroupPanel.svelte";

	let {
		app,
		controller,
		workspaceState,
		settingsPanel,
		settingsPopoverLeft,
		metadataFieldSuggestions,
		metadataFieldTypes,
		metadataFieldValueSuggestions,
		filePathSuggestions,
		onClose,
	}: {
		app: App;
		controller: WorkspaceController;
		workspaceState: WorkspaceState;
		settingsPanel: SettingsPanelMode;
		settingsPopoverLeft: number;
		metadataFieldSuggestions: string[];
		metadataFieldTypes: Record<string, string>;
		metadataFieldValueSuggestions: Record<string, string[]>;
		filePathSuggestions: string[];
		onClose: () => void;
	} = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="knowledge-workspace-settings-backdrop"
	onpointerdown={onClose}
	oncontextmenu={(event) => {
		event.preventDefault();
		onClose();
	}}
></div>
<div
	class="knowledge-workspace-settings-popover"
	style:--knowledge-workspace-settings-left={`${settingsPopoverLeft}px`}
>
	{#if settingsPanel === "groups"}
		<GroupPanel
			manualLayout={workspaceState.manualLayout}
			locked={workspaceState.mode === "cube"}
			onAddGroup={() => controller.addGroup()}
			onUpdateGroup={(groupId, patch) => controller.updateGroup(groupId, patch)}
			onDeleteGroup={(groupId) => controller.deleteGroup(groupId)}
		/>
	{:else}
		<FilterPanel
			{app}
			panel={settingsPanel}
			mode={workspaceState.mode}
			fadeDistance={workspaceState.fadeDistance}
			labelSize={workspaceState.labelSize}
			labelPosition={workspaceState.labelPosition}
			labelColor={workspaceState.labelColor}
			labelBackgroundOpacity={workspaceState.labelBackgroundOpacity}
			labelDensity={workspaceState.labelDensity}
			cubeFaceOpacity={workspaceState.cubeFaceOpacity}
			forceLabels={workspaceState.forceLabels}
			enableForceLayout={workspaceState.enableForceLayout}
			flowEdgeStyle={workspaceState.flowEdgeStyle}
			flowDirection={workspaceState.flowDirection}
			arcDirection={workspaceState.arcDirection}
			graphSpacing={workspaceState.graphSpacing}
			graphCenterForce={workspaceState.graphCenterForce}
			graphRepelForce={workspaceState.graphRepelForce}
			graphLinkForce={workspaceState.graphLinkForce}
			graphDragLinkForce={workspaceState.graphDragLinkForce}
			graphReturnForce={workspaceState.graphReturnForce}
			graphLinkDistance={workspaceState.graphLinkDistance}
			flowSpacing={workspaceState.flowSpacing}
			arcSpacing={workspaceState.arcSpacing}
			query={workspaceState.query}
			globalQuery={workspaceState.globalQuery}
			folders={workspaceState.availableFolders}
			tags={workspaceState.availableTags}
			{metadataFieldSuggestions}
			{metadataFieldTypes}
			{metadataFieldValueSuggestions}
			{filePathSuggestions}
			defaultNodeStyle={workspaceState.defaultNodeStyle}
			defaultLinkStyle={workspaceState.defaultLinkStyle}
			globalNodeStyleRules={workspaceState.globalNodeStyleRules}
			nodeStyleOverrides={workspaceState.nodeStyleOverrides}
			nodeStyleRules={workspaceState.nodeStyleRules}
			globalLinkStyleRules={workspaceState.globalLinkStyleRules}
			linkStyleOverrides={workspaceState.linkStyleOverrides}
			linkStyleRules={workspaceState.linkStyleRules}
			onFlowEdgeStyle={(style) => controller.setFlowEdgeStyle(style)}
			onFlowDirection={(direction) => controller.setFlowDirection(direction)}
			onArcDirection={(direction) => controller.setArcDirection(direction)}
			onFadeDistance={(value) => controller.setFadeDistance(value)}
			onLabelSize={(value) => controller.setLabelSize(value)}
			onLabelPosition={(position) => controller.setLabelPosition(position)}
			onLabelColor={(color) => controller.setLabelColor(color)}
			onLabelBackgroundOpacity={(value) =>
				controller.setLabelBackgroundOpacity(value)}
			onLabelDensity={(value) => controller.setLabelDensity(value)}
			onCubeFaceOpacity={(value) => controller.setCubeFaceOpacity(value)}
			onForceLabels={(value) => controller.setForceLabels(value)}
			onEnableForceLayout={(value) => controller.setEnableForceLayout(value)}
			onGraphSpacing={(spacing) => controller.setGraphSpacing(spacing)}
			onGraphCenterForce={(value) => controller.setGraphCenterForce(value)}
			onGraphRepelForce={(value) => controller.setGraphRepelForce(value)}
			onGraphLinkForce={(value) => controller.setGraphLinkForce(value)}
			onGraphDragLinkForce={(value) => controller.setGraphDragLinkForce(value)}
			onGraphReturnForce={(value) => controller.setGraphReturnForce(value)}
			onGraphLinkDistance={(value) => controller.setGraphLinkDistance(value)}
			onFlowSpacing={(spacing) => controller.setFlowSpacing(spacing)}
			onArcSpacing={(spacing) => controller.setArcSpacing(spacing)}
			onChange={(patch) => controller.updateQuery(patch)}
			onGlobalChange={(patch) => controller.updateGlobalQuery(patch)}
			onDefaultNodeStyle={(style) => controller.setDefaultNodeStyle(style)}
			onDefaultLinkStyle={(style) => controller.setDefaultLinkStyle(style)}
			onGlobalNodeStyleRulesChange={(rules) =>
				controller.setGlobalNodeStyleRules(rules)}
			onNodeStyleOverrides={(style) => controller.setNodeStyleOverrides(style)}
			onNodeStyleRulesChange={(rules) => controller.setNodeStyleRules(rules)}
			onGlobalLinkStyleRulesChange={(rules) =>
				controller.setGlobalLinkStyleRules(rules)}
			onLinkStyleOverrides={(style) => controller.setLinkStyleOverrides(style)}
			onLinkStyleRulesChange={(rules) => controller.setLinkStyleRules(rules)}
		/>
	{/if}
</div>
