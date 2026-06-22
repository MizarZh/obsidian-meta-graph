<script lang="ts">
	import {
		AbstractInputSuggest,
		type App,
	} from "obsidian";
	import { onMount } from "svelte";
	import ObsidianTextInput from "./ObsidianTextInput.svelte";

	export interface SuggestionOption {
		value: string;
		label: string;
		detail?: string;
		searchText?: string;
	}

	let {
		app,
		value,
		options,
		type = "text",
		placeholder = "",
		ariaLabel,
		class: className = "",
		onInput,
		onSelect,
	}: {
		app: App;
		value: string;
		options: SuggestionOption[];
		type?: string;
		placeholder?: string;
		ariaLabel?: string;
		class?: string;
		onInput: (value: string) => void;
		onSelect: (option: SuggestionOption) => void;
	} = $props();

	let inputEl = $state<HTMLInputElement | undefined>(undefined);
	let suggest: MetaGraphInputSuggest | undefined;

	interface IndexedSuggestion {
		option: SuggestionOption;
		text: string;
		label: string;
	}

	const indexedOptions = $derived(
		options.map((option) => ({
			option,
			label: option.label.toLocaleLowerCase(),
			text: (
				option.searchText ??
				[option.label, option.detail].filter(Boolean).join(" ")
			).toLocaleLowerCase(),
		})),
	);

	class MetaGraphInputSuggest extends AbstractInputSuggest<IndexedSuggestion> {
		limit = 12;

		protected getSuggestions(query: string): IndexedSuggestion[] {
			const normalized = query.trim().toLocaleLowerCase();
			if (!normalized) {
				return [];
			}
			const results: IndexedSuggestion[] = [];
			const seen = new Set<string>();
			for (const item of indexedOptions) {
				if (
					item.label.startsWith(normalized) ||
					item.text.startsWith(normalized)
				) {
					results.push(item);
					seen.add(item.option.value);
					if (results.length >= this.limit) {
						return results;
					}
				}
			}
			for (const item of indexedOptions) {
				if (!seen.has(item.option.value) && item.text.includes(normalized)) {
					results.push(item);
					if (results.length >= this.limit) {
						return results;
					}
				}
			}
			return results;
		}

		renderSuggestion(value: IndexedSuggestion, el: HTMLElement): void {
			el.addClass("knowledge-workspace-suggest-item");
			el.createDiv({
				cls: "knowledge-workspace-suggest-title",
				text: value.option.label,
			});
		}

		selectSuggestion(value: IndexedSuggestion): void {
			onSelect(value.option);
			this.close();
		}
	}

	onMount(() => {
		return () => {
			suggest?.close();
			suggest = undefined;
		};
	});

	$effect(() => {
		if (!inputEl) {
			return;
		}
		if (!suggest) {
			suggest = new MetaGraphInputSuggest(app, inputEl);
		}
	});
</script>

<ObsidianTextInput
	{type}
	{placeholder}
	{ariaLabel}
	class={className}
	{value}
	onInput={onInput}
	onInputEl={(element) => {
		inputEl = element;
	}}
/>
