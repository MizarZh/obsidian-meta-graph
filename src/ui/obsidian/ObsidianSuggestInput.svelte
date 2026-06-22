<script lang="ts">
	import {
		AbstractInputSuggest,
		type App,
		prepareSimpleSearch,
		type SearchResult,
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

	interface MatchedSuggestion {
		option: SuggestionOption;
		match: SearchResult;
	}

	class MetaGraphInputSuggest extends AbstractInputSuggest<MatchedSuggestion> {
		limit = 12;

		protected getSuggestions(query: string): MatchedSuggestion[] {
			const normalized = query.trim();
			if (!normalized) {
				return [];
			}
			const search = prepareSimpleSearch(normalized);
			return options
				.map((option) => {
					const match = search(
						option.searchText ??
							[option.label, option.detail].filter(Boolean).join(" "),
					);
					return match ? { option, match } : undefined;
				})
				.filter((item): item is MatchedSuggestion => Boolean(item))
				.sort((left, right) => right.match.score - left.match.score)
				.slice(0, this.limit);
		}

		renderSuggestion(value: MatchedSuggestion, el: HTMLElement): void {
			el.addClass("knowledge-workspace-suggest-item");
			el.createDiv({
				cls: "knowledge-workspace-suggest-title",
				text: value.option.label,
			});
		}

		selectSuggestion(value: MatchedSuggestion): void {
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
