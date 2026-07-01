<script lang="ts">
	import type { App } from 'obsidian';
	import type { Snippet } from 'svelte';
	import type {
		NodeFilterField,
		NodeFilterOperator,
		NodeStyleField,
	} from '../../core/types';
	import ObsidianDropdown from '../obsidian/ObsidianDropdown.svelte';
	import ObsidianSuggestInput, {
		type SuggestionOption,
	} from '../obsidian/ObsidianSuggestInput.svelte';
	import ObsidianTextInput from '../obsidian/ObsidianTextInput.svelte';
	import ObsidianToggle from '../obsidian/ObsidianToggle.svelte';
	import PropertyPicker, {
		type PropertyPickerOption,
	} from '../PropertyPicker.svelte';

	type NodeConditionField = NodeFilterField | NodeStyleField;

	let {
		app,
		field,
		operator,
		value,
		fieldOptions,
		class: className = '',
		getOperatorOptions,
		getDefaultOperator,
		getFieldType,
		getValueOptions,
		onFieldChange,
		onOperatorChange,
		onValueChange,
		leading,
		actions,
	}: {
		app: App;
		field: NodeConditionField;
		operator?: NodeFilterOperator;
		value: string;
		fieldOptions: PropertyPickerOption[];
		class?: string;
		getOperatorOptions: (
			field: NodeConditionField,
		) => Array<{ value: NodeFilterOperator; label: string }>;
		getDefaultOperator: (field: NodeConditionField) => NodeFilterOperator;
		getFieldType: (field: NodeConditionField) => string;
		getValueOptions: (
			field: NodeConditionField,
			operator: NodeFilterOperator | undefined,
		) => SuggestionOption[];
		onFieldChange: (field: NodeConditionField) => void;
		onOperatorChange: (operator: NodeFilterOperator) => void;
		onValueChange: (value: string) => void;
		leading?: Snippet;
		actions?: Snippet;
	} = $props();

	const activeOperator = $derived(operator ?? getDefaultOperator(field));
	const showValue = $derived(shouldShowFilterValue(activeOperator));
	const fieldType = $derived(getFieldType(field));
	const valueOptions = $derived(getValueOptions(field, activeOperator));

	function shouldShowFilterValue(
		nextOperator: NodeFilterOperator | undefined,
	): boolean {
		return !['has-value', 'empty', 'is-empty', 'is-not-empty'].includes(
			nextOperator ?? '',
		);
	}
</script>

<div class={`knowledge-workspace-rule-row ${className}`.trim()}>
	{#if leading}
		{@render leading()}
	{/if}
	<PropertyPicker
		value={field}
		options={fieldOptions}
		onSelect={(nextField) => onFieldChange(nextField as NodeConditionField)}
	/>
	<ObsidianDropdown
		value={activeOperator}
		options={getOperatorOptions(field)}
		onChange={(nextOperator) =>
			onOperatorChange(nextOperator as NodeFilterOperator)}
	/>
	{#if showValue && fieldType === 'checkbox'}
		<ObsidianToggle
			value={(value || 'true') === 'true'}
			onChange={(nextValue) => onValueChange(String(nextValue))}
		/>
	{:else if showValue && fieldType === 'date'}
		<ObsidianTextInput
			type="date"
			placeholder="Value"
			{value}
			onInput={onValueChange}
		/>
	{:else if showValue && fieldType === 'datetime'}
		<ObsidianTextInput
			type="datetime-local"
			placeholder="Value"
			{value}
			onInput={onValueChange}
		/>
	{:else if showValue && valueOptions.length > 0}
		<ObsidianSuggestInput
			{app}
			type="text"
			placeholder="Value"
			{value}
			options={valueOptions}
			showOnEmpty={true}
			onInput={onValueChange}
			onSelect={(option) => onValueChange(option.value)}
		/>
	{:else}
		<ObsidianTextInput
			type="text"
			placeholder={showValue ? 'Value' : ''}
			disabled={!showValue}
			{value}
			onInput={onValueChange}
		/>
	{/if}
	{#if actions}
		{@render actions()}
	{/if}
</div>
