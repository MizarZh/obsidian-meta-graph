<script lang="ts">
	import type { App } from 'obsidian';
	import type { SettingsPanelMode } from '@/core/types';
	import FilterPanel from '@/ui/FilterPanel.svelte';
	import GroupPanel from '@/ui/GroupPanel.svelte';
	import type {
		WorkspaceSettingsActions,
		WorkspaceSettingsView,
	} from '@/ui/workspace/settings-ports';

	let {
		app,
		view,
		actions,
		readOnly = false,
		settingsPanel,
		settingsPopoverLeft,
		groupEditorRequest,
		styleEditorRequest,
		onClose,
	}: {
		app: App;
		view: WorkspaceSettingsView;
		actions: WorkspaceSettingsActions;
		readOnly?: boolean;
		settingsPanel: SettingsPanelMode;
		settingsPopoverLeft: number;
		groupEditorRequest?: { groupId: string };
		styleEditorRequest?: import('./current-style-target').StyleEditorRequest;
		onClose: () => void;
	} = $props();
	const stylePanel = $derived(
		settingsPanel === 'note-style' ||
			settingsPanel === 'link-style' ||
			settingsPanel === 'groups',
	);
</script>

<!-- Both the settings panel and its portalled editor sit above this backdrop. -->
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
	class:knowledge-workspace-style-settings={stylePanel}
	style:--knowledge-workspace-settings-left={`${settingsPopoverLeft}px`}
>
	{#if settingsPanel === 'groups'}
		<GroupPanel
			{groupEditorRequest}
			{app}
			grouping={view.groups.grouping}
			manualLayout={view.groups.manualLayout}
			nodes={view.groups.nodes}
			folders={view.groups.folders}
			mode={view.groups.mode}
			{readOnly}
			forceLayoutEnabled={view.groups.forceLayoutEnabled}
			onAddGroup={actions.groups.add}
			onUpdateGroup={actions.groups.update}
			onDeleteGroup={actions.groups.delete}
			onReorderGroup={actions.groups.reorder}
		/>
	{:else}
		<FilterPanel
			{app}
			panel={settingsPanel}
			{view}
			{actions}
			{styleEditorRequest}
		/>
	{/if}
</div>
