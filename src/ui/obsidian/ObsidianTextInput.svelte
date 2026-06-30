<script lang="ts">
	import { TextComponent } from 'obsidian';
	import { onMount } from 'svelte';

	let {
		value,
		type = 'text',
		placeholder = '',
		disabled = false,
		ariaLabel,
		list,
		min,
		max,
		step,
		class: className = '',
		onChange,
		onInput,
		onBlur,
		onFocus,
		onKeydown,
		onInputEl,
	}: {
		value: string | number;
		type?: string;
		placeholder?: string;
		disabled?: boolean;
		ariaLabel?: string;
		list?: string;
		min?: string;
		max?: string;
		step?: string;
		class?: string;
		onChange?: (value: string) => void;
		onInput?: (value: string) => void;
		onBlur?: (event: FocusEvent) => void;
		onFocus?: (event: FocusEvent) => void;
		onKeydown?: (event: KeyboardEvent) => void;
		onInputEl?: (element: HTMLInputElement) => void;
	} = $props();

	let containerEl: HTMLSpanElement;
	let textInput: TextComponent | undefined;

	onMount(() => {
		textInput = new TextComponent(containerEl);
		onInputEl?.(textInput.inputEl);
		textInput.onChange((nextValue) => {
			onInput?.(nextValue);
			onChange?.(nextValue);
		});
		textInput.inputEl.addEventListener('blur', handleBlur);
		textInput.inputEl.addEventListener('focus', handleFocus);
		textInput.inputEl.addEventListener('keydown', handleKeydown);

		return () => {
			textInput?.inputEl.removeEventListener('blur', handleBlur);
			textInput?.inputEl.removeEventListener('focus', handleFocus);
			textInput?.inputEl.removeEventListener('keydown', handleKeydown);
			containerEl.textContent = '';
			textInput = undefined;
		};
	});

	function handleBlur(event: FocusEvent): void {
		onBlur?.(event);
	}

	function handleFocus(event: FocusEvent): void {
		onFocus?.(event);
	}

	function handleKeydown(event: KeyboardEvent): void {
		onKeydown?.(event);
	}

	$effect(() => {
		if (!textInput) {
			return;
		}

		textInput.setValue(String(value));
		textInput.setPlaceholder(placeholder);
		textInput.setDisabled(disabled);
		textInput.inputEl.type = type;
		textInput.inputEl.className = className;
		if (ariaLabel) {
			textInput.inputEl.setAttribute('aria-label', ariaLabel);
		} else {
			textInput.inputEl.removeAttribute('aria-label');
		}
		if (list) {
			textInput.inputEl.setAttribute('list', list);
		} else {
			textInput.inputEl.removeAttribute('list');
		}
		if (min) {
			textInput.inputEl.setAttribute('min', min);
		} else {
			textInput.inputEl.removeAttribute('min');
		}
		if (max) {
			textInput.inputEl.setAttribute('max', max);
		} else {
			textInput.inputEl.removeAttribute('max');
		}
		if (step) {
			textInput.inputEl.setAttribute('step', step);
		} else {
			textInput.inputEl.removeAttribute('step');
		}
	});
</script>

<span class="knowledge-workspace-obsidian-control" bind:this={containerEl}
></span>
