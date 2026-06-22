<script lang="ts">
	import { SliderComponent } from "obsidian";
	import { onMount } from "svelte";

	let {
		value,
		min,
		max,
		step,
		disabled = false,
		instant = true,
		format,
		class: className = "",
		onChange,
		onCommit,
	}: {
		value: number;
		min: number | null;
		max: number | null;
		step: number | "any";
		disabled?: boolean;
		instant?: boolean;
		format?: (value: number) => string;
		class?: string;
		onChange: (value: number) => void;
		onCommit?: (value: number) => void;
	} = $props();

	let containerEl: HTMLSpanElement;
	let slider: SliderComponent | undefined;

	onMount(() => {
		slider = new SliderComponent(containerEl);
		slider.onChange((nextValue) => onChange(nextValue));
		slider.sliderEl.addEventListener("change", handleCommit);

		return () => {
			slider?.sliderEl.removeEventListener("change", handleCommit);
			containerEl.textContent = "";
			slider = undefined;
		};
	});

	function handleCommit(event: Event): void {
		onCommit?.(Number((event.currentTarget as HTMLInputElement).value));
	}

	$effect(() => {
		if (!slider) {
			return;
		}

		slider.setLimits(min, max, step);
		slider.setInstant(instant);
		slider.setValue(value);
		slider.setDisabled(disabled);
		if (className) {
			slider.sliderEl.classList.add(...className.split(/\s+/u).filter(Boolean));
		}
		const setDisplayFormat = (
			slider as unknown as {
				setDisplayFormat?: (formatter: (value: number) => string) => void;
			}
		).setDisplayFormat;
		if (format && typeof setDisplayFormat === "function") {
			setDisplayFormat.call(slider, format);
		}
	});
</script>

<span class="knowledge-workspace-obsidian-control" bind:this={containerEl}></span>
