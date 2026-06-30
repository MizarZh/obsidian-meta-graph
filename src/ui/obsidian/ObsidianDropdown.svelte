<script lang="ts">
	import { DropdownComponent } from 'obsidian';
	import { onMount } from 'svelte';

	export interface DropdownOption {
		value: string;
		label: string;
	}

	let {
		value,
		options,
		disabled = false,
		ariaLabel,
		class: className = '',
		onChange,
	}: {
		value: string;
		options: DropdownOption[];
		disabled?: boolean;
		ariaLabel?: string;
		class?: string;
		onChange: (value: string) => void;
	} = $props();

	let containerEl: HTMLSpanElement;
	let dropdown: DropdownComponent | undefined;

	onMount(() => {
		dropdown = new DropdownComponent(containerEl);
		dropdown.onChange((nextValue) => onChange(nextValue));

		return () => {
			containerEl.textContent = '';
			dropdown = undefined;
		};
	});

	$effect(() => {
		if (!dropdown) {
			return;
		}

		dropdown.selectEl.replaceChildren();
		for (const option of options) {
			dropdown.addOption(option.value, option.label);
		}
		dropdown.setValue(value);
		dropdown.setDisabled(disabled);
		dropdown.selectEl.className = className;
		if (ariaLabel) {
			dropdown.selectEl.setAttribute('aria-label', ariaLabel);
		} else {
			dropdown.selectEl.removeAttribute('aria-label');
		}
	});
</script>

<span class="knowledge-workspace-obsidian-control" bind:this={containerEl}
></span>
