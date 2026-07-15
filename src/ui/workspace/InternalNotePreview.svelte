<script lang="ts">
	import { Component, MarkdownRenderer, TFile, type App } from 'obsidian';

	let {
		app,
		filePath,
	}: {
		app: App;
		filePath: string;
	} = $props();

	let contentEl: HTMLDivElement;
	let errorMessage = $state('');

	$effect(() => {
		const target = contentEl;
		const path = filePath;
		if (!target || !path) {
			return;
		}
		let disposed = false;
		const renderComponent = new Component();
		renderComponent.load();
		target.replaceChildren();
		errorMessage = '';

		void (async () => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				errorMessage = 'Note not found.';
				return;
			}
			try {
				const markdown = await app.vault.cachedRead(file);
				if (disposed) {
					return;
				}
				await MarkdownRenderer.render(
					app,
					markdown,
					target,
					file.path,
					renderComponent,
				);
			} catch (error) {
				if (!disposed) {
					errorMessage =
						error instanceof Error
							? error.message
							: 'Unable to render note.';
				}
			}
		})();

		return () => {
			disposed = true;
			renderComponent.unload();
			target.replaceChildren();
		};
	});
</script>

<section class="knowledge-workspace-internal-preview">
	{#if errorMessage}
		<div class="knowledge-workspace-internal-preview-error">
			{errorMessage}
		</div>
	{/if}
	<div
		class="knowledge-workspace-internal-preview-content markdown-preview-view markdown-rendered"
		bind:this={contentEl}
	></div>
</section>
