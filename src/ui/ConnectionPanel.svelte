<script lang="ts">
	import { Menu, setIcon, type App, type IconName } from 'obsidian';
	import type {
		ConnectionFieldMode,
		ConnectionFieldSpec,
	} from '../core/types';
	import type { ConnectionPanelLayout } from '../workspace/meta-graph-v2/types';
	import {
		getConnectionDirectionIcon,
		getConnectionDirectionLabel,
	} from './connection-direction';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianSuggestInput from './obsidian/ObsidianSuggestInput.svelte';

	type ReorderPlacement = 'before' | 'after';

	let {
		app,
		fields,
		metadataFieldSuggestions,
		activeFieldSpecId,
		collapsed,
		layout,
		onToggle,
		onLayoutChange,
		onHeightChange,
		onSelectField,
		onAddField,
		onUpdateField,
		onRemoveField,
		onReorderField,
	}: {
		app: App;
		fields: ConnectionFieldSpec[];
		metadataFieldSuggestions: string[];
		activeFieldSpecId: string;
		collapsed: boolean;
		layout: ConnectionPanelLayout;
		onToggle: () => void;
		onLayoutChange: (layout: ConnectionPanelLayout) => void;
		onHeightChange: (height: number) => void;
		onSelectField: (
			field: string,
			mode: ConnectionFieldMode,
			reverseField?: string,
		) => void;
		onAddField: (
			field: string,
			mode: ConnectionFieldMode,
			reverseField?: string,
		) => void;
		onUpdateField: (
			id: string,
			field: string,
			mode: ConnectionFieldMode,
			reverseField?: string,
		) => void;
		onRemoveField: (field: string) => void;
		onReorderField: (
			id: string,
			targetId: string,
			placement: ReorderPlacement,
		) => void;
	} = $props();

	let fieldInput = $state('');
	let reverseFieldInput = $state('');
	let draftMode = $state<ConnectionFieldMode>('directed');
	let addOpen = $state(false);
	let editingFieldId = $state<string | undefined>(undefined);
	let fieldInputEl = $state<HTMLInputElement | undefined>(undefined);
	let railEl = $state<HTMLDivElement | undefined>(undefined);
	let addWrapEl = $state<HTMLDivElement | undefined>(undefined);
	let editorLeft = $state(16);
	let editorBottom = $state(64);
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);
	let reorderDrag = $state<
		| {
				id: string;
				startX: number;
				startY: number;
				active: boolean;
		  }
		| undefined
	>();
	const customField = $derived(fieldInput.trim());
	const customReverseField = $derived(reverseFieldInput.trim());
	const canSaveField = $derived(
		Boolean(customField) &&
			(draftMode !== 'paired' ||
				(Boolean(customReverseField) &&
					customReverseField !== customField)) &&
			!fields.some(
				(field) =>
					field.id !== editingFieldId &&
					field.field === customField &&
					field.mode === draftMode &&
					field.reverseField ===
						(draftMode === 'paired'
							? customReverseField
							: undefined),
			),
	);
	const metadataFieldOptions = $derived(
		metadataFieldSuggestions.map((field) => ({
			value: field,
			label: field,
			searchText: field,
		})),
	);
	const directionOptions: Array<{
		value: ConnectionFieldMode;
		label: string;
	}> = [
		{ value: 'directed', label: 'One-way' },
		{ value: 'bidirectional', label: 'Two-way' },
		{ value: 'reverse', label: 'Reverse' },
		{ value: 'paired', label: 'Paired' },
	];

	$effect(() => {
		activeFieldSpecId;
		layout;
		fields;
		window.requestAnimationFrame(() => {
			updateScrollState();
			if (layout !== 'single' || !railEl) return;
			const active = Array.from(
				railEl.querySelectorAll<HTMLElement>(
					'[data-connection-field-id]',
				),
			).find(
				(element) =>
					element.dataset.connectionFieldId === activeFieldSpecId,
			);
			active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		});
	});

	function obsidianIcon(node: HTMLElement, icon: IconName) {
		setIcon(node, icon);
		return {
			update(nextIcon: IconName) {
				setIcon(node, nextIcon);
			},
		};
	}

	function portal(node: HTMLElement) {
		document.body.append(node);
		return {
			destroy() {
				node.remove();
			},
		};
	}

	function observePanel(node: HTMLElement) {
		const publishHeight = () => {
			onHeightChange(node.getBoundingClientRect().height);
			if (addOpen) updateEditorPosition();
		};
		const observer = new ResizeObserver(publishHeight);
		observer.observe(node);
		publishHeight();
		return { destroy: () => observer.disconnect() };
	}

	function observeRail(node: HTMLElement) {
		const observer = new ResizeObserver(updateScrollState);
		observer.observe(node);
		updateScrollState();
		return { destroy: () => observer.disconnect() };
	}

	function openAdd(): void {
		editingFieldId = undefined;
		fieldInput = '';
		reverseFieldInput = '';
		draftMode = 'directed';
		updateEditorPosition();
		addOpen = true;
		window.requestAnimationFrame(() => fieldInputEl?.focus());
	}

	function openEdit(field: ConnectionFieldSpec): void {
		editingFieldId = field.id;
		fieldInput = field.field;
		reverseFieldInput = field.reverseField ?? '';
		draftMode = field.mode;
		updateEditorPosition();
		addOpen = true;
		window.requestAnimationFrame(() => {
			fieldInputEl?.focus();
			fieldInputEl?.select();
		});
	}

	function closeEditor(): void {
		addOpen = false;
		editingFieldId = undefined;
		fieldInput = '';
		reverseFieldInput = '';
	}

	function updateEditorPosition(): void {
		if (!addWrapEl) return;
		const rect = addWrapEl.getBoundingClientRect();
		const width = Math.min(500, window.innerWidth - 64);
		editorLeft = Math.max(
			16,
			Math.min(rect.left, window.innerWidth - width - 16),
		);
		editorBottom = Math.max(16, window.innerHeight - rect.top + 12);
	}

	function saveField(): void {
		if (!canSaveField) return;
		if (editingFieldId) {
			onUpdateField(
				editingFieldId,
				customField,
				draftMode,
				customReverseField || undefined,
			);
		} else {
			onAddField(customField, draftMode, customReverseField || undefined);
		}
		closeEditor();
	}

	function selectField(field: ConnectionFieldSpec): void {
		onSelectField(field.field, field.mode, field.reverseField);
	}

	function swapPairedFields(): void {
		const nextField = reverseFieldInput;
		reverseFieldInput = fieldInput;
		fieldInput = nextField;
	}

	function showFieldMenu(
		event: MouseEvent,
		field: ConnectionFieldSpec,
		index: number,
	): void {
		event.preventDefault();
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle('Edit')
				.setIcon('pencil')
				.onClick(() => openEdit(field)),
		);
		menu.addItem((item) =>
			item
				.setTitle('Move to start')
				.setIcon('chevrons-left')
				.setDisabled(index === 0)
				.onClick(() => {
					const first = fields[0];
					if (first && first.id !== field.id) {
						onReorderField(field.id, first.id, 'before');
					}
				}),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('Remove')
				.setIcon('trash-2')
				.setWarning(true)
				.onClick(() => onRemoveField(field.id)),
		);
		menu.showAtMouseEvent(event);
	}

	function updateScrollState(): void {
		if (!railEl || layout !== 'single') {
			canScrollLeft = false;
			canScrollRight = false;
			return;
		}
		canScrollLeft = railEl.scrollLeft > 2;
		canScrollRight =
			railEl.scrollLeft + railEl.clientWidth < railEl.scrollWidth - 2;
	}

	function scrollRail(direction: -1 | 1): void {
		if (!railEl) return;
		railEl.scrollBy({
			left: direction * Math.max(180, railEl.clientWidth * 0.7),
			behavior: 'smooth',
		});
	}

	function handleRailWheel(event: WheelEvent): void {
		if (
			layout !== 'single' ||
			!railEl ||
			railEl.scrollWidth <= railEl.clientWidth
		) {
			return;
		}
		const delta =
			Math.abs(event.deltaX) > Math.abs(event.deltaY)
				? event.deltaX
				: event.deltaY;
		if (delta === 0) return;
		event.preventDefault();
		railEl.scrollLeft += delta;
	}

	function handleFieldPointerDown(id: string, event: PointerEvent): void {
		if (event.button !== 0) return;
		reorderDrag = {
			id,
			startX: event.clientX,
			startY: event.clientY,
			active: false,
		};
		window.addEventListener('pointermove', handleReorderPointerMove, {
			capture: true,
		});
		window.addEventListener('pointerup', handleReorderPointerUp, {
			capture: true,
			once: true,
		});
	}

	function handleReorderPointerMove(event: PointerEvent): void {
		if (!reorderDrag) return;
		const distance = Math.hypot(
			event.clientX - reorderDrag.startX,
			event.clientY - reorderDrag.startY,
		);
		if (!reorderDrag.active && distance < 4) return;
		event.preventDefault();
		reorderDrag = { ...reorderDrag, active: true };
		reorderAtPoint(reorderDrag.id, event.clientX, event.clientY);
	}

	function handleReorderPointerUp(): void {
		reorderDrag = undefined;
		window.removeEventListener('pointermove', handleReorderPointerMove, {
			capture: true,
		});
		window.removeEventListener('pointerup', handleReorderPointerUp, {
			capture: true,
		});
	}

	function reorderAtPoint(
		id: string,
		clientX: number,
		clientY: number,
	): void {
		const target = document.elementFromPoint(clientX, clientY);
		if (!(target instanceof HTMLElement)) return;
		const targetEl = target.closest<HTMLElement>(
			'[data-connection-field-id]',
		);
		const targetId = targetEl?.dataset.connectionFieldId;
		if (!targetEl || !targetId || targetId === id) return;
		onReorderField(id, targetId, readPointerPlacement(targetEl, clientX));
	}

	function readPointerPlacement(
		targetEl: HTMLElement,
		clientX: number,
	): ReorderPlacement {
		const rect = targetEl.getBoundingClientRect();
		return clientX > rect.left + rect.width / 2 ? 'after' : 'before';
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !addOpen) return;
		event.preventDefault();
		closeEditor();
	}
