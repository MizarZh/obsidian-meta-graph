<script lang="ts">
	let {
		fields,
		activeField,
		dragging,
		dragTarget,
		undoCount,
		onSelectField,
		onAddField,
		onUndo,
	}: {
		fields: string[];
		activeField: string;
		dragging: boolean;
		dragTarget?: string;
		undoCount: number;
		onSelectField: (field: string) => void;
		onAddField: (field: string) => void;
		onUndo: () => void;
	} = $props();
	let fieldInput = $state('');

	function addField(): void {
		const normalized = fieldInput.trim();
		if (!normalized) {
			return;
		}
		onAddField(normalized);
		fieldInput = '';
	}
</script>

<section class="knowledge-workspace-connection-panel">
	<div class="knowledge-workspace-connection-field">
		<span>Connect</span>
		<select
			aria-label="Connection metadata"
			value={activeField}
			onchange={(event) => onSelectField(event.currentTarget.value)}
		>
			{#each fields as field}
				<option value={field}>{field}</option>
			{/each}
		</select>
	</div>
	<form
		class="knowledge-workspace-connection-add"
		onsubmit={(event) => {
			event.preventDefault();
			addField();
		}}
	>
		<input
			type="text"
			placeholder="metadata name"
			bind:value={fieldInput}
		/>
		<button type="submit">Add</button>
	</form>
	<span
		class:active={dragging}
		class:target={Boolean(dragTarget)}
		class="knowledge-workspace-connection-status"
	>
		{dragTarget ? 'Release to connect' : dragging ? 'Choose target' : 'Ctrl drag'}
	</span>
	<button
		class="knowledge-workspace-connection-undo"
		disabled={undoCount === 0}
		aria-label="Undo last connection"
		onclick={onUndo}
	>
		Undo{undoCount > 0 ? ` (${undoCount})` : ''}
	</button>
</section>
