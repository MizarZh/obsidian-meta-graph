<script lang="ts">
	import type { App } from "obsidian";
	import { onDestroy } from "svelte";
	import ObsidianButton from "./obsidian/ObsidianButton.svelte";
	import ObsidianSuggestInput from "./obsidian/ObsidianSuggestInput.svelte";
	import ObsidianTextInput from "./obsidian/ObsidianTextInput.svelte";
	import type {
		DockConnectionDirection,
		DockTemplateNode,
		KnowledgeNode,
	} from "../core/types";

	export type DockDragPayload =
		| {
				kind: "template";
				templateId: string;
				label: string;
		  }
		| {
				kind: "note";
				notePath: string;
				label: string;
				direction: DockConnectionDirection;
				relationField: string;
		  }
		| {
				kind: "broken-note";
				notePath: string;
				label: string;
		  };
	type ReorderPlacement = "before" | "after";

	let {
		app,
		templates,
		notes,
		availableNotes,
		nodeColors,
		dockOpen,
		onToggleDock,
		dockWidth,
		onResizeDock,
		activeConnectionField,
		draggingKey,
		linking,
		targetNodeId,
		graphTargetNotePath,
		graphTargetTemplateId,
		onAddTemplate,
		onUpdateTemplate,
		onRemoveTemplate,
		onAddNote,
		onRemoveNote,
		onReorderTemplate,
		onReorderNote,
		onLinkPointerDown,
		onOpenNote,
		onSelectNote,
		focusOnSelect,
		onToggleFocusOnSelect,
	}: {
		app: App;
		templates: DockTemplateNode[];
		notes: Array<{
			id: string;
			path: string;
			title: string;
			broken: boolean;
			color?: string;
		}>;
		availableNotes: KnowledgeNode[];
		nodeColors: Map<string, string>;
		dockOpen: boolean;
		onToggleDock: () => void;
		dockWidth: number;
		onResizeDock: (width: number) => void;
		activeConnectionField: string;
		draggingKey?: string;
		linking: boolean;
		targetNodeId?: string;
		graphTargetNotePath?: string;
		graphTargetTemplateId?: string;
		onAddTemplate: (template: Omit<DockTemplateNode, "id">) => void;
		onUpdateTemplate: (
			templateId: string,
			template: Omit<DockTemplateNode, "id">,
		) => void;
		onRemoveTemplate: (templateId: string) => void;
		onAddNote: (path: string) => void;
		onRemoveNote: (path: string) => void;
		onReorderTemplate: (
			templateId: string,
			targetTemplateId: string,
			placement: ReorderPlacement,
		) => void;
		onReorderNote: (
			path: string,
			targetPath: string,
			placement: ReorderPlacement,
		) => void;
		onLinkPointerDown: (
			payload: DockDragPayload,
			event: PointerEvent,
		) => void;
		onOpenNote: (nodeId: string) => void;
		onSelectNote: (nodeId: string) => void;
		focusOnSelect: boolean;
		onToggleFocusOnSelect: () => void;
	} = $props();

	let templateFormOpen = $state(false);
	let templatesOpen = $state(true);
	let notesOpen = $state(true);
	let noteSearch = $state("");
	let templateLabel = $state("");
	let templatePath = $state("");
	let targetFolder = $state("");
	let editingTemplateId = $state<string | undefined>(undefined);
	let reorderDrag = $state<
		| {
				payload: DockDragPayload;
				startX: number;
				startY: number;
				active: boolean;
		  }
		| undefined
	>(undefined);
	const activeDraggingKey = $derived(
		draggingKey ??
			(reorderDrag?.active ? dragKey(reorderDrag.payload) : undefined),
	);

	const notesTitleCounts = $derived(
		notes.reduce<Record<string, number>>((acc, entry) => {
			acc[entry.title] = (acc[entry.title] ?? 0) + 1;
			return acc;
		}, {}),
	);

	const templateEntries = $derived(
		templates.map((t) => ({
			...t,
			broken:
				(t.templatePath !== "" &&
					!app.vault.getAbstractFileByPath(t.templatePath)) ||
				(t.targetFolder !== "" &&
					!app.vault.getAbstractFileByPath(t.targetFolder)),
		})),
	);

	const titleCounts = $derived(
		availableNotes.reduce<Record<string, number>>((acc, node) => {
			acc[node.title] = (acc[node.title] ?? 0) + 1;
			return acc;
		}, {}),
	);

	const noteOptions = $derived(
		availableNotes.map((node) => ({
			value: node.path,
			label:
				(titleCounts[node.title] ?? 0) > 1
					? `${node.folder}/${node.title}`
					: node.title,
			detail: node.path,
			searchText: [node.title, node.path, ...(node.aliases ?? [])].join(
				" ",
			),
		})),
	);
	const targetFolderOptions = $derived.by(() => {
		// Reference availableNotes so this re-runs when the graph refreshes.
		void availableNotes;
		const folderPaths = app.vault
			.getAllFolders()
			.map((f) => (f.path === "/" ? "" : f.path))
			.filter(Boolean)
			.sort((left, right) =>
				left.localeCompare(right, undefined, { sensitivity: "base" }),
			);
		return [
			{ value: "", label: "Vault root", searchText: "vault root" },
			...folderPaths.map((path) => ({
				value: path,
				label: path,
				searchText: path,
			})),
		];
	});

	function saveTemplate(): void {
		const label = templateLabel.trim();
		const path = templatePath.trim();
		if (!label || !path) {
			return;
		}
		const template = {
			label,
			templatePath: path,
			targetFolder: targetFolder.trim(),
			relationField: activeConnectionField,
			direction: "from-dock-to-graph",
		} satisfies Omit<DockTemplateNode, "id">;
		if (editingTemplateId) {
			onUpdateTemplate(editingTemplateId, template);
		} else {
			onAddTemplate(template);
		}
		closeTemplateForm();
	}

	function selectTemplateNote(path: string, title: string): void {
		templatePath = path;
		if (!templateLabel.trim()) {
			templateLabel = title;
		}
	}

	function selectTargetFolder(folder: string): void {
		targetFolder = folder;
	}

	function openAddTemplateForm(): void {
		if (templateFormOpen && !editingTemplateId) {
			closeTemplateForm();
			return;
		}
		editingTemplateId = undefined;
		templateLabel = "";
		templatePath = "";
		targetFolder = "";
		templateFormOpen = true;
	}

	function openEditTemplateForm(template: DockTemplateNode): void {
		editingTemplateId = template.id;
		templateLabel = template.label;
		templatePath = template.templatePath;
		targetFolder = template.targetFolder;
		templateFormOpen = true;
	}

	function closeTemplateForm(): void {
		templateLabel = "";
		templatePath = "";
		targetFolder = "";
		editingTemplateId = undefined;
		templateFormOpen = false;
	}

	function templateDragPayload(template: DockTemplateNode): DockDragPayload {
		return {
			kind: "template",
			templateId: template.id,
			label: template.label,
		};
	}

	function dragKey(payload: DockDragPayload): string {
		if (payload.kind === "template") {
			return `template:${payload.templateId}`;
		}
		return `note:${payload.notePath}`;
	}

	function handleNodePointerDown(
		payload: DockDragPayload,
		event: PointerEvent,
	): void {
		if (
			event.target instanceof HTMLElement &&
			event.target.closest("button")
		) {
			return;
		}
		if (payload.kind === "broken-note") {
			if (event.ctrlKey) return;
		} else if (event.ctrlKey) {
			handleLinkPointerDown(payload, event);
			return;
		}
		if (payload.kind === "note") {
			onSelectNote(payload.notePath);
		}
		if (event.button !== 0) {
			return;
		}
		event.preventDefault();
		reorderDrag = {
			payload,
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
		reorderAtPoint(reorderDrag.payload, event.clientX, event.clientY);
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

	function reorderAtPoint(
		payload: DockDragPayload,
		clientX: number,
		clientY: number,
	): void {
		const target = document.elementFromPoint(clientX, clientY);
		if (!(target instanceof HTMLElement)) {
			return;
		}
		if (payload.kind === "template") {
			const targetEl = target.closest<HTMLElement>(
				"[data-dock-template-id]",
			);
			const targetTemplateId = targetEl?.dataset.dockTemplateId;
			if (
				!targetEl ||
				!targetTemplateId ||
				targetTemplateId === payload.templateId
			) {
				return;
			}
			onReorderTemplate(
				payload.templateId,
				targetTemplateId,
				readPointerPlacement(targetEl, clientY),
			);
			return;
		}
		const targetEl = target.closest<HTMLElement>("[data-dock-note-path]");
		const targetPath = targetEl?.dataset.dockNotePath;
		if (!targetEl || !targetPath || targetPath === payload.notePath) {
			return;
		}
		onReorderNote(
			payload.notePath,
			targetPath,
			readPointerPlacement(targetEl, clientY),
		);
	}

	function readPointerPlacement(
		targetEl: HTMLElement,
		clientY: number,
	): ReorderPlacement {
		const rect = targetEl.getBoundingClientRect();
		return clientY > rect.top + rect.height / 2 ? "after" : "before";
	}

	function handleLinkPointerDown(
		payload: DockDragPayload,
		event: PointerEvent,
	): void {
		if (
			!event.ctrlKey ||
			event.button !== 0 ||
			(event.target instanceof HTMLElement &&
				event.target.closest("button"))
		) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		onLinkPointerDown(payload, event);
	}

	onDestroy(() => {
		handleReorderPointerUp();
	});

	function handleResizePointerDown(event: PointerEvent): void {
		event.preventDefault();
		const startX = event.clientX;
		const startWidth = dockWidth;
		function onMove(e: PointerEvent): void {
			const newWidth = Math.max(
				180,
				Math.min(480, startWidth + startX - e.clientX),
			);
			onResizeDock(newWidth);
		}
		function onUp(): void {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		}
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}
</script>

<aside
	class="knowledge-workspace-dock-panel"
	class:knowledge-workspace-dock-panel-collapsed={!dockOpen}
	style="width: {dockOpen ? `${dockWidth}px` : undefined}"
>
	<div
		class="knowledge-workspace-dock-resize-handle"
		role="separator"
		aria-label="Resize dock"
		onpointerdown={handleResizePointerDown}
	></div>
	<ObsidianButton
		class="knowledge-workspace-dock-toggle"
		icon={dockOpen ? "panel-right-close" : "panel-right-open"}
		ariaLabel={dockOpen ? "Close dock" : "Open dock"}
		onClick={onToggleDock}
	/>
	{#if dockOpen}
		<section
			class:knowledge-workspace-dock-section-collapsed={!templatesOpen}
		>
			<header>
				<ObsidianButton
					icon={templatesOpen ? "chevron-down" : "chevron-right"}
					ariaLabel={templatesOpen
						? "Collapse templates"
						: "Expand templates"}
					onClick={() => (templatesOpen = !templatesOpen)}
				/>
				<h3>Templates</h3>
				<ObsidianButton
					icon={templateFormOpen ? "x" : "plus"}
					ariaLabel={templateFormOpen
						? "Close template form"
						: "Add template"}
					onClick={templateFormOpen
						? closeTemplateForm
						: openAddTemplateForm}
				/>
			</header>
			{#if templatesOpen}
				{#if templateFormOpen}
					<form
						class="knowledge-workspace-dock-form"
						onsubmit={(event) => {
							event.preventDefault();
							saveTemplate();
						}}
					>
						<ObsidianTextInput
							type="text"
							placeholder="Label"
							value={templateLabel}
							onInput={(value) => {
								templateLabel = value;
							}}
						/>
						<label class="knowledge-workspace-dock-suggest">
							<ObsidianSuggestInput
								{app}
								type="text"
								placeholder="Template note..."
								value={templatePath}
								options={noteOptions}
								onInput={(value) => {
									templatePath = value;
								}}
								onSelect={(option) => {
									selectTemplateNote(
										option.value,
										option.label,
									);
								}}
							/>
						</label>
						<label class="knowledge-workspace-dock-suggest">
							<ObsidianSuggestInput
								{app}
								type="text"
								placeholder="Target folder..."
								value={targetFolder}
								options={targetFolderOptions}
								onInput={(value) => {
									targetFolder = value;
								}}
								onSelect={(option) => {
									selectTargetFolder(option.value);
								}}
							/>
						</label>
						<ObsidianButton
							icon={editingTemplateId ? "check" : "plus"}
							text={editingTemplateId
								? "Save template"
								: "Add template"}
							onClick={saveTemplate}
						/>
					</form>
				{/if}
				<div class="knowledge-workspace-dock-list">
					{#if templateEntries.length === 0}
						<span class="knowledge-workspace-dock-empty"
							>No templates</span
						>
					{:else}
						{#each templateEntries as template (template.id)}
							{@const payload = templateDragPayload(template)}
							<div
								class:dragging={activeDraggingKey ===
									dragKey(payload)}
								class:target={!template.broken &&
									graphTargetTemplateId === template.id}
								class="knowledge-workspace-dock-node template"
								class:broken={template.broken}
								data-dock-template-id={template.id}
								data-dock-template-broken={template.broken
									? ""
									: undefined}
								role="button"
								tabindex="0"
								aria-label={
									template.broken
										? `${template.label} (template note or target folder not found)`
										: template.label
								}
								title={
									template.broken
										? `Template note or target folder not found`
										: undefined
								}
								onpointerdown={(event) => {
									if (template.broken && event.ctrlKey)
										return;
									handleNodePointerDown(payload, event);
								}}
							>
								<span></span>
								<strong>{template.label}</strong>
								<ObsidianButton
									icon="pencil"
									ariaLabel={`Edit ${template.label}`}
									onClick={() =>
										openEditTemplateForm(template)}
								/>
								<ObsidianButton
									icon="x"
									ariaLabel={`Remove ${template.label}`}
									onClick={() => {
										if (editingTemplateId === template.id) {
											closeTemplateForm();
										}
										onRemoveTemplate(template.id);
									}}
								/>
							</div>
						{/each}
					{/if}
				</div>
			{/if}
		</section>

			<section class:knowledge-workspace-dock-section-collapsed={!notesOpen}>
			<header>
				<ObsidianButton
					icon={notesOpen ? "chevron-down" : "chevron-right"}
					ariaLabel={notesOpen ? "Collapse notes" : "Expand notes"}
					onClick={() => (notesOpen = !notesOpen)}
				/>
				<h3>Selected notes</h3>
				<span>{notes.length}</span>
				<ObsidianButton
					icon="crosshair"
					active={focusOnSelect}
					ariaLabel={
						focusOnSelect
							? "Auto-focus on click (enabled)"
							: "Auto-focus on click (disabled)"
					}
					tooltip="Auto-focus on click"
					class="knowledge-workspace-dock-focus-toggle"
					onClick={onToggleFocusOnSelect}
				/>
			</header>
			{#if notesOpen}
				<div class="knowledge-workspace-dock-search">
					<ObsidianSuggestInput
						{app}
						type="search"
						placeholder="Add note..."
						ariaLabel="Add selected note"
						value={noteSearch}
						options={noteOptions}
						onInput={(value) => {
							noteSearch = value;
						}}
						onSelect={(option) => {
							onAddNote(option.value);
							noteSearch = "";
						}}
					/>
				</div>
				<div class="knowledge-workspace-dock-list">
					{#if notes.length === 0}
						<span class="knowledge-workspace-dock-empty"
							>No selected notes</span
						>
					{:else}
						{#each notes as entry (entry.path)}
							{@const payload = entry.broken
								? ({
										kind: "broken-note",
										notePath: entry.path,
										label: entry.title,
									} satisfies DockDragPayload)
								: ({
										kind: "note",
										notePath: entry.path,
										label: entry.title,
										direction: "from-dock-to-graph",
										relationField: activeConnectionField,
									} satisfies DockDragPayload)}
							<div
								class:dragging={activeDraggingKey ===
									dragKey(payload)}
								class:target={!entry.broken &&
									graphTargetNotePath === entry.path}
								class="knowledge-workspace-dock-node note"
								class:broken={entry.broken}
								data-dock-note-path={entry.path}
								role="button"
								tabindex="0"
								aria-label={entry.broken
									? `${entry.title} (file not found)`
									: entry.title}
								title={entry.broken
									? `File not found: ${entry.path}`
									: undefined}
								onpointerdown={(event) =>
									handleNodePointerDown(payload, event)}
								ondblclick={entry.broken
									? undefined
									: () => onOpenNote(entry.id)}
							>
								<span
									style={entry.broken
										? undefined
										: `background: ${entry.color ?? 'var(--color-green, #44a37f)'}`}
								></span>
								<div class="knowledge-workspace-dock-node-title">
									<strong>{entry.title}</strong>
									{#if (notesTitleCounts[entry.title] ?? 0) > 1}
										<span class="knowledge-workspace-dock-node-path">{entry.path}</span>
									{/if}
								</div>
								<ObsidianButton
									icon="x"
									ariaLabel={`Remove ${entry.title}`}
									onClick={() => onRemoveNote(entry.path)}
								/>
							</div>
						{/each}
					{/if}
				</div>
			{/if}
		</section>

		<span
			class:active={linking}
			class:target={Boolean(
				targetNodeId || graphTargetNotePath || graphTargetTemplateId,
			)}
			class="knowledge-workspace-dock-status"
		>
			{targetNodeId || graphTargetNotePath || graphTargetTemplateId
				? "Release to connect"
				: linking
					? "Choose target"
					: draggingKey
						? "Drag to reorder"
						: "Ready"}
		</span>
	{/if}
</aside>
