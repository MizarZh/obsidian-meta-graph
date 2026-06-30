<script lang="ts">
	import type { App } from "obsidian";
	import type { DockTemplateNode } from "../../core/types";
	import type { DockDragPayload } from "../dock/types";
	import ObsidianButton from "../obsidian/ObsidianButton.svelte";
	import ObsidianDropdown from "../obsidian/ObsidianDropdown.svelte";
	import ObsidianSuggestInput from "../obsidian/ObsidianSuggestInput.svelte";
	import ObsidianTextInput from "../obsidian/ObsidianTextInput.svelte";
	import type { DropdownOption } from "../obsidian/ObsidianDropdown.svelte";
	import type { SuggestionOption } from "../obsidian/ObsidianSuggestInput.svelte";
	import {
		dragKey,
		templateDragPayload,
		type DockTemplateEntry,
	} from "./dock-panel-state";

	let {
		app,
		templates,
		noteOptions,
		targetFolderOptions,
		groupOptions,
		activeConnectionField,
		activeDraggingKey,
		graphTargetTemplateId,
		onAddTemplate,
		onUpdateTemplate,
		onRemoveTemplate,
		onPointerDown,
		onOpenNote,
	}: {
		app: App;
		templates: DockTemplateEntry[];
		noteOptions: SuggestionOption[];
		targetFolderOptions: SuggestionOption[];
		groupOptions: DropdownOption[];
		activeConnectionField: string;
		activeDraggingKey?: string;
		graphTargetTemplateId?: string;
		onAddTemplate: (template: Omit<DockTemplateNode, "id">) => void;
		onUpdateTemplate: (
			templateId: string,
			template: Omit<DockTemplateNode, "id">,
		) => void;
		onRemoveTemplate: (templateId: string) => void;
		onPointerDown: (payload: DockDragPayload, event: PointerEvent) => void;
		onOpenNote: (nodeId: string) => void;
	} = $props();

	let templatesOpen = $state(true);
	let templateFormOpen = $state(false);
	let templateLabel = $state("");
	let templatePath = $state("");
	let targetFolder = $state("");
	let templateDefaultGroupId = $state("");
	let editingTemplateId = $state<string | undefined>(undefined);

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
			defaultGroupId: templateDefaultGroupId || undefined,
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

	function openAddTemplateForm(): void {
		if (templateFormOpen && !editingTemplateId) {
			closeTemplateForm();
			return;
		}
		editingTemplateId = undefined;
		templateLabel = "";
		templatePath = "";
		targetFolder = "";
		templateDefaultGroupId = "";
		templateFormOpen = true;
	}

	function openEditTemplateForm(template: DockTemplateNode): void {
		editingTemplateId = template.id;
		templateLabel = template.label;
		templatePath = template.templatePath;
		targetFolder = template.targetFolder;
		templateDefaultGroupId = template.defaultGroupId ?? "";
		templateFormOpen = true;
	}

	function closeTemplateForm(): void {
		templateLabel = "";
		templatePath = "";
		targetFolder = "";
		templateDefaultGroupId = "";
		editingTemplateId = undefined;
		templateFormOpen = false;
	}
</script>

<section class:knowledge-workspace-dock-section-collapsed={!templatesOpen}>
	<header>
		<ObsidianButton
			icon={templatesOpen ? "chevron-down" : "chevron-right"}
			ariaLabel={templatesOpen ? "Collapse templates" : "Expand templates"}
			onClick={() => (templatesOpen = !templatesOpen)}
		/>
		<h3>Templates</h3>
		<ObsidianButton
			icon={templateFormOpen ? "x" : "plus"}
			ariaLabel={templateFormOpen ? "Close template form" : "Add template"}
			onClick={templateFormOpen ? closeTemplateForm : openAddTemplateForm}
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
							targetFolder = option.value;
						}}
					/>
				</label>
				<label class="knowledge-workspace-dock-field">
					<span>Default group</span>
					<ObsidianDropdown
						value={templateDefaultGroupId}
						options={groupOptions}
						onChange={(value) => {
							templateDefaultGroupId = value;
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
						class:target={!template.broken && graphTargetTemplateId === template.id}
						class="knowledge-workspace-dock-node template"
						class:broken={template.broken}
						data-dock-template-id={template.id}
						data-dock-template-broken={template.broken ? "" : undefined}
						role="button"
						tabindex="0"
						aria-label={template.broken
							? `${template.label} (template note or target folder not found)`
							: template.label}
						title={template.broken
							? `Template note or target folder not found`
							: undefined}
						onpointerdown={(event) => {
							if (template.broken && event.ctrlKey) {
								return;
							}
							onPointerDown(payload, event);
						}}
					>
						<span></span>
						<strong>{template.label}</strong>
						<ObsidianButton
							icon="file-text"
							ariaLabel={`Open template note for ${template.label}`}
							disabled={template.templateMissing}
							onClick={() => {
								if (!template.templateMissing) {
									onOpenNote(template.templatePath);
								}
							}}
						/>
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
	{/if}
</section>
