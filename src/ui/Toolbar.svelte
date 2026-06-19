<script lang="ts">
	import type {
		FlowDirection,
		FlowEdgeStyle,
		SavedWorkspace,
		ViewMode,
	} from '../core/types';

	let {
		mode,
		flowEdgeStyle,
		flowDirection,
		savedWorkspaces,
		activeWorkspaceId,
		hasUnsavedChanges,
		onMode,
		onFlowEdgeStyle,
		onFlowDirection,
		onFit,
		onRefresh,
		onSelectWorkspace,
		onSaveWorkspace,
		onSaveWorkspaceAs,
		onDeleteWorkspace,
	}: {
		mode: ViewMode;
		flowEdgeStyle: FlowEdgeStyle;
		flowDirection: FlowDirection;
		savedWorkspaces: SavedWorkspace[];
		activeWorkspaceId?: string;
		hasUnsavedChanges: boolean;
		onMode: (mode: ViewMode) => void;
		onFlowEdgeStyle: (style: FlowEdgeStyle) => void;
		onFlowDirection: (direction: FlowDirection) => void;
		onFit: () => void;
		onRefresh: () => void;
		onSelectWorkspace: (id: string) => void;
		onSaveWorkspace: () => void;
		onSaveWorkspaceAs: () => void;
		onDeleteWorkspace: () => void;
	} = $props();

</script>

<div class="knowledge-workspace-toolbar">
	<div class="knowledge-workspace-workspace-picker">
		<select
			aria-label="Saved workspace"
			value={activeWorkspaceId ?? ''}
			onchange={(event) => onSelectWorkspace(event.currentTarget.value)}
		>
			<option value="">Last session (autosaved)</option>
			{#each savedWorkspaces as workspace (workspace.id)}
				<option
					value={workspace.id}
					selected={workspace.id === activeWorkspaceId}
				>
					{workspace.name}
				</option>
			{/each}
		</select>
		{#if hasUnsavedChanges}
			<span class="knowledge-workspace-unsaved">Unsaved changes</span>
		{/if}
		<button
			onclick={() =>
				activeWorkspaceId ? onSaveWorkspace() : onSaveWorkspaceAs()}>Save</button
		>
		<button onclick={onSaveWorkspaceAs}>Save as</button>
		<button disabled={!activeWorkspaceId} onclick={onDeleteWorkspace}>Delete</button>
	</div>
	<div class="knowledge-workspace-segmented" aria-label="Layout mode">
		<button class:active={mode === 'graph'} onclick={() => onMode('graph')}>Graph</button>
		<button class:active={mode === 'flow'} onclick={() => onMode('flow')}>Flow</button>
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
</div>
