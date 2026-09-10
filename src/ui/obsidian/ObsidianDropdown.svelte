<script lang="ts">
	import { DropdownComponent } from 'obsidian';
	import { onMount } from 'svelte';
	import { DropdownSync } from '@/ui/obsidian/dropdown-sync';

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
	const sync = new DropdownSync();

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

		sync.update(dropdown, {
			options,
			value,
			disabled,
			className,
			ariaLabel,
		});
	});
</script>

<span class="knowledge-workspace-obsidian-control" bind:this={containerEl}
></span>
