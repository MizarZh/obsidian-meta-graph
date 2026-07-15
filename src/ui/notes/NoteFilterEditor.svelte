<script lang="ts">
	import type { App } from 'obsidian';
	import type {
		KnowledgeNode,
		NodeFilterField,
		NodeFilterGroup,
		NodeFilterItem,
		NodeFilterOperator,
	} from '../../core/types';
	import {
		getDefaultFilterOperator as resolveDefaultFilterOperator,
		getFilterFieldOptions as resolveFilterFieldOptions,
		getFilterFieldType as resolveFilterFieldType,
		getFilterGroupModeOptions,
		getFilterOperatorOptions as resolveFilterOperatorOptions,
		getMetadataFieldSuggestions,
		getMetadataFieldTypes,
		getMetadataFieldValueSuggestions,
		getNodeValueOptions as resolveNodeValueOptions,
		uniqueSorted,
	} from '../filter-config';
	import FilterGroup from '../FilterGroup.svelte';
	import type { SuggestionOption } from '../obsidian/ObsidianSuggestInput.svelte';
	import {
		createRuleId,
		patchFilterItem,
		removeFilterItemFromGroup,
		updateFilterGroup,
	} from '../curated/curated-panel-state';

	let {
		app,
		nodes,
		folders,
		filterRoot,
		onChange,
	}: {
		app: App;
		nodes: KnowledgeNode[];
		folders: string[];
		filterRoot: NodeFilterGroup;
		onChange: (root: NodeFilterGroup) => void;
	} = $props();

	const tagSuggestions = $derived(
		uniqueSorted(nodes.flatMap((node) => node.tags)),
	);
	const filePathSuggestions = $derived(
		nodes
			.map((node) => node.path)
			.sort((left, right) =>
				left.localeCompare(right, undefined, { sensitivity: 'base' }),
			),
	);
	const metadataFieldSuggestions = $derived(
		getMetadataFieldSuggestions(nodes),
	);
	const metadataFieldTypes = $derived(getMetadataFieldTypes(nodes));
	const metadataFieldValueSuggestions = $derived(
		getMetadataFieldValueSuggestions(nodes, metadataFieldTypes),
	);

	function addFilterCondition(groupId: string): void {
		onChange(
			updateFilterGroup(filterRoot, groupId, (group) => ({
				...group,
				children: [
					...group.children,
					{
						id: createRuleId(),
						kind: 'condition',
						field: 'file.file',
						operator: 'links-to',
						value: '',
					},
				],
			})),
		);
	}

	function addFilterGroup(groupId: string): void {
		onChange(
			updateFilterGroup(filterRoot, groupId, (group) => ({
				...group,
				children: [
					...group.children,
					{
						id: createRuleId(),
						kind: 'group',
						mode: 'all',
						children: [],
					},
				],
			})),
		);
	}

	function updateFilterItem(
		itemId: string,
		patch: Partial<NodeFilterItem>,
	): void {
		onChange(patchFilterItem(filterRoot, itemId, patch) as NodeFilterGroup);
	}

	function removeFilterItem(itemId: string): void {
		if (itemId !== filterRoot.id) {
			onChange(removeFilterItemFromGroup(filterRoot, itemId));
		}
	}

	function getFilterOperatorOptions(field: NodeFilterField) {
		return resolveFilterOperatorOptions(field, metadataFieldTypes);
	}

	function getDefaultFilterOperator(
		field: NodeFilterField,
	): NodeFilterOperator {
		return resolveDefaultFilterOperator(field, metadataFieldTypes);
	}

	function getNodeValueOptions(
		field: NodeFilterField,
		operator?: NodeFilterOperator,
	): SuggestionOption[] {
		return resolveNodeValueOptions(field, operator, {
			folders,
			tags: tagSuggestions,
			metadataFieldSuggestions,
			metadataFieldTypes,
			metadataFieldValueSuggestions,
			filePathSuggestions,
		});
	}
</script>

<div class="knowledge-workspace-note-filter-editor">
	<FilterGroup
		{app}
		group={filterRoot}
		root={true}
		fieldOptions={resolveFilterFieldOptions(
			metadataFieldSuggestions,
			metadataFieldTypes,
		)}
		getOperatorOptions={getFilterOperatorOptions}
		getDefaultOperator={getDefaultFilterOperator}
		getFieldType={(field) =>
			resolveFilterFieldType(field, metadataFieldTypes)}
		groupModeOptions={getFilterGroupModeOptions()}
		getValueOptions={getNodeValueOptions}
		onAddCondition={addFilterCondition}
		onAddGroup={addFilterGroup}
		onUpdate={updateFilterItem}
		onRemove={removeFilterItem}
	/>
</div>
