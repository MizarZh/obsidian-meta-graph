<script lang="ts">
	import type { App } from 'obsidian';
	import type {
		NodeFilterField,
		NodeFilterGroup,
		NodeFilterGroupMode,
		NodeFilterItem,
		NodeFilterOperator,
	} from '../core/types';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from './obsidian/ObsidianDropdown.svelte';
	import ObsidianSuggestInput, {
		type SuggestionOption,
	} from './obsidian/ObsidianSuggestInput.svelte';
	import ObsidianTextInput from './obsidian/ObsidianTextInput.svelte';
	import FilterGroupSelf from './FilterGroup.svelte';
	import PropertyPicker, {
		type PropertyPickerOption,
	} from './PropertyPicker.svelte';

	let {
		app,
		group,
		root = false,
		fieldOptions,
		getOperatorOptions,
		getDefaultOperator,
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
		groupModeOptions: Array<{ value: NodeFilterGroupMode; label: string }>;
		getValueOptions: (field: NodeFilterField) => SuggestionOption[];
		onAddCondition: (groupId: string) => void;
		onAddGroup: (groupId: string) => void;
		onUpdate: (id: string, patch: Partial<NodeFilterItem>) => void;
		onRemove: (id: string) => void;
	} = $props();

	function shouldShowFilterValue(
		operator: NodeFilterOperator | undefined,
	): boolean {
		return !['has-value', 'empty', 'is-empty', 'is-not-empty'].includes(
			operator ?? '',
		);
	}

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
						{groupModeOptions}
					{getValueOptions}
					{onAddCondition}
					{onAddGroup}
					{onUpdate}
					{onRemove}
				/>
			{:else}
				<div class="knowledge-workspace-filter-condition">
					<div class="knowledge-workspace-rule-row filter bases">
						<PropertyPicker
							value={child.field}
							options={fieldOptions}
							onSelect={(value) =>
								onUpdate(child.id, {
									field: value as NodeFilterField,
									operator: getDefaultOperator(value as NodeFilterField),
									value: '',
								})}
						/>
						<ObsidianDropdown
							value={child.operator ?? getDefaultOperator(child.field)}
							options={getOperatorOptions(child.field)}
							onChange={(value) =>
								onUpdate(child.id, {
									operator: value as NodeFilterOperator,
								})}
						/>
						{#if shouldShowFilterValue(child.operator) && getValueOptions(child.field).length > 0}
							<ObsidianSuggestInput
								{app}
								type="text"
								placeholder="Value"
								value={child.value}
								options={getValueOptions(child.field)}
								onInput={(value) =>
									onUpdate(child.id, {
										value,
									})}
								onSelect={(option) =>
									onUpdate(child.id, {
										value: option.value,
									})}
							/>
						{:else}
							<ObsidianTextInput
								type="text"
								placeholder={shouldShowFilterValue(child.operator) ? 'Value' : ''}
								disabled={!shouldShowFilterValue(child.operator)}
								value={child.value}
								onInput={(value) =>
									onUpdate(child.id, {
										value,
									})}
							/>
						{/if}
						<ObsidianButton
							class="knowledge-workspace-remove-rule-button"
							ariaLabel="Remove filter"
							icon="trash-2"
							onClick={() => onRemove(child.id)}
						/>
					</div>
				</div>
			{/if}
		{/each}
	</div>
</div>
