<script lang="ts">
	import { onMount } from 'svelte';
	import { ColorCommitScheduler } from '../filter/color-commit';

	let {
		value,
		commitKey,
		disabled = false,
		ariaLabel = 'Color',
		class: className = '',
		onChange,
	}: {
		value: string;
		commitKey: string;
		disabled?: boolean;
		ariaLabel?: string;
		class?: string;
		onChange: (color: string) => void;
	} = $props();

	let scheduler: ColorCommitScheduler | undefined;
	let previewColor = $state('');
	let editing = $state(false);

	onMount(() => {
		scheduler = new ColorCommitScheduler(window);
		return () => {
			if (editing && previewColor && previewColor !== value) {
				scheduler?.commit(commitKey, value, previewColor, onChange);
			}
			scheduler?.clearAll();
		};
	});

	$effect(() => {
		if (!editing) {
			previewColor = value;
		}
	});

	function handleInput(event: Event): void {
		const nextColor = readColor(event);
		editing = true;
		previewColor = nextColor;
		if (scheduler) {
			scheduler.schedule(commitKey, value, nextColor, onChange);
		} else {
			onChange(nextColor);
		}
	}

	function handleCommit(event: Event): void {
		const nextColor = readColor(event);
		previewColor = nextColor;
		if (scheduler) {
			scheduler.commit(commitKey, value, nextColor, onChange);
		} else {
			onChange(nextColor);
		}
		editing = false;
	}

	function handleBlur(event: FocusEvent): void {
		if (editing) {
			handleCommit(event);
		}
	}

	function readColor(event: Event): string {
		return (event.currentTarget as HTMLInputElement).value;
	}
</script>

<input
	type="color"
	class={`knowledge-workspace-color-control ${className}`.trim()}
	value={previewColor || value}
	{disabled}
	aria-label={ariaLabel}
	oninput={handleInput}
	onchange={handleCommit}
	onblur={handleBlur}
/>
