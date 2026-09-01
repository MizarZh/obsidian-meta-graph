<script lang="ts">
	import { ToggleComponent } from 'obsidian';
	import { onMount } from 'svelte';

	let {
		value,
		disabled = false,
		ariaLabel,
		tooltip,
		onChange,
	}: {
		value: boolean;
		disabled?: boolean;
		ariaLabel?: string;
		tooltip?: string;
		onChange: (value: boolean) => void;
	} = $props();

	let containerEl: HTMLSpanElement;
	let toggle: ToggleComponent | undefined;
	let syncing = false;

	onMount(() => {
		toggle = new ToggleComponent(containerEl);
		toggle.onChange((nextValue) => {
			if (syncing || nextValue === value) {
				return;
			}
			onChange(nextValue);
		});

		return () => {
			containerEl.textContent = '';
			toggle = undefined;
		};
	});

	$effect(() => {
		if (!toggle) {
			return;
		}

		syncing = true;
		toggle.setValue(value);
		toggle.setDisabled(disabled);
		if (ariaLabel) {
			toggle.toggleEl.setAttribute('aria-label', ariaLabel);
		} else {
			toggle.toggleEl.removeAttribute('aria-label');
		}
		syncing = false;
		if (tooltip) {
			toggle.setTooltip(tooltip);
		}
	});
</script>

<span class="knowledge-workspace-obsidian-control" bind:this={containerEl}
></span>
