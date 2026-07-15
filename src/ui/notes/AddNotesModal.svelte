<script lang="ts">
	import type { App } from 'obsidian';
	import type { KnowledgeNode, NodeFilterGroup } from '../../core/types';
	import { nodeMatchesFilterGroup } from '../../query/filters';
	import {
		buildTitleIndex,
		createConditionFilterRoot,
		parseBatchInput,
		type CuratedConditionDraft,
	} from '../curated/curated-panel-state';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianDropdown, {
		type DropdownOption,
	} from '../obsidian/ObsidianDropdown.svelte';
	import ObsidianTextInput from '../obsidian/ObsidianTextInput.svelte';
	import WorkspaceModal from '../WorkspaceModal.svelte';
	import NoteFilterEditor from './NoteFilterEditor.svelte';

	let {
		app,
		open,
		nodes,
		existingPaths,
		workspaceFilePath,
		nodeColors,
		folders,
		draft,
		groupId = '',
		groupOptions = [],
		showGroup = false,
		existingLabel = 'In workspace',
		onDraftChange,
		onGroupChange = () => {},
		onAddFiles,
		onClose,
	}: {
		app: App;
		open: boolean;
		nodes: KnowledgeNode[];
		existingPaths: Set<string>;
		workspaceFilePath?: string;
		nodeColors: Map<string, string>;
		folders: string[];
		draft: CuratedConditionDraft;
		groupId?: string;
		groupOptions?: DropdownOption[];
		showGroup?: boolean;
		existingLabel?: string;
		onDraftChange: (draft: CuratedConditionDraft) => void;
		onGroupChange?: (value: string) => void;
		onAddFiles: (paths: string[], groupId?: string) => void;
		onClose: () => void;
	} = $props();

	let selectedPaths = $state<Set<string>>(new Set());
	let filterOpen = $state(false);
	let importOpen = $state(false);
	let importInput = $state('');
	let importStatus = $state('');
	let importedPaths = $state<Set<string> | undefined>(undefined);
	let wasOpen = $state(false);

	const filterCount = $derived(countConditions(draft.filterRoot));
	const matchingNodes = $derived.by(() => {
		const query = draft.resultSearch.trim().toLocaleLowerCase();
		return nodes
			.filter((node) => node.path !== workspaceFilePath)
			.filter((node) => nodeMatchesFilterGroup(node, draft.filterRoot))
			.filter((node) => !importedPaths || importedPaths.has(node.path))
			.filter(
				(node) =>
					!query ||
					[
						node.title,
						node.path,
						node.folder,
						...(node.aliases ?? []),
					]
						.join(' ')
						.toLocaleLowerCase()
						.includes(query),
			)
			.sort((left, right) =>
				left.title.localeCompare(right.title, undefined, {
					sensitivity: 'base',
				}),
			);
	});
	const selectedCount = $derived(
		[...selectedPaths].filter((path) => !existingPaths.has(path)).length,
	);

	$effect(() => {
		if (open && !wasOpen) {
			selectedPaths = new Set();
			importOpen = false;
			importInput = '';
			importStatus = '';
			importedPaths = undefined;
		}
		wasOpen = open;
	});

	function updateDraft(patch: Partial<CuratedConditionDraft>): void {
		onDraftChange({ ...draft, ...patch });
	}

	function togglePath(path: string): void {
		if (existingPaths.has(path)) return;
		const next = new Set(selectedPaths);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		selectedPaths = next;
	}

	function selectAllMatching(): void {
		selectedPaths = new Set([
			...selectedPaths,
			...matchingNodes
				.filter((node) => !existingPaths.has(node.path))
				.map((node) => node.path),
		]);
	}

	function clearMatchingSelection(): void {
		selectedPaths = new Set();
	}

	function importPaths(): void {
		const result = parseBatchInput(
			importInput,
			new Map(nodes.map((node) => [node.path, node])),
			buildTitleIndex(nodes),
			new Set(),
		);
		importedPaths = new Set(result.uniquePaths);
		selectedPaths = new Set(
			result.uniquePaths.filter((path) => !existingPaths.has(path)),
		);
		importStatus = `${result.uniquePaths.length} resolved, ${result.unresolved.length} unresolved.`;
		importOpen = false;
		updateDraft({ resultSearch: '' });
	}

	function clearImport(): void {
		importedPaths = undefined;
		importStatus = '';
	}

	function addSelected(): void {
		const paths = nodes
			.map((node) => node.path)
			.filter(
				(path) => selectedPaths.has(path) && !existingPaths.has(path),
			);
		if (paths.length === 0) return;
		onAddFiles(paths, showGroup ? groupId || undefined : undefined);
		onClose();
	}

	function countConditions(group: NodeFilterGroup): number {
		return group.children.reduce(
			(total, child) =>
				total + (child.kind === 'group' ? countConditions(child) : 1),
			0,
		);
	}
