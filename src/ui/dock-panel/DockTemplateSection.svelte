<script lang="ts">
	import type { App } from 'obsidian';
	import {
		SHADOW_PLACEHOLDER_ITEM_ID,
		dragHandle,
		dragHandleZone,
		type DndEvent,
	} from 'svelte-dnd-action';
	import type { DockTemplateNode } from '../../core/types';
	import type { DockDragPayload } from '../dock/types';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '../obsidian/ObsidianDropdown.svelte';
	import ObsidianSuggestInput from '../obsidian/ObsidianSuggestInput.svelte';
	import ObsidianTextInput from '../obsidian/ObsidianTextInput.svelte';
	import type { DropdownOption } from '../obsidian/ObsidianDropdown.svelte';
	import type { SuggestionOption } from '../obsidian/ObsidianSuggestInput.svelte';
	import WorkspaceModal from '../WorkspaceModal.svelte';
	import {
		dragKey,
		templateDragPayload,
		type DockTemplateEntry,
	} from './dock-panel-state';

	let {
		app,
		templates,
		noteOptions,
		targetFolderOptions,
		groupOptions,
		activeDraggingKey,
		graphTargetTemplateId,
		onAddTemplate,
		onUpdateTemplate,
		onRemoveTemplate,
		onPointerDown,
		onLinkPointerDown,
		onCreateTemplateNote,
		onReorderTemplates,
		onOpenNote,
	}: {
		app: App;
		templates: DockTemplateEntry[];
		noteOptions: SuggestionOption[];
		targetFolderOptions: SuggestionOption[];
		groupOptions: DropdownOption[];
		activeDraggingKey?: string;
		graphTargetTemplateId?: string;
		onAddTemplate: (template: Omit<DockTemplateNode, 'id'>) => void;
		onUpdateTemplate: (
			templateId: string,
			template: Omit<DockTemplateNode, 'id'>,
		) => void;
		onRemoveTemplate: (templateId: string) => void;
		onPointerDown: (payload: DockDragPayload, event: PointerEvent) => void;
		onLinkPointerDown: (
			payload: DockDragPayload,
			event: PointerEvent,
		) => void;
		onCreateTemplateNote: (templateId: string, label: string) => void;
		onReorderTemplates: (templateIds: string[]) => void;
		onOpenNote: (nodeId: string) => void;
	} = $props();

	let templateFormOpen = $state(false);
	let templateLabel = $state('');
	let templatePath = $state('');
	let targetFolder = $state('');
	let templateDefaultGroupId = $state('');
	let editingTemplateId = $state<string | undefined>(undefined);
	let search = $state('');
	let searchOpen = $state(false);
	let selectedTemplateIds = $state<Set<string>>(new Set());
	let lastSelectedTemplateId = $state<string | undefined>(undefined);
	let dndTemplates = $state<DockTemplateEntry[]>([]);
	const searchActive = $derived(search.trim().length > 0);
	const visibleTemplates = $derived.by(() => {
		const query = search.trim().toLocaleLowerCase();
		return templates.filter(
			(template) =>
				!query ||
				`${template.label} ${template.templatePath} ${template.targetFolder}`
					.toLocaleLowerCase()
					.includes(query),
		);
	});

	$effect(() => {
		dndTemplates = visibleTemplates;
	});

	$effect(() => {
		const availableIds = new Set(templates.map((template) => template.id));
		const nextSelectedIds = new Set(
			[...selectedTemplateIds].filter((id) => availableIds.has(id)),
		);
		if (nextSelectedIds.size !== selectedTemplateIds.size) {
			selectedTemplateIds = nextSelectedIds;
		}
		if (
			lastSelectedTemplateId &&
			!availableIds.has(lastSelectedTemplateId)
		) {
			lastSelectedTemplateId = undefined;
		}
	});

	function saveTemplate(): void {
		const label = templateLabel.trim();
		const path = templatePath.trim();
		if (!label || !path) return;
		const template = {
			label,
			templatePath: path,
			targetFolder: targetFolder.trim(),
			defaultGroupId: templateDefaultGroupId || undefined,
		} satisfies Omit<DockTemplateNode, 'id'>;
		if (editingTemplateId) onUpdateTemplate(editingTemplateId, template);
		else onAddTemplate(template);
		closeTemplateForm();
	}

	function openAddTemplateForm(): void {
		editingTemplateId = undefined;
		templateLabel = '';
		templatePath = '';
		targetFolder = '';
		templateDefaultGroupId = '';
		templateFormOpen = true;
	}

	function openEditTemplateForm(template: DockTemplateNode): void {
		editingTemplateId = template.id;
		templateLabel = template.label;
		templatePath = template.templatePath;
		targetFolder = template.targetFolder;
		templateDefaultGroupId = template.defaultGroupId ?? '';
		templateFormOpen = true;
	}

	function closeTemplateForm(): void {
		templateFormOpen = false;
		editingTemplateId = undefined;
	}

	function handleDndConsider(
		event: CustomEvent<DndEvent<DockTemplateEntry>>,
	): void {
		dndTemplates = readRealItems(event.detail.items);
	}

	function handleDndFinalize(
		event: CustomEvent<DndEvent<DockTemplateEntry>>,
	): void {
		if (searchActive) return;
		dndTemplates = readRealItems(event.detail.items);
		onReorderTemplates(dndTemplates.map((template) => template.id));
	}

	function readRealItems(items: DockTemplateEntry[]): DockTemplateEntry[] {
		return items.filter((item) => item.id !== SHADOW_PLACEHOLDER_ITEM_ID);
	}

	function toggleSelected(templateId: string): void {
		const next = new Set(selectedTemplateIds);
		if (next.has(templateId)) next.delete(templateId);
		else next.add(templateId);
		selectedTemplateIds = next;
		lastSelectedTemplateId = templateId;
	}

	function selectTemplateRange(templateId: string): void {
		const ids = templates.map((template) => template.id);
		const currentIndex = ids.indexOf(templateId);
		const anchorIndex = lastSelectedTemplateId
			? ids.indexOf(lastSelectedTemplateId)
			: -1;
		if (currentIndex < 0 || anchorIndex < 0) {
			toggleSelected(templateId);
			return;
		}
		const [start, end] =
			currentIndex < anchorIndex
				? [currentIndex, anchorIndex]
				: [anchorIndex, currentIndex];
		const next = new Set(selectedTemplateIds);
		for (const selectedId of ids.slice(start, end + 1)) {
			next.add(selectedId);
		}
		selectedTemplateIds = next;
	}

	function handleTemplateClick(templateId: string, event: MouseEvent): void {
		if (
			event.target instanceof Element &&
			event.target.closest(
				'button, input, .knowledge-workspace-drag-handle',
			)
		) {
			return;
		}
		if (event.shiftKey) {
			event.preventDefault();
			selectTemplateRange(templateId);
			return;
		}
		if (event.ctrlKey || event.metaKey) {
			event.preventDefault();
			toggleSelected(templateId);
		}
	}

	function handleTemplateCheckboxClick(
		templateId: string,
		event: MouseEvent,
	): void {
		event.stopPropagation();
		if (event.shiftKey) selectTemplateRange(templateId);
		else toggleSelected(templateId);
	}

	function handleTemplateKeydown(
		templateId: string,
		event: KeyboardEvent,
	): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		if (event.shiftKey) selectTemplateRange(templateId);
		else toggleSelected(templateId);
	}

	function removeSelectedTemplates(): void {
		for (const templateId of selectedTemplateIds) {
			onRemoveTemplate(templateId);
		}
		selectedTemplateIds = new Set();
		lastSelectedTemplateId = undefined;
	}
