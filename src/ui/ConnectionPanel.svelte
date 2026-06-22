<script lang="ts">
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from './obsidian/ObsidianDropdown.svelte';
	import ObsidianTextInput from './obsidian/ObsidianTextInput.svelte';

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
	const fieldOptions = $derived(
		fields.map((field) => ({ value: field, label: field })),
	);

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
		<ObsidianDropdown
			ariaLabel="Connection metadata"
			value={activeField}
			options={fieldOptions}
			onChange={onSelectField}
		/>
	</div>
	<form
		class="knowledge-workspace-connection-add"
		onsubmit={(event) => {
			event.preventDefault();
			addField();
		}}
	>
		<ObsidianTextInput
			type="text"
			placeholder="metadata name"
			value={fieldInput}
			onInput={(value) => {
				fieldInput = value;
			}}
		/>
		<ObsidianButton
			icon="plus"
			ariaLabel="Add metadata field"
			onClick={addField}
		/>
	</form>
	<span
		class:active={dragging}
		class:target={Boolean(dragTarget)}
		class="knowledge-workspace-connection-status"
	>
		{dragTarget ? 'Release to connect' : dragging ? 'Choose target' : 'Ctrl drag'}
	</span>
	<ObsidianButton
		class="knowledge-workspace-connection-undo"
		disabled={undoCount === 0}
		ariaLabel="Undo last connection"
		text={`Undo${undoCount > 0 ? ` (${undoCount})` : ''}`}
		onClick={onUndo}
	/>
</section>
