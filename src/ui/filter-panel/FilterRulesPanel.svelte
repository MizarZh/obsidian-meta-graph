<script lang="ts">
	import type { App } from 'obsidian';
	import FilterGroup from '../FilterGroup.svelte';
	import {
		getDefaultFilterOperator as resolveDefaultFilterOperator,
		getFilterFieldOptions as resolveFilterFieldOptions,
		getFilterFieldType as resolveFilterFieldType,
		getFilterGroupModeOptions,
		getFilterOperatorOptions as resolveFilterOperatorOptions,
		getNodeValueOptions as resolveNodeValueOptions,
	} from '../filter-config';
	import type {
		GraphQuery,
		NodeFilterField,
		NodeFilterGroup,
		NodeFilterOperator,
	} from '../../core/types';
	import {
		addFilterConditionToGroup,
		addFilterGroupToGroup,
		createRuleId,
		getScopedFilterRoot,
		patchFilterItem,
		removeFilterItemFromGroup,
		type FilterScope,
	} from '../filter/filter-tree';

	let {
		app,
		query,
		globalQuery,
		folders,
		tags,
		metadataFieldSuggestions,
		metadataFieldTypes,
		metadataFieldValueSuggestions,
		filePathSuggestions,
		onChange,
		onGlobalChange,
	}: {
		app: App;
		query: GraphQuery;
		globalQuery: GraphQuery;
		folders: string[];
		tags: string[];
		metadataFieldSuggestions: string[];
		metadataFieldTypes: Record<string, string>;
		metadataFieldValueSuggestions: Record<string, string[]>;
		filePathSuggestions: string[];
		onChange: (patch: Partial<Omit<GraphQuery, 'roots'>>) => void;
		onGlobalChange: (patch: Partial<Omit<GraphQuery, 'roots'>>) => void;
	} = $props();

	function updateFilterRoot(
		scope: FilterScope,
		filterRoot: NodeFilterGroup,
	): void {
		const patch = { filterRoot, hiddenNodeRules: [] };
		if (scope === 'global') {
			onGlobalChange(patch);
		} else {
			onChange(patch);
		}
	}

	function getFilterRoot(scope: FilterScope): NodeFilterGroup {
		return getScopedFilterRoot(scope, query, globalQuery);
	}

	function addFilterCondition(scope: FilterScope, groupId: string): void {
		updateFilterRoot(
			scope,
			addFilterConditionToGroup(getFilterRoot(scope), groupId, createRuleId()),
		);
	}

	function addFilterGroup(scope: FilterScope, groupId: string): void {
		updateFilterRoot(
			scope,
			addFilterGroupToGroup(getFilterRoot(scope), groupId, createRuleId()),
		);
	}

	function updateFilterItem(
		scope: FilterScope,
		itemId: string,
		patch: Parameters<typeof patchFilterItem>[2],
	): void {
		updateFilterRoot(
			scope,
			patchFilterItem(getFilterRoot(scope), itemId, patch) as NodeFilterGroup,
		);
	}

	function removeFilterItem(scope: FilterScope, itemId: string): void {
		const root = getFilterRoot(scope);
		if (itemId === root.id) {
			return;
		}
		updateFilterRoot(scope, removeFilterItemFromGroup(root, itemId));
	}

	function getFilterFieldOptions() {
		return resolveFilterFieldOptions(metadataFieldSuggestions, metadataFieldTypes);
	}

	function getFilterOperatorOptions(field: NodeFilterField) {
		return resolveFilterOperatorOptions(field, metadataFieldTypes);
	}

	function getDefaultFilterOperator(field: NodeFilterField): NodeFilterOperator {
		return resolveDefaultFilterOperator(field, metadataFieldTypes);
	}

	function getFilterFieldType(field: NodeFilterField): string {
		return resolveFilterFieldType(field, metadataFieldTypes);
	}

	function getNodeValueOptions(
		field: NodeFilterField,
		operator?: NodeFilterOperator,
	) {
		return resolveNodeValueOptions(field, operator, {
			folders,
			tags,
			metadataFieldSuggestions,
			metadataFieldTypes,
			metadataFieldValueSuggestions,
			filePathSuggestions,
		});
	}
</script>

{#each ['global', 'current'] as scope}
	<section class="knowledge-workspace-filter-scope">
		<header>
			<h3>
				{scope === 'global' ? 'All views' : 'This view'}
			</h3>
		</header>
		<FilterGroup
			{app}
			group={getFilterRoot(scope as 'global' | 'current')}
			root={true}
			fieldOptions={getFilterFieldOptions()}
			getOperatorOptions={getFilterOperatorOptions}
			getDefaultOperator={getDefaultFilterOperator}
			getFieldType={getFilterFieldType}
			groupModeOptions={getFilterGroupModeOptions()}
			getValueOptions={getNodeValueOptions}
			onAddCondition={(groupId) =>
				addFilterCondition(scope as 'global' | 'current', groupId)}
			onAddGroup={(groupId) =>
				addFilterGroup(scope as 'global' | 'current', groupId)}
			onUpdate={(id, patch) =>
				updateFilterItem(scope as 'global' | 'current', id, patch)}
			onRemove={(id) => removeFilterItem(scope as 'global' | 'current', id)}
		/>
	</section>
{/each}
