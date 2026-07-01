<script lang="ts">
	import type { App } from 'obsidian';
	import type {
		NodeFilterField,
		NodeFilterGroup,
		NodeFilterGroupMode,
		NodeFilterItem,
		NodeFilterOperator,
	} from '../core/types';
	import NodeConditionRow from './filter/NodeConditionRow.svelte';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from './obsidian/ObsidianDropdown.svelte';
	import type { SuggestionOption } from './obsidian/ObsidianSuggestInput.svelte';
	import FilterGroupSelf from './FilterGroup.svelte';
	import type { PropertyPickerOption } from './PropertyPicker.svelte';

	let {
		app,
		group,
		root = false,
		fieldOptions,
		getOperatorOptions,
		getDefaultOperator,
		getFieldType,
		groupModeOptions,
		getValueOptions,
		onAddCondition,
		onAddGroup,
		onUpdate,
		onRemove,
	}: {
		app: App;
		group: NodeFilterGroup;
		root?: boolean;
		fieldOptions: PropertyPickerOption[];
		getOperatorOptions: (field: NodeFilterField) => Array<{
			value: NodeFilterOperator;
			label: string;
		}>;
		getDefaultOperator: (field: NodeFilterField) => NodeFilterOperator;
		getFieldType: (field: NodeFilterField) => string;
		groupModeOptions: Array<{ value: NodeFilterGroupMode; label: string }>;
		getValueOptions: (
			field: NodeFilterField,
			operator: NodeFilterOperator | undefined,
		) => SuggestionOption[];
		onAddCondition: (groupId: string) => void;
		onAddGroup: (groupId: string) => void;
		onUpdate: (id: string, patch: Partial<NodeFilterItem>) => void;
		onRemove: (id: string) => void;
	} = $props();
</script>

<div class:root class="knowledge-workspace-filter-group">
	<div class="knowledge-workspace-filter-group-header">
		<ObsidianDropdown
			value={group.mode}
			options={groupModeOptions}
			onChange={(value) =>
				onUpdate(group.id, {
					mode: value as NodeFilterGroupMode,
				})}
		/>
		<div class="knowledge-workspace-filter-group-actions">
			<ObsidianButton
				class="knowledge-workspace-add-filter-button"
				icon="plus"
				text="Add filter"
				onClick={() => onAddCondition(group.id)}
			/>
			<ObsidianButton
				class="knowledge-workspace-add-filter-button"
				icon="folder-plus"
				text="Add group"
				onClick={() => onAddGroup(group.id)}
			/>
			{#if !root}
				<ObsidianButton
					class="knowledge-workspace-remove-rule-button"
					ariaLabel="Remove filter group"
					icon="trash-2"
					onClick={() => onRemove(group.id)}
				/>
			{/if}
		</div>
	</div>

	{#if group.children.length === 0}
		<div class="knowledge-workspace-filter-empty">No filters</div>
	{/if}

	<div class="knowledge-workspace-filter-children">
		{#each group.children as child (child.id)}
			{#if child.kind === 'group'}
				<FilterGroupSelf
					{app}
					group={child}
					{fieldOptions}
					{getOperatorOptions}
					{getDefaultOperator}
					{getFieldType}
					{groupModeOptions}
					{getValueOptions}
					{onAddCondition}
					{onAddGroup}
					{onUpdate}
					{onRemove}
				/>
			{:else}
				<div class="knowledge-workspace-filter-condition">
					<NodeConditionRow
						{app}
						class="filter bases"
						field={child.field}
						operator={child.operator}
						value={child.value}
						{fieldOptions}
						getOperatorOptions={(field) =>
							getOperatorOptions(field as NodeFilterField)}
						getDefaultOperator={(field) =>
							getDefaultOperator(field as NodeFilterField)}
						getFieldType={(field) =>
							getFieldType(field as NodeFilterField)}
						getValueOptions={(field, operator) =>
							getValueOptions(field as NodeFilterField, operator)}
						onFieldChange={(value) =>
							onUpdate(child.id, {
								field: value as NodeFilterField,
								operator: getDefaultOperator(
									value as NodeFilterField,
								),
								value: '',
							})}
						onOperatorChange={(value) =>
							onUpdate(child.id, {
								operator: value,
							})}
						onValueChange={(value) =>
							onUpdate(child.id, {
								value,
							})}
					>
						{#snippet actions()}
							<ObsidianButton
								class="knowledge-workspace-remove-rule-button"
								ariaLabel="Remove filter"
								icon="trash-2"
								onClick={() => onRemove(child.id)}
							/>
						{/snippet}
					</NodeConditionRow>
				</div>
			{/if}
		{/each}
	</div>
</div>
