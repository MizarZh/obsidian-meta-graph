<script lang="ts">
	import type { App } from "obsidian";
	import { onDestroy } from "svelte";
	import type {
		ChartGroup,
		CuratedWorkspaceConfig,
		KnowledgeNode,
		ManualLayoutConfig,
	} from "../core/types";
	import CuratedBatchAdd from "./curated/CuratedBatchAdd.svelte";
	import CuratedConditionModal from "./curated/CuratedConditionModal.svelte";
	import CuratedFileList from "./curated/CuratedFileList.svelte";
	import {
		buildFileOptions,
		buildSelectedCuratedFiles,
		buildTitleIndex,
		countTitles,
		parseBatchInput,
		readPointerPlacement,
		type ReorderPlacement,
	} from "./curated/curated-panel-state";
	import ObsidianButton from "./obsidian/ObsidianButton.svelte";
	import ObsidianDropdown from "./obsidian/ObsidianDropdown.svelte";
	import ObsidianSuggestInput from "./obsidian/ObsidianSuggestInput.svelte";

	let {
		app,
		curated,
		nodes,
		groups,
		manualLayout,
		groupRequired = false,
		folders,
		nodeColors,
		workspaceFilePath,
		panelOpen,
		onTogglePanel,
		panelWidth,
		onResizePanel,
		focusOnSelect,
		onToggleFocusOnSelect,
		dropTarget,
		onAddFile,
		onAddFiles,
		onRemoveFile,
		onRemoveFiles,
		onMoveFilesToGroup,
		onClearFiles,
		onReorderFile,
		onOpenNote,
		onSelectNote,
	}: {
		app: App;
		curated: CuratedWorkspaceConfig;
		nodes: KnowledgeNode[];
		groups: ChartGroup[];
		manualLayout: ManualLayoutConfig;
		groupRequired?: boolean;
		folders: string[];
		nodeColors: Map<string, string>;
		workspaceFilePath?: string;
		panelOpen: boolean;
		onTogglePanel: () => void;
		panelWidth: number;
		onResizePanel: (width: number) => void;
		focusOnSelect: boolean;
		onToggleFocusOnSelect: () => void;
		dropTarget: boolean;
		onAddFile: (path: string, groupId?: string) => void;
		onAddFiles: (paths: string[], groupId?: string) => void;
		onRemoveFile: (path: string) => void;
		onRemoveFiles: (paths: string[]) => void;
		onMoveFilesToGroup: (paths: string[], groupId?: string) => void;
		onClearFiles: () => void;
		onReorderFile: (
			path: string,
			targetPath: string,
			placement: ReorderPlacement,
		) => void;
		onOpenNote: (path: string) => void;
		onSelectNote: (path: string) => void;
	} = $props();

	let fileSearch = $state("");
	let addGroupId = $state("");
	let batchInput = $state("");
	let batchOpen = $state(false);
	let conditionModalOpen = $state(false);
	let selected = $state<Set<string>>(new Set());
	let batchStatus = $state("");
	let reorderDrag = $state<
		| {
				path: string;
				startX: number;
				startY: number;
				active: boolean;
		  }
		| undefined
	>(undefined);

	const activeDraggingPath = $derived(
		reorderDrag?.active ? reorderDrag.path : undefined,
	);
	const addGroupOptions = $derived([
		...(groupRequired ? [] : [{ value: "", label: "No group" }]),
		...groups.map((group) => ({ value: group.id, label: group.name })),
	]);
	const groupOptions = $derived(addGroupOptions);
	const groupsById = $derived(new Map(groups.map((group) => [group.id, group])));
	const selectedAddGroupId = $derived(
		addGroupId || (groupRequired ? groups[0]?.id : undefined),
	);
	const selectedPaths = $derived(new Set(curated.files.map((file) => file.path)));
	const nodesByPath = $derived(new Map(nodes.map((node) => [node.path, node])));
	const titleIndex = $derived(buildTitleIndex(nodes));
	const availableTitleCounts = $derived(countTitles(nodes));
	const selectedFiles = $derived(
		buildSelectedCuratedFiles(
			curated,
			nodesByPath,
			manualLayout,
			groupsById,
			nodeColors,
			selected,
		),
	);
	const selectedTitleCounts = $derived(countTitles(selectedFiles));
	const selectedCount = $derived(
		curated.files.filter((file) => selected.has(file.path)).length,
	);
	const fileOptions = $derived(
		buildFileOptions(nodes, workspaceFilePath, selectedPaths, availableTitleCounts),
	);

	$effect(() => {
		if (addGroupId && !groups.some((group) => group.id === addGroupId)) {
			addGroupId = "";
		}
		if (groupRequired && !addGroupId && groups[0]) {
			addGroupId = groups[0].id;
		}
	});

	function toggleSelected(path: string): void {
		const next = new Set(selected);
		if (next.has(path)) {
			next.delete(path);
		} else {
			next.add(path);
		}
		selected = next;
	}

	function clearSelection(): void {
		selected = new Set();
	}

	function removeSelected(): void {
		const paths = curated.files
			.map((file) => file.path)
			.filter((path) => selected.has(path));
		if (paths.length === 0) {
			return;
		}
		onRemoveFiles(paths);
		clearSelection();
	}

	function removeFiles(paths: string[]): void {
		onRemoveFiles(paths);
		selected = new Set([...selected].filter((path) => !paths.includes(path)));
	}

	function moveSelectedToGroup(groupId: string): void {
		const paths = curated.files
			.map((file) => file.path)
			.filter((path) => selected.has(path));
		if (paths.length === 0) {
			return;
		}
		onMoveFilesToGroup(paths, groupId || undefined);
	}

	function moveFileToGroup(path: string, groupId: string): void {
		onMoveFilesToGroup([path], groupId || undefined);
	}

	function getGroupOptions(currentGroupId: string) {
		return currentGroupId && !groupsById.has(currentGroupId)
			? [
					...groupOptions,
					{ value: currentGroupId, label: "Missing group" },
				]
			: groupOptions;
	}

	function clearAll(): void {
		if (
			curated.files.length === 0 ||
			!window.confirm("Remove all workspace files from this view?")
		) {
			return;
		}
		onClearFiles();
		clearSelection();
	}

	function addBatch(): void {
		const result = parseBatchInput(
			batchInput,
			nodesByPath,
			titleIndex,
			selectedPaths,
		);
		if (result.uniquePaths.length > 0) {
			onAddFiles(result.uniquePaths, selectedAddGroupId);
		}
		batchStatus = `${result.uniquePaths.length} added, ${result.skipped} skipped, ${result.unresolved.length} unresolved.`;
		if (result.unresolved.length === 0) {
			batchInput = "";
		}
	}

	function openConditionModal(): void {
		conditionModalOpen = true;
	}

	function handleFilePointerDown(path: string, event: PointerEvent): void {
		if (
			event.target instanceof HTMLElement &&
			event.target.closest("button, input")
		) {
			return;
		}
		onSelectNote(path);
		if (event.button !== 0) {
			return;
		}
		event.preventDefault();
		reorderDrag = {
			path,
			startX: event.clientX,
			startY: event.clientY,
			active: false,
		};
		window.addEventListener("pointermove", handleReorderPointerMove, {
			capture: true,
		});
		window.addEventListener("pointerup", handleReorderPointerUp, {
			capture: true,
			once: true,
		});
	}

	function handleReorderPointerMove(event: PointerEvent): void {
		if (!reorderDrag) {
			return;
		}
		const distance = Math.hypot(
			event.clientX - reorderDrag.startX,
			event.clientY - reorderDrag.startY,
		);
		if (!reorderDrag.active && distance < 4) {
			return;
		}
		event.preventDefault();
		reorderDrag = { ...reorderDrag, active: true };
		reorderAtPoint(reorderDrag.path, event.clientX, event.clientY);
	}

	function handleReorderPointerUp(): void {
		reorderDrag = undefined;
		window.removeEventListener("pointermove", handleReorderPointerMove, {
			capture: true,
		});
		window.removeEventListener("pointerup", handleReorderPointerUp, {
			capture: true,
		});
	}

	function reorderAtPoint(path: string, clientX: number, clientY: number): void {
		const target = document.elementFromPoint(clientX, clientY);
		if (!(target instanceof HTMLElement)) {
			return;
		}
		const targetEl = target.closest<HTMLElement>("[data-curated-file-path]");
		const targetPath = targetEl?.dataset.curatedFilePath;
		if (!targetEl || !targetPath || targetPath === path) {
			return;
		}
		onReorderFile(path, targetPath, readPointerPlacement(targetEl, clientY));
	}

	function handleResizePointerDown(event: PointerEvent): void {
		event.preventDefault();
		const startX = event.clientX;
		const startWidth = panelWidth;
		function onMove(moveEvent: PointerEvent) {
			const newWidth = Math.max(
				240,
				Math.min(420, startWidth + moveEvent.clientX - startX),
			);
			onResizePanel(newWidth);
		}
		function onUp() {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		}
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}

	onDestroy(() => {
		handleReorderPointerUp();
	});
