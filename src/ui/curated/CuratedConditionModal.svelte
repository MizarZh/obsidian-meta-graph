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
		getMetadataFieldSuggestions as resolveMetadataFieldSuggestions,
		getMetadataFieldTypes as resolveMetadataFieldTypes,
		getMetadataFieldValueSuggestions as resolveMetadataFieldValueSuggestions,
		getNodeValueOptions as resolveNodeValueOptions,
		uniqueSorted,
	} from '../filter-config';
	import FilterGroup from '../FilterGroup.svelte';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '../obsidian/ObsidianDropdown.svelte';
	import ObsidianTextInput from '../obsidian/ObsidianTextInput.svelte';
	import type { DropdownOption } from '../obsidian/ObsidianDropdown.svelte';
	import type { SuggestionOption } from '../obsidian/ObsidianSuggestInput.svelte';
	import WorkspaceModal from '../WorkspaceModal.svelte';
	import {
		canApplyConditionToPath,
		createConditionFilterRoot,
		createRuleId,
		filterConditionalMatches,
		getConditionalMatches,
		patchFilterItem,
		removeFilterItemFromGroup,
		updateFilterGroup,
		type ConditionalMode,
	} from './curated-panel-state';

	let {
		app,
		open,
		nodes,
		selectedPaths,
		workspaceFilePath,
		nodeColors,
		addGroupId,
		addGroupOptions,
		selectedAddGroupId,
		folders,
		onGroupChange,
		onAddFiles,
		onRemoveFiles,
		onClose,
	}: {
		app: App;
		open: boolean;
		nodes: KnowledgeNode[];
		selectedPaths: Set<string>;
		workspaceFilePath?: string;
		nodeColors: Map<string, string>;
		addGroupId: string;
		addGroupOptions: DropdownOption[];
		selectedAddGroupId?: string;
		folders: string[];
		onGroupChange: (value: string) => void;
		onAddFiles: (paths: string[], groupId?: string) => void;
		onRemoveFiles: (paths: string[]) => void;
		onClose: () => void;
	} = $props();

	let conditionMode = $state<ConditionalMode>('add');
	let conditionFilterRoot = $state<NodeFilterGroup>(
		createConditionFilterRoot(),
	);
	let conditionResultSearch = $state('');
	let selectedMatchPaths = $state<Set<string>>(new Set());
	let wasOpen = $state(false);

	const curatedFolderSuggestions = $derived(folders);
	const curatedTagSuggestions = $derived(
		uniqueSorted(nodes.flatMap((node) => node.tags)),
	);
	const curatedFilePathSuggestions = $derived(
		nodes
			.map((node) => node.path)
			.sort((first, second) =>
				first.localeCompare(second, undefined, { sensitivity: 'base' }),
			),
	);
	const metadataFieldSuggestions = $derived(
		resolveMetadataFieldSuggestions(nodes),
	);
	const metadataFieldTypes = $derived(resolveMetadataFieldTypes(nodes));
	const metadataFieldValueSuggestions = $derived(
		resolveMetadataFieldValueSuggestions(nodes, metadataFieldTypes),
	);
	const conditionalMatches = $derived(
		getConditionalMatches(
			nodes,
			selectedPaths,
			workspaceFilePath,
			conditionMode,
			conditionFilterRoot,
		),
	);
	const conditionalStatus = $derived(
		`${conditionalMatches.length} ${conditionMode === 'add' ? 'matches' : 'selected'}`,
	);
	const visibleConditionalMatches = $derived(
		filterConditionalMatches(conditionalMatches, conditionResultSearch),
	);
	const selectedMatchCount = $derived(
		conditionalMatches.filter(
			(node) =>
				selectedMatchPaths.has(node.path) && canApplyConditionTo(node),
		).length,
	);

	$effect(() => {
		if (open && !wasOpen) {
			conditionResultSearch = '';
			resetConditionalSelection();
		}
		wasOpen = open;
	});

	function canApplyConditionTo(node: KnowledgeNode): boolean {
		return canApplyConditionToPath(node.path, conditionMode, selectedPaths);
	}

	function resetConditionalSelection(): void {
		selectedMatchPaths = new Set(
			conditionalMatches
				.filter((node) => canApplyConditionTo(node))
				.map((node) => node.path),
		);
	}

	function scheduleSelectionReset(): void {
		window.requestAnimationFrame(resetConditionalSelection);
	}

	function updateConditionMode(mode: ConditionalMode): void {
		conditionMode = mode;
		scheduleSelectionReset();
	}

	function toggleMatch(path: string): void {
		const next = new Set(selectedMatchPaths);
		if (next.has(path)) {
			next.delete(path);
		} else {
			next.add(path);
		}
		selectedMatchPaths = next;
	}

	function selectVisibleMatches(): void {
		selectedMatchPaths = new Set([
			...selectedMatchPaths,
			...visibleConditionalMatches
				.filter((node) => canApplyConditionTo(node))
				.map((node) => node.path),
		]);
	}

	function clearVisibleMatches(): void {
		const visiblePaths = new Set(
			visibleConditionalMatches.map((node) => node.path),
		);
		selectedMatchPaths = new Set(
			[...selectedMatchPaths].filter((path) => !visiblePaths.has(path)),
		);
	}

	function applyConditionalChange(): void {
		const paths = conditionalMatches
			.filter(
				(node) =>
					selectedMatchPaths.has(node.path) &&
					canApplyConditionTo(node),
			)
			.map((node) => node.path);
		if (paths.length === 0) {
			return;
		}
		if (conditionMode === 'add') {
			onAddFiles(paths, selectedAddGroupId);
		} else {
			onRemoveFiles(paths);
		}
		selectedMatchPaths = new Set();
		onClose();
	}

	function addFilterCondition(groupId: string): void {
		conditionFilterRoot = updateFilterGroup(
			conditionFilterRoot,
			groupId,
			(group) => ({
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
			}),
		);
		scheduleSelectionReset();
	}

	function addFilterGroup(groupId: string): void {
		conditionFilterRoot = updateFilterGroup(
			conditionFilterRoot,
			groupId,
			(group) => ({
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
			}),
		);
		scheduleSelectionReset();
	}

	function updateFilterItem(
		itemId: string,
		patch: Partial<NodeFilterItem>,
	): void {
		conditionFilterRoot = patchFilterItem(
			conditionFilterRoot,
			itemId,
			patch,
		) as NodeFilterGroup;
		scheduleSelectionReset();
	}

	function removeFilterItem(itemId: string): void {
		if (itemId === conditionFilterRoot.id) {
			return;
		}
		conditionFilterRoot = removeFilterItemFromGroup(
			conditionFilterRoot,
			itemId,
		);
		scheduleSelectionReset();
	}

	function getFilterFieldOptions() {
		return resolveFilterFieldOptions(
			metadataFieldSuggestions,
			metadataFieldTypes,
		);
	}

	function getFilterOperatorOptions(field: NodeFilterField) {
		return resolveFilterOperatorOptions(field, metadataFieldTypes);
	}

	function getDefaultFilterOperator(
		field: NodeFilterField,
	): NodeFilterOperator {
		return resolveDefaultFilterOperator(field, metadataFieldTypes);
	}

	function getFilterFieldType(field: NodeFilterField): string {
		return resolveFilterFieldType(field, metadataFieldTypes);
	}

	function getNodeValueOptions(
		field: NodeFilterField,
		operator?: NodeFilterOperator,
	): SuggestionOption[] {
		return resolveNodeValueOptions(field, operator, {
			folders: curatedFolderSuggestions,
			tags: curatedTagSuggestions,
			metadataFieldSuggestions,
			metadataFieldTypes,
			metadataFieldValueSuggestions,
			filePathSuggestions: curatedFilePathSuggestions,
		});
	}