</script>

<svelte:window
	onkeydown={handleWindowKeydown}
	onresize={() => addOpen && updateEditorPosition()}
/>

{#if collapsed}
	<ObsidianButton
		class="knowledge-workspace-connection-toggle knowledge-workspace-connection-toggle-collapsed"
		icon="panel-bottom-open"
		ariaLabel="Show connection panel"
		onClick={onToggle}
	/>
{:else}
	<section
		class:wrap={layout === 'wrap'}
		class="knowledge-workspace-connection-panel"
		use:observePanel
	>
		<ObsidianButton
			class="knowledge-workspace-connection-toggle"
			icon="panel-bottom-close"
			ariaLabel="Hide connection panel"
			tooltip="Hide connections"
			onClick={onToggle}
		/>
		<div class="knowledge-workspace-connection-heading">
			<span>Connections</span>
			<span class="knowledge-workspace-connection-count"
				>{fields.length}</span
			>
		</div>
		<div
			class="knowledge-workspace-connection-layout knowledge-workspace-segmented"
			role="group"
			aria-label="Connection layout"
		>
			<ObsidianButton
				active={layout === 'single'}
				icon="rows-3"
				ariaLabel="Single row"
				tooltip="Single row"
				onClick={() => onLayoutChange('single')}
			/>
			<ObsidianButton
				active={layout === 'wrap'}
				icon="layout-grid"
				ariaLabel="Multiple rows"
				tooltip="Multiple rows"
				onClick={() => onLayoutChange('wrap')}
			/>
		</div>
		<div class="knowledge-workspace-connection-rail-shell">
			{#if layout === 'single'}
				<ObsidianButton
					class="knowledge-workspace-connection-scroll"
					icon="chevron-left"
					ariaLabel="Scroll connections left"
					tooltip="Scroll left"
					disabled={!canScrollLeft}
					onClick={() => scrollRail(-1)}
				/>
			{/if}
			<div
				class:wrap={layout === 'wrap'}
				class:can-scroll-left={canScrollLeft}
				class:can-scroll-right={canScrollRight}
				class="knowledge-workspace-connection-tags"
				aria-label="Connection metadata fields"
				bind:this={railEl}
				use:observeRail
				onscroll={updateScrollState}
				onwheel={handleRailWheel}
			>
				{#each fields as field, index (field.id)}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<span
						class:active={field.id === activeFieldSpecId}
						class:reordering={reorderDrag?.id === field.id &&
							reorderDrag.active}
						class="knowledge-workspace-connection-tag"
						data-connection-field-id={field.id}
						onpointerdown={(event) =>
							handleFieldPointerDown(field.id, event)}
						oncontextmenu={(event) =>
							showFieldMenu(event, field, index)}
					>
						<button
							type="button"
							aria-pressed={field.id === activeFieldSpecId}
							aria-label={`${field.field}${field.reverseField ? ` to ${field.reverseField}` : ''} ${getConnectionDirectionLabel(field.mode)}`}
							title={`${field.field}${field.reverseField ? ` / ${field.reverseField}` : ''} · ${getConnectionDirectionLabel(field.mode)}`}
							onclick={() => selectField(field)}
						>
							<span
								class="knowledge-workspace-connection-direction-icon"
								use:obsidianIcon={getConnectionDirectionIcon(
									field.mode,
								)}
								aria-hidden="true"
							></span>
							<span
								>{field.field}{field.reverseField
									? ` / ${field.reverseField}`
									: ''}</span
							>
						</button>
					</span>
				{/each}
				{#if fields.length === 0}
					<span class="knowledge-workspace-connection-empty"
						>No connections</span
					>
				{/if}
			</div>
			{#if layout === 'single'}
				<ObsidianButton
					class="knowledge-workspace-connection-scroll"
					icon="chevron-right"
					ariaLabel="Scroll connections right"
					tooltip="Scroll right"
					disabled={!canScrollRight}
					onClick={() => scrollRail(1)}
				/>
			{/if}
		</div>
		<div
			class="knowledge-workspace-connection-add-wrap"
			bind:this={addWrapEl}
		>
			<ObsidianButton
				class="knowledge-workspace-connection-add"
				active={addOpen}
				icon="plus"
				ariaLabel="Add connection"
				tooltip="Add connection"
				onClick={() => (addOpen ? closeEditor() : openAdd())}
			/>
			{#if addOpen}
				<div
					class="knowledge-workspace-connection-editor-layer"
					use:portal
				>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="knowledge-workspace-connection-editor-backdrop"
						onpointerdown={closeEditor}
						oncontextmenu={(event) => {
							event.preventDefault();
							closeEditor();
						}}
					></div>
					<form
						class="knowledge-workspace-connection-editor"
						style={`left: ${editorLeft}px; bottom: ${editorBottom}px;`}
						onsubmit={(event) => {
							event.preventDefault();
							saveField();
						}}
					>
						<header>
							{editingFieldId
								? 'Edit connection'
								: 'Add connection'}
						</header>
						<div
							class="knowledge-workspace-connection-editor-field"
						>
							<span>Connection type</span>
							<div
								class="knowledge-workspace-connection-mode-options"
								role="radiogroup"
								aria-label="Connection type"
							>
								{#each directionOptions as option}
									<button
										class:active={draftMode ===
											option.value}
										type="button"
										role="radio"
										aria-checked={draftMode ===
											option.value}
										onclick={() =>
											(draftMode = option.value)}
									>
										<span
											use:obsidianIcon={getConnectionDirectionIcon(
												option.value,
											)}
											aria-hidden="true"
										></span>
										<span>{option.label}</span>
									</button>
								{/each}
							</div>
						</div>
						<div class="knowledge-workspace-connection-properties">
							<label>
								<span
									>{draftMode === 'paired'
										? 'Source'
										: 'Property'}</span
								>
								<ObsidianSuggestInput
									{app}
									type="text"
									placeholder="Metadata field"
									ariaLabel="Connection metadata"
									value={fieldInput}
									options={metadataFieldOptions}
									onInput={(value) => (fieldInput = value)}
									onSelect={(option) =>
										(fieldInput = option.value)}
									onInputEl={(element) =>
										(fieldInputEl = element)}
								/>
							</label>
							{#if draftMode === 'paired'}
								<div
									class="knowledge-workspace-connection-property-row"
								>
									<span>Target</span>
									<div
										class="knowledge-workspace-connection-property-input"
									>
										<ObsidianSuggestInput
											{app}
											type="text"
											placeholder="Metadata field"
											ariaLabel="Target connection metadata"
											value={reverseFieldInput}
											options={metadataFieldOptions}
											onInput={(value) =>
												(reverseFieldInput = value)}
											onSelect={(option) =>
												(reverseFieldInput =
													option.value)}
										/>
										<ObsidianButton
											icon="arrow-up-down"
											ariaLabel="Swap source and target metadata"
											tooltip="Swap fields"
											disabled={!customField &&
												!customReverseField}
											onClick={swapPairedFields}
										/>
									</div>
								</div>
							{/if}
						</div>
						<footer>
							<ObsidianButton
								text="Cancel"
								onClick={closeEditor}
							/>
							<ObsidianButton
								cta={true}
								text={editingFieldId ? 'Save' : 'Add'}
								disabled={!canSaveField}
								onClick={saveField}
							/>
						</footer>
					</form>
				</div>
			{/if}
		</div>
	</section>
{/if}