</script>

<aside
	class="knowledge-workspace-curated-panel"
	class:knowledge-workspace-curated-panel-collapsed={!panelOpen}
	class:target={dropTarget}
	data-curated-drop-target={panelOpen ? "" : undefined}
	style="width: {panelOpen ? `${panelWidth}px` : undefined}"
>
	<div
		class="knowledge-workspace-curated-resize-handle"
		role="separator"
		aria-label="Resize workspace files"
		onpointerdown={handleResizePointerDown}
	></div>
	<ObsidianButton
		class="knowledge-workspace-curated-toggle"
		icon={panelOpen ? "panel-left-close" : "panel-left-open"}
		ariaLabel={panelOpen ? "Close workspace files" : "Open workspace files"}
		onClick={onTogglePanel}
	/>
	{#if panelOpen}
		<section>
			<header>
				<h3>Workspace files</h3>
				<span>{selectedFiles.length}</span>
				<ObsidianButton
					icon="crosshair"
					active={focusOnSelect}
					ariaLabel={focusOnSelect
						? "Auto-focus on click (enabled)"
						: "Auto-focus on click (disabled)"}
					tooltip="Auto-focus on click"
					class="knowledge-workspace-curated-focus-toggle"
					onClick={onToggleFocusOnSelect}
				/>
			</header>
			<div class="knowledge-workspace-curated-search">
				<ObsidianSuggestInput
					{app}
					type="search"
					placeholder="Add note..."
					ariaLabel="Add note to workspace"
					value={fileSearch}
					options={fileOptions}
					onInput={(value) => {
						fileSearch = value;
					}}
					onSelect={(option) => {
						onAddFile(option.value, selectedAddGroupId);
						fileSearch = "";
					}}
				/>
				<ObsidianDropdown
					value={addGroupId}
					options={addGroupOptions}
					ariaLabel="Group for added files"
					onChange={(value) => (addGroupId = value)}
				/>
			</div>
			<div class="knowledge-workspace-curated-actions">
				<ObsidianButton
					text="Filter files"
					icon="list-filter"
					onClick={openConditionModal}
				/>
				<ObsidianButton
					text={`Remove selected${selectedCount ? ` (${selectedCount})` : ""}`}
					icon="trash-2"
					disabled={selectedCount === 0}
					destructive={true}
					onClick={removeSelected}
				/>
				<ObsidianButton
					text="Clear selection"
					icon="circle-off"
					disabled={selectedCount === 0}
					onClick={clearSelection}
				/>
				<ObsidianDropdown
					value="__move__"
					options={[{ value: "__move__", label: "Move to group" }, ...groupOptions]}
					disabled={selectedCount === 0}
					ariaLabel="Move selected to group"
					onChange={(value) => {
						if (value !== "__move__") {
							moveSelectedToGroup(value);
						}
					}}
				/>
				<ObsidianButton
					text="Clear all"
					icon="x"
					disabled={curated.files.length === 0}
					destructive={true}
					onClick={clearAll}
				/>
			</div>
			<CuratedFileList
				files={selectedFiles}
				{selectedTitleCounts}
				{activeDraggingPath}
				{getGroupOptions}
				onToggleSelected={toggleSelected}
				onPointerDown={handleFilePointerDown}
				{onOpenNote}
				{onSelectNote}
				onMoveFileToGroup={moveFileToGroup}
				{onRemoveFile}
			/>
			<CuratedBatchAdd
				open={batchOpen}
				input={batchInput}
				status={batchStatus}
				groupId={addGroupId}
				groupOptions={addGroupOptions}
				onToggle={() => (batchOpen = !batchOpen)}
				onInput={(value) => (batchInput = value)}
				onAdd={addBatch}
				onGroupChange={(value) => (addGroupId = value)}
			/>
		</section>
	{/if}
	<CuratedConditionModal
		{app}
		open={conditionModalOpen}
		{nodes}
		{selectedPaths}
		{workspaceFilePath}
		{nodeColors}
		{addGroupId}
		{addGroupOptions}
		{selectedAddGroupId}
		{folders}
		onGroupChange={(value) => (addGroupId = value)}
		{onAddFiles}
		onRemoveFiles={removeFiles}
		onClose={() => (conditionModalOpen = false)}
	/>
</aside>
