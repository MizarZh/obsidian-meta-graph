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
		  };
	type ReorderPlacement = "before" | "after";

	let {
		app,
		templates,
		selectedNotes,
		availableNotes,
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
	}: {
		app: App;
		templates: DockTemplateNode[];
		selectedNotes: KnowledgeNode[];
		availableNotes: KnowledgeNode[];
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
	} = $props();

	let templateFormOpen = $state(false);
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
	const targetFolderOptions = $derived(
		[...new Set(availableNotes.map((node) => node.folder).filter(Boolean))]
			.sort((left, right) =>
				left.localeCompare(right, undefined, { sensitivity: "base" }),
			)
			.map((folder) => ({
				value: folder,
				label: folder,
				searchText: folder,
			})),
	);

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

	function noteDragPayload(node: KnowledgeNode): DockDragPayload {
		return {
			kind: "note",
			notePath: node.path,
			label: node.title,
			direction: "from-dock-to-graph",
			relationField: activeConnectionField,
		};
	}

	function dragKey(payload: DockDragPayload): string {
		return payload.kind === "template"
			? `template:${payload.templateId}`
			: `note:${payload.notePath}`;
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
		if (event.ctrlKey) {
			handleLinkPointerDown(payload, event);
			return;
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
</script>

<aside class="knowledge-workspace-dock-panel">
	<section>
		<header>
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
							selectTemplateNote(option.value, option.label);
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
					text={editingTemplateId ? "Save template" : "Add template"}
					onClick={saveTemplate}
				/>
			</form>
		{/if}
		<div class="knowledge-workspace-dock-list">
			{#if templates.length === 0}
				<span class="knowledge-workspace-dock-empty">No templates</span>
			{:else}
				{#each templates as template (template.id)}
					{@const payload = templateDragPayload(template)}
					<div
						class:dragging={activeDraggingKey === dragKey(payload)}
						class:target={graphTargetTemplateId === template.id}
						class="knowledge-workspace-dock-node template"
						data-dock-template-id={template.id}
						role="button"
						tabindex="0"
						aria-label={template.label}
						onpointerdown={(event) =>
							handleNodePointerDown(payload, event)}
					>
						<span></span>
						<strong>{template.label}</strong>
						<ObsidianButton
							icon="pencil"
							ariaLabel={`Edit ${template.label}`}
							onClick={() => openEditTemplateForm(template)}
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
	</section>

	<section>
		<header>
			<h3>Selected notes</h3>
			<span>{selectedNotes.length}</span>
		</header>
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
			{#if selectedNotes.length === 0}
				<span class="knowledge-workspace-dock-empty"
					>No selected notes</span
				>
			{:else}
				{#each selectedNotes as node (node.id)}
					{@const payload = noteDragPayload(node)}
					<div
						class:dragging={activeDraggingKey === dragKey(payload)}
						class:target={graphTargetNotePath === node.path}
						class="knowledge-workspace-dock-node note"
						data-dock-note-path={node.path}
						role="button"
						tabindex="0"
						aria-label={node.title}
						onpointerdown={(event) =>
							handleNodePointerDown(payload, event)}
						ondblclick={() => onOpenNote(node.id)}
					>
						<span></span>
						<strong>{node.title}</strong>
						<ObsidianButton
							icon="x"
							ariaLabel={`Remove ${node.title}`}
							onClick={() => onRemoveNote(node.path)}
						/>
					</div>
				{/each}
			{/if}
		</div>
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
</aside>