</script>

<section class="knowledge-workspace-dock-tab-content">
	<div class="knowledge-workspace-dock-collection-header">
		<span>{templates.length} templates</span>
		<div class="knowledge-workspace-dock-collection-actions">
			<ObsidianButton
				class="knowledge-workspace-dock-search-toggle"
				icon="search"
				active={searchOpen}
				ariaLabel="Search templates"
				tooltip="Search"
				onClick={() => {
					searchOpen = !searchOpen;
					if (!searchOpen) search = '';
				}}
			/>
			<ObsidianButton
				icon="plus"
				text="Add template"
				ariaLabel="Add template"
				onClick={openAddTemplateForm}
			/>
		</div>
	</div>
	{#if searchOpen}
		<div class="knowledge-workspace-dock-collection-search">
			<ObsidianTextInput
				type="search"
				placeholder="Search templates..."
				ariaLabel="Search templates"
				value={search}
				onInput={(value) => (search = value)}
			/>
			{#if searchActive}
				<ObsidianButton
					icon="x"
					class="knowledge-workspace-dock-search-clear"
					ariaLabel="Clear template search"
					tooltip="Clear search"
					onClick={() => (search = '')}
				/>
			{/if}
		</div>
	{/if}
	{#if selectedTemplateIds.size > 0}
		<div class="knowledge-workspace-dock-selection-tools">
			<span>{selectedTemplateIds.size} selected</span>
			<ObsidianButton
				icon="trash-2"
				text="Remove"
				destructive={true}
				onClick={removeSelectedTemplates}
			/>
			<ObsidianButton
				icon="circle-off"
				ariaLabel="Clear selection"
				tooltip="Clear selection"
				onClick={() => {
					selectedTemplateIds = new Set();
					lastSelectedTemplateId = undefined;
				}}
			/>
		</div>
	{/if}
	{#if dndTemplates.length === 0}
		<div class="knowledge-workspace-dock-list">
			<span class="knowledge-workspace-dock-empty">
				{searchActive ? 'No matching templates' : 'No templates'}
			</span>
		</div>
	{:else}
		<div
			class="knowledge-workspace-dock-list"
			aria-label="Templates"
			use:dragHandleZone={{
				items: dndTemplates,
				flipDurationMs: 120,
				type: 'meta-graph-dock-templates',
				dragDisabled: searchActive,
			}}
			onconsider={handleDndConsider}
			onfinalize={handleDndFinalize}
		>
			{#each dndTemplates as template (template.id)}
				{@const payload = templateDragPayload(template)}
				<div
					class:dragging={activeDraggingKey === dragKey(payload)}
					class:target={!template.broken &&
						graphTargetTemplateId === template.id}
					class:selected={selectedTemplateIds.has(template.id)}
					class="knowledge-workspace-dock-node template"
					class:broken={template.broken}
					data-dock-template-id={template.id}
					data-dock-template-broken={template.broken ? '' : undefined}
					role="button"
					tabindex="0"
					aria-label={template.broken
						? `${template.label} (template note or target folder not found)`
						: template.label}
					title={template.broken
						? 'Template note or target folder not found'
						: undefined}
					onclick={(event) => handleTemplateClick(template.id, event)}
					onkeydown={(event) =>
						handleTemplateKeydown(template.id, event)}
					onpointerdown={(event) => {
						if (!template.broken) onPointerDown(payload, event);
					}}
				>
					<span
						class="knowledge-workspace-drag-handle"
						aria-label={`Reorder ${template.label}`}
						use:dragHandle
					></span>
					<input
						type="checkbox"
						aria-label={`Select ${template.label}`}
						checked={selectedTemplateIds.has(template.id)}
						onclick={(event) =>
							handleTemplateCheckboxClick(template.id, event)}
					/>
					<span></span>
					<strong>{template.label}</strong>
					<ObsidianButton
						class="knowledge-workspace-template-create"
						icon="file-plus-2"
						text="Create"
						ariaLabel={`Create note from ${template.label}`}
						disabled={template.broken}
						onClick={() =>
							onCreateTemplateNote(template.id, template.label)}
					/>
					<ObsidianButton
						icon="link"
						ariaLabel={`Connect ${template.label}`}
						tooltip="Connect"
						disabled={template.broken}
						onPointerDown={(event) =>
							onLinkPointerDown(payload, event)}
					/>
					<ObsidianButton
						icon="file-text"
						ariaLabel={`Open template note for ${template.label}`}
						tooltip="Open template"
						disabled={template.templateMissing}
						onClick={() => onOpenNote(template.templatePath)}
					/>
					<ObsidianButton
						icon="pencil"
						ariaLabel={`Edit ${template.label}`}
						tooltip="Edit"
						onClick={() => openEditTemplateForm(template)}
					/>
					<ObsidianButton
						class="knowledge-workspace-dock-remove"
						icon="x"
						ariaLabel={`Remove ${template.label}`}
						tooltip="Remove"
						onClick={() => onRemoveTemplate(template.id)}
					/>
				</div>
			{/each}
		</div>
	{/if}
</section>

<WorkspaceModal
	open={templateFormOpen}
	title={editingTemplateId ? 'Edit template' : 'Add template'}
	compact={true}
	onClose={closeTemplateForm}
>
	<form
		class="knowledge-workspace-template-modal-form"
		onsubmit={(event) => {
			event.preventDefault();
			saveTemplate();
		}}
	>
		<label>
			<span>Label</span>
			<ObsidianTextInput
				type="text"
				placeholder="Template label"
				value={templateLabel}
				onInput={(value) => (templateLabel = value)}
			/>
		</label>
		<label>
			<span>Template note</span>
			<ObsidianSuggestInput
				{app}
				type="text"
				placeholder="Template note..."
				value={templatePath}
				options={noteOptions}
				onInput={(value) => (templatePath = value)}
				onSelect={(option) => {
					templatePath = option.value;
					if (!templateLabel.trim()) templateLabel = option.label;
				}}
			/>
		</label>
		<label>
			<span>Target folder</span>
			<ObsidianSuggestInput
				{app}
				type="text"
				placeholder="Target folder..."
				value={targetFolder}
				options={targetFolderOptions}
				onInput={(value) => (targetFolder = value)}
				onSelect={(option) => (targetFolder = option.value)}
			/>
		</label>
		<label>
			<span>Default group</span>
			<ObsidianDropdown
				value={templateDefaultGroupId}
				options={groupOptions}
				onChange={(value) => (templateDefaultGroupId = value)}
			/>
		</label>
		<div class="knowledge-workspace-note-picker-actions">
			<ObsidianButton text="Cancel" onClick={closeTemplateForm} />
			<ObsidianButton
				icon="check"
				text="Save template"
				cta={true}
				disabled={!templateLabel.trim() || !templatePath.trim()}
				onClick={saveTemplate}
			/>
		</div>
	</form>
</WorkspaceModal>
