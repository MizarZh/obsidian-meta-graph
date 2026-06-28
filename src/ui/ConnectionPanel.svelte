<script lang="ts">
	import { setIcon, type App, type IconName } from 'obsidian';
	import type {
		ConnectionFieldMode,
		ConnectionFieldSpec,
	} from '../core/types';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from './obsidian/ObsidianDropdown.svelte';
	import ObsidianSuggestInput from './obsidian/ObsidianSuggestInput.svelte';

	type ReorderPlacement = 'before' | 'after';

	let {
		app,
		fields,
		metadataFieldSuggestions,
		activeFieldSpecId,
		activeField,
		dragging,
		dragTarget,
		undoCount,
		collapsed,
		onToggle,
		onSelectField,
		onFieldMode,
		onAddField,
		onRemoveField,
		onReorderField,
		onUndo,
	}: {
		app: App;
		fields: ConnectionFieldSpec[];
		metadataFieldSuggestions: string[];
		activeFieldSpecId: string;
		activeField: string;
		dragging: boolean;
		dragTarget?: string;
		undoCount: number;
		collapsed: boolean;
		onToggle: () => void;
		onSelectField: (field: string, mode?: ConnectionFieldMode) => void;
		onFieldMode: (field: string, mode: ConnectionFieldMode) => void;
		onAddField: (field: string) => void;
		onRemoveField: (field: string) => void;
		onReorderField: (
			id: string,
			targetId: string,
			placement: ReorderPlacement,
		) => void;
		onUndo: () => void;
	} = $props();
	let fieldInput = $state('');
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
	const metadataFieldOptions = $derived(
		metadataFieldSuggestions.map((field) => ({
			value: field,
			label: field,
			searchText: field,
		})),
	);
	const directionOptions = [
		{ value: 'directed', label: 'One-way' },
		{ value: 'bidirectional', label: 'Two-way' },
		{ value: 'reverse', label: 'Reverse' },
	];
	const activeMode = $derived(
		fields.find((field) => field.id === activeFieldSpecId)?.mode ?? 'directed',
	);

	function addField(): void {
		if (!customField) {
			return;
		}
		onAddField(customField);
		fieldInput = '';
	}

	function directionIcon(mode: ConnectionFieldMode): IconName {
		if (mode === 'bidirectional') {
			return 'arrow-left-right';
		}
		return mode === 'reverse' ? 'arrow-left' : 'arrow-right';
	}

	function directionLabel(mode: ConnectionFieldMode): string {
		if (mode === 'bidirectional') {
			return 'two-way';
		}
		return mode === 'reverse' ? 'reverse' : 'one-way';
	}

	function obsidianIcon(node: HTMLElement, icon: IconName) {
		setIcon(node, icon);
		return {
			update(nextIcon: IconName) {
				setIcon(node, nextIcon);
			},
		};
	}

	function handleFieldPointerDown(id: string, event: PointerEvent): void {
		if (
			event.button !== 0 ||
			(event.target instanceof HTMLElement &&
				event.target.closest('.knowledge-workspace-obsidian-control button'))
		) {
			return;
		}
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

	function reorderAtPoint(id: string, clientX: number, clientY: number): void {
		const target = document.elementFromPoint(clientX, clientY);
		if (!(target instanceof HTMLElement)) {
			return;
		}
		const targetEl = target.closest<HTMLElement>('[data-connection-field-id]');
		const targetId = targetEl?.dataset.connectionFieldId;
		if (!targetEl || !targetId || targetId === id) {
			return;
		}
		onReorderField(id, targetId, readPointerPlacement(targetEl, clientX));
	}

	function readPointerPlacement(
		targetEl: HTMLElement,
		clientX: number,
	): ReorderPlacement {
		const rect = targetEl.getBoundingClientRect();
		return clientX > rect.left + rect.width / 2 ? 'after' : 'before';
	}
</script>

{#if collapsed}
	<ObsidianButton
		class="knowledge-workspace-connection-toggle knowledge-workspace-connection-toggle-collapsed"
		icon="panel-bottom-open"
		ariaLabel="Show connection panel"
		onClick={onToggle}
	/>
{:else}
	<section class="knowledge-workspace-connection-panel">
		<ObsidianButton
			class="knowledge-workspace-connection-toggle"
			icon="panel-bottom-close"
			ariaLabel="Hide connection panel"
			onClick={onToggle}
		/>
		<div class="knowledge-workspace-connection-body">
			<div class="knowledge-workspace-connection-picker">
				<span class="knowledge-workspace-connection-label">Connection</span>
				<div class="knowledge-workspace-connection-tags" aria-label="Connection metadata fields">
					{#each fields as field}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span
								class:active={field.id === activeFieldSpecId}
								class:reordering={reorderDrag?.id === field.id &&
									reorderDrag.active}
								class="knowledge-workspace-connection-tag"
								data-connection-field-id={field.id}
								onpointerdown={(event) =>
									handleFieldPointerDown(field.id, event)}
							>
								<button
									type="button"
									aria-pressed={field.id === activeFieldSpecId}
									aria-label={`${field.field} ${directionLabel(field.mode)}`}
									onclick={() => onSelectField(field.field, field.mode)}
								>
									<span
										class="knowledge-workspace-connection-direction-icon"
										use:obsidianIcon={directionIcon(field.mode)}
										aria-hidden="true"
									></span>
									<span>{field.field}</span>
								</button>
								<ObsidianButton
									icon="x"
									ariaLabel={`Remove ${field.field}`}
									onClick={() => onRemoveField(field.id)}
								/>
							</span>
					{/each}
					{#if fields.length === 0}
						<span class="knowledge-workspace-connection-empty">No metadata</span>
					{/if}
				</div>
				</div>
				<label class="knowledge-workspace-connection-direction">
					<span class="knowledge-workspace-connection-label">Direction</span>
					<ObsidianDropdown
						value={activeMode}
						options={directionOptions}
						disabled={!activeField}
						ariaLabel="Connection direction"
						onChange={(value) =>
							onFieldMode(activeField, value as ConnectionFieldMode)}
					/>
				</label>
				<form
				class="knowledge-workspace-connection-custom"
				onsubmit={(event) => {
					event.preventDefault();
					addField();
				}}
			>
				<ObsidianSuggestInput
					{app}
					type="text"
					placeholder="Custom metadata"
					ariaLabel="Custom connection metadata"
					value={fieldInput}
					options={metadataFieldOptions}
					onInput={(value) => {
						fieldInput = value;
						const normalized = value.trim();
						if (normalized) {
							onSelectField(normalized);
						}
					}}
					onSelect={(option) => {
						fieldInput = option.value;
						onSelectField(option.value);
					}}
				/>
				<ObsidianButton
					icon="plus"
					ariaLabel="Pin metadata field"
					disabled={!customField}
					onClick={addField}
				/>
			</form>
			<span
				class:active={dragging}
				class:target={Boolean(dragTarget)}
				class="knowledge-workspace-connection-status"
			>
				{dragTarget ? 'Release to connect' : dragging ? 'Choose target' : 'Ctrl drag'}
			</span>
			<ObsidianButton
				class="knowledge-workspace-connection-undo"
				disabled={undoCount === 0}
				ariaLabel="Undo last connection"
				text={`Undo${undoCount > 0 ? ` (${undoCount})` : ''}`}
				onClick={onUndo}
			/>
		</div>
	</section>
{/if}
