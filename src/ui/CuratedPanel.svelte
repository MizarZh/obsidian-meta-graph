<script lang="ts">
	import type { App } from "obsidian";
	import type {
		CuratedWorkspaceConfig,
		KnowledgeNode,
	} from "../core/types";
	import ObsidianButton from "./obsidian/ObsidianButton.svelte";
	import ObsidianSuggestInput from "./obsidian/ObsidianSuggestInput.svelte";

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
		onAddFile,
		onAddFiles,
		onRemoveFile,
		onRemoveFiles,
		onClearFiles,
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
		onAddFile: (path: string) => void;
		onAddFiles: (paths: string[]) => void;
		onRemoveFile: (path: string) => void;
		onRemoveFiles: (paths: string[]) => void;
		onClearFiles: () => void;
		onOpenNote: (path: string) => void;
		onSelectNote: (path: string) => void;
	} = $props();

	let fileSearch = $state("");
	let batchInput = $state("");
	let batchOpen = $state(false);
	let selected = $state<Set<string>>(new Set());
	let batchStatus = $state("");

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
</script>

<aside
	class="knowledge-workspace-curated-panel"
	class:knowledge-workspace-curated-panel-collapsed={!panelOpen}
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
						class:missing={file.missing}
						class:selected={file.selected}
						role="button"
						tabindex="0"
						aria-label={file.missing
							? `${file.title} (file not found)`
							: file.title}
						title={file.missing
							? `File not found: ${file.path}`
							: undefined}
						onclick={() => onSelectNote(file.path)}
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
</aside>
