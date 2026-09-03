<script lang="ts">
	import type { App } from 'obsidian';
	import type { SettingsPanelMode } from '../../core/types';
	import FilterPanel from '../FilterPanel.svelte';
	import GroupPanel from '../GroupPanel.svelte';
	import type {
		WorkspaceSettingsActions,
		WorkspaceSettingsView,
	} from './settings-ports';

	let {
		app,
		view,
		actions,
		readOnly = false,
		settingsPanel,
		settingsPopoverLeft,
		onClose,
	}: {
		app: App;
		view: WorkspaceSettingsView;
		actions: WorkspaceSettingsActions;
		readOnly?: boolean;
		settingsPanel: SettingsPanelMode;
		settingsPopoverLeft: number;
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
	{#if settingsPanel === 'groups'}
		<GroupPanel
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
		<FilterPanel {app} panel={settingsPanel} {view} {actions} />
	{/if}
</div>