</script>

<WorkspaceModal
	{open}
	title="Filter files"
	subtitle={conditionalStatus}
	{onClose}
>
	<div class="knowledge-workspace-curated-condition">
		<div class="knowledge-workspace-curated-condition-mode">
			<ObsidianButton
				class="knowledge-workspace-condition-mode-button"
				text="Add to workspace"
				icon="plus"
				active={conditionMode === 'add'}
				cta={conditionMode === 'add'}
				onClick={() => updateConditionMode('add')}
			/>
			<ObsidianButton
				class="knowledge-workspace-condition-mode-button"
				text="Remove from workspace"
				icon="trash-2"
				active={conditionMode === 'remove'}
				destructive={conditionMode === 'remove'}
				onClick={() => updateConditionMode('remove')}
			/>
		</div>
		{#if conditionMode === 'add'}
			<label class="knowledge-workspace-curated-group-target">
				<span>Group</span>
				<ObsidianDropdown
					value={addGroupId}
					options={addGroupOptions}
					ariaLabel="Group for added files"
					onChange={onGroupChange}
				/>
			</label>
		{/if}
		<FilterGroup
			{app}
			group={conditionFilterRoot}
			root={true}
			fieldOptions={getFilterFieldOptions()}
			getOperatorOptions={getFilterOperatorOptions}
			getDefaultOperator={getDefaultFilterOperator}
			getFieldType={getFilterFieldType}
			groupModeOptions={getFilterGroupModeOptions()}
			getValueOptions={getNodeValueOptions}
			onAddCondition={addFilterCondition}
			onAddGroup={addFilterGroup}
			onUpdate={updateFilterItem}
			onRemove={removeFilterItem}
		/>
	</div>
	<div class="knowledge-workspace-curated-result-tools">
		<ObsidianTextInput
			type="search"
			placeholder="Search results..."
			value={conditionResultSearch}
			onInput={(value) => (conditionResultSearch = value)}
		/>
		<span>{selectedMatchCount} selected</span>
		<ObsidianButton
			text="Select all"
			onClick={selectVisibleMatches}
			disabled={visibleConditionalMatches.length === 0}
		/>
		<ObsidianButton
			text="Clear"
			onClick={clearVisibleMatches}
			disabled={selectedMatchCount === 0}
		/>
	</div>
	<div class="knowledge-workspace-curated-result-list">
		{#each visibleConditionalMatches as node (node.path)}
			<label
				class:disabled={!canApplyConditionTo(node)}
				class="knowledge-workspace-curated-result"
			>
				<input
					type="checkbox"
					checked={selectedMatchPaths.has(node.path)}
					disabled={!canApplyConditionTo(node)}
					onchange={() => toggleMatch(node.path)}
				/>
				<span
					style={`background: ${nodeColors.get(node.path) ?? 'var(--color-green, #44a37f)'}`}
				></span>
				<div>
					<strong>{node.title}</strong>
					<span>{node.path}</span>
				</div>
				<small>
					{conditionMode === 'add'
						? selectedPaths.has(node.path)
							? 'Added'
							: 'New'
						: 'Selected'}
				</small>
			</label>
		{:else}
			<span class="knowledge-workspace-curated-empty"
				>No matching files</span
			>
		{/each}
	</div>
	<div class="knowledge-workspace-curated-modal-actions">
		<ObsidianButton text="Cancel" onClick={onClose} />
		<ObsidianButton
			text={conditionMode === 'add'
				? `Add ${selectedMatchCount}`
				: `Remove ${selectedMatchCount}`}
			icon={conditionMode === 'add' ? 'plus' : 'trash-2'}
			disabled={selectedMatchCount === 0}
			destructive={conditionMode === 'remove'}
			onClick={applyConditionalChange}
		/>
	</div>
</WorkspaceModal>
