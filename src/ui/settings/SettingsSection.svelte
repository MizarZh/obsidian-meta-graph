<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		open = $bindable(true),
		children,
		actions,
	}: {
		title: string;
		open?: boolean;
		children: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<section class="knowledge-workspace-settings-group">
	<header class="knowledge-workspace-settings-group-header">
		<div class="knowledge-workspace-settings-group-title">
			<button
				type="button"
				class="knowledge-workspace-settings-collapse-button"
				aria-expanded={open}
				aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
				onclick={() => (open = !open)}
			>
				<span
					class:collapsed={!open}
					class="knowledge-workspace-settings-collapse-icon"
					aria-hidden="true"
				></span>
			</button>
			<h4>{title}</h4>
		</div>
		{#if actions}
			<div class="knowledge-workspace-settings-group-actions">
				{@render actions()}
			</div>
		{/if}
	</header>
	{#if open}
		<div class="knowledge-workspace-settings-group-body">
			{@render children()}
		</div>
	{/if}
</section>
