<script lang="ts">
	import { SliderComponent } from 'obsidian';
	import { onMount } from 'svelte';

	let {
		value,
		min,
		max,
		step,
		disabled = false,
		ariaLabel,
		instant = true,
		showValue = false,
		format,
		class: className = '',
		onChange,
		onCommit,
	}: {
		value: number;
		min: number | null;
		max: number | null;
		step: number | 'any';
		disabled?: boolean;
		ariaLabel?: string;
		instant?: boolean;
		showValue?: boolean;
		format?: (value: number) => string;
		class?: string;
		onChange: (value: number) => void;
		onCommit?: (value: number) => void;
	} = $props();

	let containerEl: HTMLSpanElement;
	let slider: SliderComponent | undefined;
	let syncing = false;

	onMount(() => {
		slider = new SliderComponent(containerEl);
		slider.onChange((nextValue) => {
			if (syncing || nextValue === value) {
				return;
			}
			onChange(nextValue);
		});
		slider.sliderEl.addEventListener('change', handleCommit);

		return () => {
			slider?.sliderEl.removeEventListener('change', handleCommit);
			containerEl.textContent = '';
			slider = undefined;
		};
	});

	function handleCommit(event: Event): void {
		onCommit?.(Number((event.currentTarget as HTMLInputElement).value));
	}

	function syncValueVisibility(): void {
		if (!slider) return;
		for (const child of Array.from(containerEl.children)) {
			if (child === slider.sliderEl || child.contains(slider.sliderEl)) {
				continue;
			}
			(child as HTMLElement).hidden = !showValue;
		}
	}

	$effect(() => {
		if (!slider) {
			return;
		}

		syncing = true;
		slider.setLimits(min, max, step);
		slider.setInstant(instant);
		if (Number(slider.sliderEl.value) !== value) {
			slider.setValue(value);
		}
		slider.setDisabled(disabled);
		if (ariaLabel) {
			slider.sliderEl.setAttribute('aria-label', ariaLabel);
		} else {
			slider.sliderEl.removeAttribute('aria-label');
		}
		if (format && 'setDisplayFormat' in slider) {
			slider.setDisplayFormat(format);
		}
		syncValueVisibility();
		syncing = false;
		if (className) {
			slider.sliderEl.classList.add(
				...className.split(/\s+/u).filter(Boolean),
			);
		}
	});
</script>

<span class="knowledge-workspace-obsidian-control" bind:this={containerEl}
></span>
