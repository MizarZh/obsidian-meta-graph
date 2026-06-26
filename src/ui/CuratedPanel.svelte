<script lang="ts">
	import type { App } from "obsidian";
	import { onDestroy } from "svelte";
	import type {
		CuratedWorkspaceConfig,
		KnowledgeNode,
		NodeFilterField,
		NodeFilterOperator,
	} from "../core/types";
	import { matchesNodeCriterion } from "../query/filters";
	import ObsidianButton from "./obsidian/ObsidianButton.svelte";
	import ObsidianDropdown from "./obsidian/ObsidianDropdown.svelte";
	import ObsidianSuggestInput from "./obsidian/ObsidianSuggestInput.svelte";
	import ObsidianTextInput from "./obsidian/ObsidianTextInput.svelte";
	import WorkspaceModal from "./WorkspaceModal.svelte";

	type ReorderPlacement = "before" | "after";
	type ConditionalMode = "add" | "remove";

	const FILE_FILTER_FIELD_OPTIONS = [
		{ value: "file.name", label: "File" },
		{ value: "file.basename", label: "Name" },
		{ value: "file.path", label: "Path" },
		{ value: "file.folder", label: "Folder" },
		{ value: "file.ext", label: "Extension" },
		{ value: "file.tags", label: "Tags" },
		{ value: "file.links", label: "Links" },
		{ value: "metadata-field", label: "Property" },
	];
	const FILTER_OPERATOR_OPTIONS = [
		{ value: "has-value", label: "has value" },
		{ value: "empty", label: "has no value" },
		{ value: "is", label: "is" },
		{ value: "is-not", label: "is not" },
		{ value: "contains", label: "contains" },
		{ value: "does-not-contain", label: "does not contain" },
	];

	let {
		app,
		curated,
		nodes,
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
		onClearFiles,
		onReorderFile,
		onOpenNote,
		onSelectNote,
	}: {
		app: App;
		curated: CuratedWorkspaceConfig;
		nodes: KnowledgeNode[];
		nodeColors: Map<string, string>;
		workspaceFilePath?: string;
		panelOpen: boolean;
		onTogglePanel: () => void;
		panelWidth: number;
		onResizePanel: (width: number) => void;
		focusOnSelect: boolean;
		onToggleFocusOnSelect: () => void;
		dropTarget: boolean;
		onAddFile: (path: string) => void;
		onAddFiles: (paths: string[]) => void;
		onRemoveFile: (path: string) => void;
		onRemoveFiles: (paths: string[]) => void;
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
	let batchInput = $state("");
	let batchOpen = $state(false);
	let conditionModalOpen = $state(false);
	let conditionMode = $state<ConditionalMode>("add");
	let conditionField = $state<NodeFilterField>("file.folder");
	let conditionOperator = $state<NodeFilterOperator>("is");
	let conditionValue = $state("");
	let conditionResultSearch = $state("");
	let selectedMatchPaths = $state<Set<string>>(new Set());
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

	const selectedPaths = $derived(new Set(curated.files.map((file) => file.path)));
	const nodesByPath = $derived(new Map(nodes.map((node) => [node.path, node])));
	const titleIndex = $derived.by(() => {
		const index = new Map<string, KnowledgeNode[]>();
		for (const node of nodes) {
			const keys = [
				node.title,
				node.path.replace(/\.md$/u, ""),
				...(node.aliases ?? []),
			];
			for (const key of keys) {
				const normalized = key.trim().toLocaleLowerCase();
				if (!normalized) {
					continue;
				}
				index.set(normalized, [...(index.get(normalized) ?? []), node]);
			}
		}
		return index;
	});
	const availableTitleCounts = $derived(
		nodes.reduce<Record<string, number>>((acc, node) => {
			acc[node.title] = (acc[node.title] ?? 0) + 1;
			return acc;
		}, {}),
	);
	const selectedFiles = $derived(
		curated.files.map((file) => {
			const node = nodesByPath.get(file.path);
			return {
				path: file.path,
				title: node?.title ?? formatFileTitle(file.path),
				detail: file.path,
				missing: !node,
				color: node ? nodeColors.get(node.path) : undefined,
				selected: selected.has(file.path),
			};
		}),
	);
	const selectedTitleCounts = $derived(
		selectedFiles.reduce<Record<string, number>>((acc, entry) => {
			acc[entry.title] = (acc[entry.title] ?? 0) + 1;
			return acc;
		}, {}),
	);
	const selectedCount = $derived(
		curated.files.filter((file) => selected.has(file.path)).length,
	);
	const fileOptions = $derived(
		nodes
			.filter(
				(node) =>
					node.path !== workspaceFilePath &&
					!selectedPaths.has(node.path),
			)
			.map((node) => ({
				value: node.path,
				label:
					(availableTitleCounts[node.title] ?? 0) > 1
						? `${node.folder}/${node.title}`
						: node.title,
				detail: node.path,
				searchText: [node.title, node.path, ...(node.aliases ?? [])].join(
					" ",
				),
			})),
	);
	const conditionValueOptions = $derived(getConditionValueOptions(conditionField));
	const conditionalMatches = $derived.by(() => {
		const pool =
			conditionMode === "add"
				? nodes.filter((node) => node.path !== workspaceFilePath)
				: nodes.filter((node) => selectedPaths.has(node.path));
		return pool
			.filter((node) =>
				matchesNodeCriterion(
					node,
					conditionField,
					conditionOperator,
					conditionValue,
				),
			)
			.sort((first, second) =>
				first.title.localeCompare(second.title, undefined, {
					sensitivity: "base",
				}),
			);
	});
	const conditionalStatus = $derived(
		`${conditionalMatches.length} ${conditionMode === "add" ? "matches" : "selected"}`,
	);
	const visibleConditionalMatches = $derived.by(() => {
		const query = conditionResultSearch.trim().toLocaleLowerCase();
		if (!query) {
			return conditionalMatches;
		}
		return conditionalMatches.filter((node) =>
			[node.title, node.path, node.folder, ...(node.aliases ?? [])]
				.join(" ")
				.toLocaleLowerCase()
				.includes(query),
		);
	});
	const selectedMatchCount = $derived(
		conditionalMatches.filter(
			(node) => selectedMatchPaths.has(node.path) && canApplyConditionTo(node),
		).length,
	);

	function formatFileTitle(path: string): string {
		return path.split("/").pop()?.replace(/\.md$/u, "") ?? path;
	}

	function toggleSelected(path: string): void {
		const next = new Set(selected);
		if (next.has(path)) {
			next.delete(path);
		} else {
			next.add(path);
		}
		selected = next;
	}

	function removeSelected(): void {
		const paths = curated.files
			.map((file) => file.path)
			.filter((path) => selected.has(path));
		if (paths.length === 0) {
			return;
		}
		onRemoveFiles(paths);
		selected = new Set();
	}

	function clearAll(): void {
		if (
			curated.files.length === 0 ||
			!window.confirm("Remove all workspace files from this view?")
		) {
			return;
		}
		onClearFiles();
		selected = new Set();
	}

	function addBatch(): void {
		const lines = batchInput
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter(Boolean);
		const paths: string[] = [];
		const unresolved: string[] = [];
		for (const line of lines) {
			const resolved = resolveBatchLine(line);
			if (resolved) {
				paths.push(resolved);
			} else {
				unresolved.push(line);
			}
		}
		const uniquePaths = [...new Set(paths)].filter(
			(path) => !selectedPaths.has(path),
		);
		if (uniquePaths.length > 0) {
			onAddFiles(uniquePaths);
		}
		batchStatus = `${uniquePaths.length} added, ${lines.length - uniquePaths.length - unresolved.length} skipped, ${unresolved.length} unresolved.`;
		if (unresolved.length === 0) {
			batchInput = "";
		}
	}

	function applyConditionalChange(): void {
		const paths = conditionalMatches
			.filter(
				(node) =>
					selectedMatchPaths.has(node.path) && canApplyConditionTo(node),
			)
			.map((node) => node.path);
		if (paths.length === 0) {
			return;
		}
		if (conditionMode === "add") {
			onAddFiles(paths);
		} else {
			onRemoveFiles(paths);
			selected = new Set([...selected].filter((path) => !paths.includes(path)));
		}
		conditionModalOpen = false;
		selectedMatchPaths = new Set();
	}

	function openConditionModal(): void {
		conditionModalOpen = true;
		conditionResultSearch = "";
		resetConditionalSelection();
	}

	function closeConditionModal(): void {
		conditionModalOpen = false;
	}

	function resetConditionalSelection(): void {
		selectedMatchPaths = new Set(
			conditionalMatches
				.filter((node) => canApplyConditionTo(node))
				.map((node) => node.path),
		);
	}

	function canApplyConditionTo(node: KnowledgeNode): boolean {
		return conditionMode === "add"
			? !selectedPaths.has(node.path)
			: selectedPaths.has(node.path);
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
		const visiblePaths = new Set(visibleConditionalMatches.map((node) => node.path));
		selectedMatchPaths = new Set(
			[...selectedMatchPaths].filter((path) => !visiblePaths.has(path)),
		);
	}

	function updateConditionMode(mode: ConditionalMode): void {
		conditionMode = mode;
		window.requestAnimationFrame(resetConditionalSelection);
	}

	function updateConditionField(field: NodeFilterField): void {
		conditionField = field;
		conditionValue = "";
		window.requestAnimationFrame(resetConditionalSelection);
	}

	function updateConditionOperator(operator: NodeFilterOperator): void {
		conditionOperator = operator;
		window.requestAnimationFrame(resetConditionalSelection);
	}

	function shouldShowConditionValue(operator: NodeFilterOperator): boolean {
		return operator !== "has-value" && operator !== "empty";
	}

	function getConditionValueOptions(
		field: NodeFilterField,
	): Array<{ value: string; label: string; searchText: string }> {
		if (field === "file.folder" || field === "folder") {
			return uniqueSorted(
				nodes.map((node) => node.folder).filter(Boolean),
			).map((folder) => ({
				value: folder,
				label: folder,
				searchText: folder,
			}));
		}
		if (field === "file.tags" || field === "tag") {
			return uniqueSorted(nodes.flatMap((node) => node.tags)).map((tag) => ({
				value: tag,
				label: tag,
				searchText: tag,
			}));
		}
		if (field === "metadata-field") {
			return uniqueSorted(
				nodes.flatMap((node) => node.metadataFields ?? []),
			).map((fieldName) => ({
				value: fieldName,
				label: fieldName,
				searchText: fieldName,
			}));
		}
		return [];
	}

	function uniqueSorted(values: string[]): string[] {
		return [...new Set(values.filter(Boolean))].sort((first, second) =>
			first.localeCompare(second, undefined, { sensitivity: "base" }),
		);
	}

	function resolveBatchLine(line: string): string | undefined {
		const wikilink = line.match(/^\[\[([^|\]]+)(?:\|[^\]]+)?\]\]$/u);
		const value = (wikilink?.[1] ?? line).trim();
		const exact = nodesByPath.get(value) ?? nodesByPath.get(`${value}.md`);
		if (exact) {
			return exact.path;
		}
		const matches = titleIndex.get(value.toLocaleLowerCase()) ?? [];
		return matches.length === 1 ? matches[0]?.path : undefined;
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

	function readPointerPlacement(
		targetEl: HTMLElement,
		clientY: number,
	): ReorderPlacement {
		const rect = targetEl.getBoundingClientRect();
		return clientY > rect.top + rect.height / 2 ? "after" : "before";
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
						onAddFile(option.value);
						fileSearch = "";
					}}
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
					text="Clear all"
					icon="x"
					disabled={curated.files.length === 0}
					destructive={true}
					onClick={clearAll}
				/>
			</div>
			<div class="knowledge-workspace-curated-list">
				{#each selectedFiles as file (file.path)}
					<div
						class="knowledge-workspace-curated-file"
						class:dragging={activeDraggingPath === file.path}
						class:missing={file.missing}
						class:selected={file.selected}
						data-curated-file-path={file.path}
						role="button"
						tabindex="0"
						aria-label={file.missing
							? `${file.title} (file not found)`
							: file.title}
						title={file.missing
							? `File not found: ${file.path}`
							: undefined}
						onpointerdown={(event) =>
							handleFilePointerDown(file.path, event)}
						ondblclick={file.missing
							? undefined
							: () => onOpenNote(file.path)}
						onkeydown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onSelectNote(file.path);
							}
						}}
					>
						<input
							type="checkbox"
							aria-label={`Select ${file.title}`}
							checked={file.selected}
							onclick={(event) => event.stopPropagation()}
							onchange={() => toggleSelected(file.path)}
						/>
						<span
							style={file.missing
								? undefined
								: `background: ${file.color ?? 'var(--color-green, #44a37f)'}`}
						></span>
						<div class="knowledge-workspace-curated-file-title">
							<strong>{file.title}</strong>
							{#if (selectedTitleCounts[file.title] ?? 0) > 1}
								<span class="knowledge-workspace-curated-file-path">{file.detail}</span>
							{/if}
						</div>
						<ObsidianButton
							ariaLabel={`Open ${file.title}`}
							icon="file-text"
							disabled={file.missing}
							onClick={(event) => {
								event.stopPropagation();
								onOpenNote(file.path);
							}}
						/>
						<ObsidianButton
							ariaLabel={`Remove ${file.title}`}
							icon="x"
							onClick={(event) => {
								event.stopPropagation();
								onRemoveFile(file.path);
							}}
						/>
					</div>
				{:else}
					<span class="knowledge-workspace-curated-empty">
						No workspace files
					</span>
				{/each}
			</div>
			<div class="knowledge-workspace-curated-batch-header">
				<ObsidianButton
					icon={batchOpen ? "chevron-down" : "chevron-right"}
					ariaLabel={batchOpen ? "Collapse batch add" : "Expand batch add"}
					onClick={() => (batchOpen = !batchOpen)}
				/>
				<h3>Batch add</h3>
				<span>{batchStatus}</span>
			</div>
			{#if batchOpen}
				<textarea
					class="knowledge-workspace-curated-batch"
					placeholder="One path or [[wikilink]] per line"
					aria-label="Batch add workspace files"
					bind:value={batchInput}
				></textarea>
				<div class="knowledge-workspace-curated-actions">
					<ObsidianButton
						text="Add all"
						icon="plus"
						disabled={!batchInput.trim()}
						onClick={addBatch}
					/>
				</div>
			{/if}
			</section>
		{/if}
		<WorkspaceModal
			open={conditionModalOpen}
			title="Filter files"
			subtitle={conditionalStatus}
			onClose={closeConditionModal}
		>
				<div class="knowledge-workspace-curated-condition">
					<div class="knowledge-workspace-curated-condition-mode">
						<ObsidianButton
							class="knowledge-workspace-condition-mode-button"
							text="Add to workspace"
							icon="plus"
							active={conditionMode === "add"}
							cta={conditionMode === "add"}
							onClick={() => updateConditionMode("add")}
						/>
						<ObsidianButton
							class="knowledge-workspace-condition-mode-button"
							text="Remove from workspace"
							icon="trash-2"
							active={conditionMode === "remove"}
							destructive={conditionMode === "remove"}
							onClick={() => updateConditionMode("remove")}
						/>
					</div>
					<div class="knowledge-workspace-curated-condition-row">
						<ObsidianDropdown
							value={conditionField}
							options={FILE_FILTER_FIELD_OPTIONS}
							onChange={(value) =>
								updateConditionField(value as NodeFilterField)}
						/>
						<ObsidianDropdown
							value={conditionOperator}
							options={FILTER_OPERATOR_OPTIONS}
							onChange={(value) =>
								updateConditionOperator(value as NodeFilterOperator)}
						/>
					</div>
					{#if shouldShowConditionValue(conditionOperator)}
						{#if conditionValueOptions.length > 0}
							<ObsidianSuggestInput
								{app}
								type="text"
								placeholder="Value"
								value={conditionValue}
								options={conditionValueOptions}
								onInput={(value) => {
									conditionValue = value;
									window.requestAnimationFrame(resetConditionalSelection);
								}}
								onSelect={(option) => {
									conditionValue = option.value;
									window.requestAnimationFrame(resetConditionalSelection);
								}}
							/>
						{:else}
							<ObsidianTextInput
								type="text"
								placeholder="Value"
								value={conditionValue}
								onInput={(value) => {
									conditionValue = value;
									window.requestAnimationFrame(resetConditionalSelection);
								}}
							/>
						{/if}
					{/if}
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
								{conditionMode === "add"
									? selectedPaths.has(node.path)
										? "Added"
										: "New"
									: "Selected"}
							</small>
						</label>
					{:else}
						<span class="knowledge-workspace-curated-empty">
							No matching files
						</span>
					{/each}
				</div>
				<div class="knowledge-workspace-curated-modal-actions">
					<ObsidianButton text="Cancel" onClick={closeConditionModal} />
					<ObsidianButton
						text={conditionMode === "add"
							? `Add ${selectedMatchCount}`
							: `Remove ${selectedMatchCount}`}
						icon={conditionMode === "add" ? "plus" : "trash-2"}
						disabled={selectedMatchCount === 0}
						destructive={conditionMode === "remove"}
						onClick={applyConditionalChange}
					/>
				</div>
		</WorkspaceModal>
	</aside>
