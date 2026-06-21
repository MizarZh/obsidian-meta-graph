<script lang="ts">
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
	let relationField = $state('');
	let direction = $state<DockConnectionDirection>('from-graph-to-dock');

	const noteResults = $derived(filterNotes(availableNotes, noteSearch));

	function addTemplate(): void {
		const label = templateLabel.trim();
		if (!label) {
			return;
		}
		onAddTemplate({
			label,
			templatePath: templatePath.trim(),
			targetFolder: targetFolder.trim(),
			relationField: relationField.trim() || activeConnectionField,
			direction,
		});
		templateLabel = '';
		templatePath = '';
		targetFolder = '';
		relationField = '';
		direction = 'from-graph-to-dock';
		templateFormOpen = false;
	}

	function filterNotes(nodes: KnowledgeNode[], query: string): KnowledgeNode[] {
		const normalized = query.trim().toLocaleLowerCase();
		if (!normalized) {
			return [];
		}
		return nodes
			.filter(
				(node) =>
					node.title.toLocaleLowerCase().includes(normalized) ||
					node.path.toLocaleLowerCase().includes(normalized) ||
					(node.aliases ?? []).some((alias) =>
						alias.toLocaleLowerCase().includes(normalized),
					),
			)
			.slice(0, 6);
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
			<button type="button" onclick={() => (templateFormOpen = !templateFormOpen)}>
				{templateFormOpen ? 'Close' : 'Add'}
			</button>
		</header>
		{#if templateFormOpen}
			<form
				class="knowledge-workspace-dock-form"
				onsubmit={(event) => {
					event.preventDefault();
					addTemplate();
				}}
			>
				<input type="text" placeholder="Label" bind:value={templateLabel} />
				<input
					type="text"
					placeholder="Template note path"
					bind:value={templatePath}
				/>
				<input
					type="text"
					placeholder="Target folder"
					bind:value={targetFolder}
				/>
				<input
					type="text"
					placeholder={activeConnectionField}
					bind:value={relationField}
				/>
				<select bind:value={direction}>
					<option value="from-graph-to-dock">Graph to new note</option>
					<option value="from-dock-to-graph">New note to graph</option>
				</select>
				<button type="submit">Add template</button>
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
						<button
							type="button"
							aria-label={`Remove ${template.label}`}
							onclick={() => onRemoveTemplate(template.id)}
						>
							x
						</button>
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
			<input
				type="search"
				placeholder="Add note..."
				aria-label="Add selected note"
				bind:value={noteSearch}
			/>
			{#if noteResults.length > 0}
				<div class="knowledge-workspace-dock-results">
					{#each noteResults as node (node.id)}
						<button
							type="button"
							onclick={() => {
								onAddNote(node.path);
								noteSearch = '';
							}}
						>
							<span>{node.title}</span>
							<small>{node.path}</small>
						</button>
					{/each}
				</div>
			{/if}
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
						<button
							type="button"
							aria-label={`Remove ${node.title}`}
							onclick={() => onRemoveNote(node.path)}
						>
							x
						</button>
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
