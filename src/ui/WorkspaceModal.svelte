<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onDestroy, onMount } from 'svelte';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';

	let {
		open,
		title,
		subtitle = '',
		ariaLabel = title,
		children,
		onClose,
	}: {
		open: boolean;
		title: string;
		subtitle?: string;
		ariaLabel?: string;
		children?: Snippet;
		onClose: () => void;
	} = $props();

	function handleKeyDown(event: KeyboardEvent): void {
		if (!open || event.key !== 'Escape') {
			return;
		}
		event.preventDefault();
		onClose();
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeyDown, { capture: true });
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeyDown, { capture: true });
	});
</script>

{#if open}
	<div
		class="knowledge-workspace-modal-backdrop"
		role="presentation"
		onclick={onClose}
	></div>
	<div
		class="knowledge-workspace-modal"
		role="dialog"
		aria-modal="true"
		aria-label={ariaLabel}
	>
		<header>
			<div>
				<h3>{title}</h3>
				{#if subtitle}
					<span>{subtitle}</span>
				{/if}
			</div>
			<ObsidianButton
				icon="x"
				ariaLabel={`Close ${title}`}
				onClick={onClose}
			/>
		</header>
		<div class="knowledge-workspace-modal-body">
			{#if children}
				{@render children()}
			{/if}
		</div>
	</div>
{/if}
