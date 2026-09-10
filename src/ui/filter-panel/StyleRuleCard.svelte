<script lang="ts">
	import type { Snippet } from 'svelte';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import { placeStyleEditorInWorkspace } from '@/ui/filter/style-editor-position';
	let {
		title,
		summary,
		color,
		open,
		onOpen,
		onClose,
		children,
		ruleId,
		dragScope,
		canMoveUp = false,
		canMoveDown = false,
		onMoveUp,
		onMoveDown,
		onDropRule,
	}: {
		title: string;
		summary: string;
		color: string;
		open: boolean;
		onOpen: () => void;
		onClose: () => void;
		children: Snippet;
		ruleId?: string;
		dragScope?: string;
		canMoveUp?: boolean;
		canMoveDown?: boolean;
		onMoveUp?: () => void;
		onMoveDown?: () => void;
		onDropRule?: (sourceId: string, after: boolean) => void;
	} = $props();
	let anchor: HTMLDivElement;
	let dropSide = $state<'before' | 'after' | undefined>();
	let suppressClickUntil = 0;

	function sortable(node: HTMLElement) {
		const mime = () => `application/x-meta-graph-style-${dragScope}`;
		function start(event: DragEvent) {
			if (
				!ruleId ||
				!dragScope ||
				!(event.target instanceof Element) ||
				!event.target.closest('.knowledge-workspace-style-drag-handle')
			)
				return;
			event.stopPropagation();
			event.dataTransfer?.setData(mime(), ruleId);
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setDragImage(node, 16, 16);
			}
			suppressClickUntil = Infinity;
		}
		function over(event: DragEvent) {
			if (!onDropRule || !event.dataTransfer?.types.includes(mime()))
				return;
			event.preventDefault();
			event.stopPropagation();
			event.dataTransfer.dropEffect = 'move';
			const rect = node.getBoundingClientRect();
			dropSide =
				event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
		}
		function drop(event: DragEvent) {
			if (!onDropRule || !event.dataTransfer?.types.includes(mime()))
				return;
			event.preventDefault();
			event.stopPropagation();
			const source = event.dataTransfer.getData(mime());
			const after = dropSide === 'after';
			dropSide = undefined;
			onDropRule(source, after);
		}
		function leave(event: DragEvent) {
			if (!node.contains(event.relatedTarget as Node | null))
				dropSide = undefined;
		}
		function end() {
			dropSide = undefined;
			suppressClickUntil = Date.now() + 200;
		}
		node.addEventListener('dragstart', start);
		node.addEventListener('dragover', over);
		node.addEventListener('drop', drop);
		node.addEventListener('dragleave', leave);
		node.addEventListener('dragend', end);
		return {
			destroy() {
				node.removeEventListener('dragstart', start);
				node.removeEventListener('dragover', over);
				node.removeEventListener('drop', drop);
				node.removeEventListener('dragleave', leave);
				node.removeEventListener('dragend', end);
			},
		};
	}

	function floating(node: HTMLElement, _title?: string) {
		const owner = anchor.ownerDocument;
		const win = owner.defaultView!;
		const workspace =
			anchor.closest<HTMLElement>('.knowledge-workspace') ?? owner.body;
		const panel =
			anchor.closest<HTMLElement>(
				'.knowledge-workspace-settings-popover',
			) ?? anchor;
		workspace.appendChild(node);
		let frame: number | undefined;
		function position() {
			frame = undefined;
			const bounds = anchor.getBoundingClientRect();
			const placement = placeStyleEditorInWorkspace(
				bounds,
				workspace.getBoundingClientRect(),
				workspace.clientWidth,
				workspace.clientHeight,
			);
			node.style.left = `${placement.left}px`;
			node.style.top = `${placement.top}px`;
			node.style.width = `${placement.width}px`;
			node.style.maxHeight = `${placement.height}px`;
		}
		function schedule() {
			frame ??= win.requestAnimationFrame(position);
		}
		position();
		node.focus({ preventScroll: true });
		const observer = new ResizeObserver(schedule);
		observer.observe(panel);
		observer.observe(anchor);
		observer.observe(workspace);
		win.addEventListener('resize', schedule);
		owner.addEventListener('scroll', schedule, true);
		return {
			update() {
				schedule();
			},
			destroy() {
				observer.disconnect();
				win.removeEventListener('resize', schedule);
				owner.removeEventListener('scroll', schedule, true);
				if (frame !== undefined) win.cancelAnimationFrame(frame);
				node.remove();
			},
		};
	}
	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || event.defaultPrevented) return;
		// Native color/select popups own their first Escape.
		if (
			event.target instanceof Element &&
			event.target.closest(
				'select, input[type="color"], [role="listbox"]',
			)
		) {
			event.stopPropagation();
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		onClose();
		anchor.querySelector<HTMLButtonElement>('button')?.focus();
	}
</script>

<div
	use:sortable
	class="knowledge-workspace-style-rule-card"
	class:active={open}
	class:drop-before={dropSide === 'before'}
	class:drop-after={dropSide === 'after'}
	bind:this={anchor}
>
	{#if onMoveUp && onMoveDown}
		<div class="knowledge-workspace-style-card-order">
			<span
				class="knowledge-workspace-style-drag-handle"
				draggable="true"
				title="Drag to reorder rule"
				aria-label="Drag to reorder rule">⠿</span
			>
			<ObsidianButton
				icon="chevron-up"
				ariaLabel={`Move ${title} up`}
				tooltip="Move up"
				disabled={!canMoveUp}
				onClick={onMoveUp}
			/>
			<ObsidianButton
				icon="chevron-down"
				ariaLabel={`Move ${title} down`}
				tooltip="Move down"
				disabled={!canMoveDown}
				onClick={onMoveDown}
			/>
		</div>
	{/if}
	<span
		class="knowledge-workspace-style-rule-swatch"
		style:background={color}
		aria-hidden="true"
	></span>
	<div class="knowledge-workspace-style-rule-summary">
		<strong>{title}</strong>
		<span title={summary}>{summary}</span>
	</div>
	<ObsidianButton
		class="knowledge-workspace-style-card-trigger"
		text={title}
		active={open}
		ariaLabel={`Edit ${title}: ${summary}`}
		onClick={() => {
			if (Date.now() >= suppressClickUntil) onOpen();
		}}
	/>
</div>
{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		use:floating={title}
		class="knowledge-workspace-style-editor"
		role="dialog"
		tabindex="-1"
		aria-modal="false"
		aria-label={`Edit ${title}`}
		onkeydown={keydown}
	>
		<div class="knowledge-workspace-style-editor-header">
			<div><strong>{title}</strong><small>Changes apply live</small></div>
			<ObsidianButton
				icon="x"
				ariaLabel="Close style editor"
				tooltip="Close style editor"
				onClick={onClose}
			/>
		</div>
		<div
			class="knowledge-workspace-style-editor-content knowledge-workspace-filters"
		>
			{@render children()}
		</div>
	</div>
{/if}