</script>

<WorkspaceModal
	{open}
	title="Add notes"
	subtitle={`${matchingNodes.length} notes`}
	{onClose}
>
	<div class="knowledge-workspace-note-picker-tools">
		<ObsidianTextInput
			type="search"
			placeholder="Search notes..."
			ariaLabel="Search notes"
			value={draft.resultSearch}
			onInput={(value) => updateDraft({ resultSearch: value })}
		/>
		<ObsidianButton
			icon="list-filter"
			text={filterCount > 0 ? `Filter (${filterCount})` : 'Filter'}
			active={filterOpen}
			onClick={() => (filterOpen = !filterOpen)}
		/>
		<ObsidianButton
			icon="clipboard-paste"
			ariaLabel="Paste note paths"
			tooltip="Paste note paths"
			onClick={() => (importOpen = !importOpen)}
		/>
	</div>
	{#if showGroup}
		<label class="knowledge-workspace-note-picker-group">
			<span>Group</span>
			<ObsidianDropdown
				value={groupId}
				options={groupOptions}
				ariaLabel="Group for added notes"
				onChange={onGroupChange}
			/>
		</label>
	{/if}
	{#if filterOpen}
		<NoteFilterEditor
			{app}
			{nodes}
			{folders}
			filterRoot={draft.filterRoot}
			onChange={(filterRoot) => updateDraft({ filterRoot })}
		/>
		{#if filterCount > 0}
			<div class="knowledge-workspace-note-picker-filter-actions">
				<span>{filterCount} conditions</span>
				<ObsidianButton
					text="Clear filters"
					onClick={() =>
						updateDraft({
							filterRoot: createConditionFilterRoot(),
						})}
				/>
			</div>
		{/if}
	{/if}
	{#if importOpen}
		<div class="knowledge-workspace-note-picker-import">
			<textarea
				placeholder="One path or [[wikilink]] per line"
				aria-label="Paste note paths"
				value={importInput}
				oninput={(event) => (importInput = event.currentTarget.value)}
			></textarea>
			<ObsidianButton
				text="Show paths"
				icon="list-checks"
				disabled={!importInput.trim()}
				onClick={importPaths}
			/>
		</div>
	{/if}
	{#if importedPaths}
		<div class="knowledge-workspace-note-picker-import-status">
			<span>{importStatus}</span>
			<ObsidianButton text="Show all notes" onClick={clearImport} />
		</div>
	{/if}
	<div class="knowledge-workspace-note-picker-selection">
		<span>{selectedCount} selected</span>
		<ObsidianButton
			text="Select all matching"
			disabled={matchingNodes.length === 0}
			onClick={selectAllMatching}
		/>
		<ObsidianButton
			text="Clear"
			disabled={selectedCount === 0}
			onClick={clearMatchingSelection}
		/>
	</div>
	<div class="knowledge-workspace-note-picker-results">
		{#each matchingNodes as node (node.path)}
			{@const exists = existingPaths.has(node.path)}
			<label
				class:disabled={exists}
				class="knowledge-workspace-note-picker-row"
			>
				<input
					type="checkbox"
					checked={selectedPaths.has(node.path)}
					disabled={exists}
					onchange={() => togglePath(node.path)}
				/>
				<span
					style={`background: ${nodeColors.get(node.path) ?? 'var(--color-green, #44a37f)'}`}
				></span>
				<div>
					<strong>{node.title}</strong>
					<span>{node.path}</span>
				</div>
				<small>{exists ? existingLabel : 'New'}</small>
			</label>
		{:else}
			<span class="knowledge-workspace-note-picker-empty"
				>No matching notes</span
			>
		{/each}
	</div>
	<div class="knowledge-workspace-note-picker-actions">
		<ObsidianButton text="Cancel" onClick={onClose} />
		<ObsidianButton
			text={`Add ${selectedCount} notes`}
			icon="plus"
			cta={true}
			disabled={selectedCount === 0}
			onClick={addSelected}
		/>
	</div>
</WorkspaceModal>
