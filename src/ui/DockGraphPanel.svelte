<script lang="ts">
	import type { App } from 'obsidian';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianSuggestInput from './obsidian/ObsidianSuggestInput.svelte';
	import ObsidianTextInput from './obsidian/ObsidianTextInput.svelte';
	import type {
		DockConnectionDirection,
		DockTemplateNode,
		KnowledgeNode,
	} from '../core/types';

	export type DockDragPayload =
		| {
				kind: 'template';
				templateId: string;
				label: string;
		  }
		| {
				kind: 'note';
				notePath: string;
				label: string;
				direction: DockConnectionDirection;
				relationField: string;
		  };

	let {
		app,
		templates,
		selectedNotes,
		availableNotes,
		activeConnectionField,
		draggingKey,
		targetNodeId,
		graphTargetNotePath,
		graphTargetTemplateId,
		onAddTemplate,
		onRemoveTemplate,
		onAddNote,
		onRemoveNote,
		onDragStart,
		onDragEnd,
		onOpenNote,
	}: {
		app: App;
		templates: DockTemplateNode[];
		selectedNotes: KnowledgeNode[];
		availableNotes: KnowledgeNode[];
		activeConnectionField: string;
		draggingKey?: string;
		targetNodeId?: string;
		graphTargetNotePath?: string;
		graphTargetTemplateId?: string;
		onAddTemplate: (template: Omit<DockTemplateNode, 'id'>) => void;
		onRemoveTemplate: (templateId: string) => void;
		onAddNote: (path: string) => void;
		onRemoveNote: (path: string) => void;
		onDragStart: (payload: DockDragPayload, event: DragEvent) => void;
		onDragEnd: (event: DragEvent) => void;
		onOpenNote: (nodeId: string) => void;
	} = $props();

	let templateFormOpen = $state(false);
	let noteSearch = $state('');
	let templateLabel = $state('');
	let templatePath = $state('');
	let targetFolder = $state('');

	const noteOptions = $derived(
		availableNotes.map((node) => ({
			value: node.path,
			label: node.title,
			detail: node.path,
			searchText: [node.title, node.path, ...(node.aliases ?? [])].join(' '),
		})),
	);
	const targetFolderOptions = $derived(
		[...new Set(availableNotes.map((node) => node.folder).filter(Boolean))]
			.sort((left, right) =>
				left.localeCompare(right, undefined, { sensitivity: 'base' }),
			)
			.map((folder) => ({
				value: folder,
				label: folder,
				searchText: folder,
			})),
	);

	function addTemplate(): void {
		const label = templateLabel.trim();
		const path = templatePath.trim();
		if (!label || !path) {
			return;
		}
		onAddTemplate({
			label,
			templatePath: path,
			targetFolder: targetFolder.trim(),
			relationField: activeConnectionField,
			direction: 'from-dock-to-graph',
		});
		templateLabel = '';
		templatePath = '';
		targetFolder = '';
		templateFormOpen = false;
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

	function pointStyle(index: number, total: number): string {
		const count = Math.max(total, 1);
		const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
		const radius = total <= 1 ? 0 : total <= 4 ? 30 : 38;
		const x = 50 + Math.cos(angle) * radius;
		const y = 50 + Math.sin(angle) * radius;
		return `left: ${x}%; top: ${y}%;`;
	}

	function templateDragPayload(template: DockTemplateNode): DockDragPayload {
		return {
			kind: 'template',
			templateId: template.id,
			label: template.label,
		};
	}

	function noteDragPayload(node: KnowledgeNode): DockDragPayload {
		return {
			kind: 'note',
			notePath: node.path,
			label: node.title,
			direction: 'from-dock-to-graph',
			relationField: activeConnectionField,
		};
	}

	function dragKey(payload: DockDragPayload): string {
		return payload.kind === 'template'
			? `template:${payload.templateId}`
			: `note:${payload.notePath}`;
	}
</script>

<aside class="knowledge-workspace-dock-panel">
	<section>
		<header>
			<h3>Templates</h3>
			<ObsidianButton
				icon={templateFormOpen ? 'x' : 'plus'}
				ariaLabel={templateFormOpen ? 'Close template form' : 'Add template'}
				onClick={() => (templateFormOpen = !templateFormOpen)}
			/>
		</header>
		{#if templateFormOpen}
			<form
				class="knowledge-workspace-dock-form"
				onsubmit={(event) => {
					event.preventDefault();
					addTemplate();
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
					icon="plus"
					text="Add template"
					onClick={addTemplate}
				/>
			</form>
		{/if}
		<div class="knowledge-workspace-dock-graph">
			{#if templates.length === 0}
				<span class="knowledge-workspace-dock-empty">No templates</span>
			{:else}
				{#each templates as template, index (template.id)}
					{@const payload = templateDragPayload(template)}
					<div
						class:dragging={draggingKey === dragKey(payload)}
						class:target={graphTargetTemplateId === template.id}
						class="knowledge-workspace-dock-node template"
						data-dock-template-id={template.id}
						style={pointStyle(index, templates.length)}
						draggable="true"
						role="button"
						tabindex="0"
						aria-label={template.label}
						ondragstart={(event) => onDragStart(payload, event)}
						ondragend={(event) => onDragEnd(event)}
					>
						<span></span>
						<strong>{template.label}</strong>
						<ObsidianButton
							icon="x"
							ariaLabel={`Remove ${template.label}`}
							onClick={() => onRemoveTemplate(template.id)}
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
					noteSearch = '';
				}}
			/>
		</div>
		<div class="knowledge-workspace-dock-graph">
			{#if selectedNotes.length === 0}
				<span class="knowledge-workspace-dock-empty">No selected notes</span>
			{:else}
				{#each selectedNotes as node, index (node.id)}
					{@const payload = noteDragPayload(node)}
					<div
						class:dragging={draggingKey === dragKey(payload)}
						class:target={graphTargetNotePath === node.path}
						class="knowledge-workspace-dock-node note"
						data-dock-note-path={node.path}
						style={pointStyle(index, selectedNotes.length)}
						draggable="true"
						role="button"
						tabindex="0"
						aria-label={node.title}
						ondragstart={(event) => onDragStart(payload, event)}
						ondragend={(event) => onDragEnd(event)}
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
		class:active={Boolean(draggingKey)}
		class:target={Boolean(targetNodeId || graphTargetNotePath || graphTargetTemplateId)}
		class="knowledge-workspace-dock-status"
	>
		{targetNodeId || graphTargetNotePath || graphTargetTemplateId ? 'Release to connect' : draggingKey ? 'Choose target' : 'Ready'}
	</span>
</aside>
