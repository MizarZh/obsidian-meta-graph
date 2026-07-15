<script lang="ts">
	import type { App } from 'obsidian';
	import type {
		FlowRelationPlacement,
		FlowRelationRule,
	} from '../../core/types';
	import { createRuleId } from '../filter/filter-tree';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianSuggestInput, {
		type SuggestionOption,
	} from '../obsidian/ObsidianSuggestInput.svelte';

	let {
		app,
		rules,
		fields,
		conflictCount,
		onChange,
	}: {
		app: App;
		rules: FlowRelationRule[];
		fields: string[];
		conflictCount: number;
		onChange: (rules: FlowRelationRule[]) => void;
	} = $props();

	const PLACEMENT_OPTIONS: Array<{
		value: FlowRelationPlacement;
		label: string;
	}> = [
		{ value: 'default', label: 'Default' },
		{ value: 'before', label: 'Before' },
		{ value: 'after', label: 'After' },
		{ value: 'parallel', label: 'Parallel' },
	];

	const knownFields = $derived.by(() =>
		[...new Set(fields)]
			.map((field) => field.trim())
			.filter(Boolean)
			.sort((left, right) => left.localeCompare(right)),
	);
	const canAddRule = $derived(
		knownFields.some(
			(field) =>
				!rules.some(
					(rule) =>
						normalizeField(rule.field) === normalizeField(field),
				),
		),
	);

	function addRule(): void {
		const usedFields = new Set(
			rules.map((rule) => normalizeField(rule.field)),
		);
		const field = knownFields.find(
			(candidate) => !usedFields.has(normalizeField(candidate)),
		);
		if (!field) {
			return;
		}
		onChange([
			...rules,
			{
				id: createRuleId(),
				field,
				placement: 'default',
			},
		]);
	}

	function updateRule(
		id: string,
		patch: Partial<Pick<FlowRelationRule, 'field' | 'placement'>>,
	): void {
		onChange(
			rules.map((rule) =>
				rule.id === id ? { ...rule, ...patch } : rule,
			),
		);
	}

	function removeRule(id: string): void {
		onChange(rules.filter((rule) => rule.id !== id));
	}

	function fieldOptions(rule: FlowRelationRule): SuggestionOption[] {
		const fieldsUsedElsewhere = new Set(
			rules
				.filter((candidate) => candidate.id !== rule.id)
				.map((candidate) => normalizeField(candidate.field)),
		);
		return knownFields
			.filter((field) => !fieldsUsedElsewhere.has(normalizeField(field)))
			.map((field) => ({ value: field, label: field }));
	}

	function normalizeField(field: string): string {
		return field.trim().toLocaleLowerCase();
	}
</script>

<div class="knowledge-workspace-flow-relations">
	<div class="knowledge-workspace-flow-relations-heading">
		<span>Relation placement</span>
		<ObsidianButton
			icon="plus"
			class="knowledge-workspace-flow-relation-action"
			disabled={!canAddRule}
			tooltip="Add relation placement"
			ariaLabel="Add relation placement"
			onClick={addRule}
		/>
	</div>
	<span class="knowledge-workspace-rule-hint">
		Linked note position relative to the current note.
	</span>
	{#if conflictCount > 0}
		<span class="knowledge-workspace-flow-relation-warning">
			{conflictCount} conflicting layout {conflictCount === 1
				? 'constraint was'
				: 'constraints were'} ignored.
		</span>
	{/if}
	{#each rules as rule (rule.id)}
		<div class="knowledge-workspace-flow-relation-row">
			<ObsidianSuggestInput
				{app}
				value={rule.field}
				options={fieldOptions(rule)}
				placeholder="Connection"
				ariaLabel="Connection field"
				showOnEmpty={true}
				allowCustom={false}
				onSelect={(option) =>
					updateRule(rule.id, { field: option.value })}
			/>
			<div class="knowledge-workspace-segmented flow-relation-options">
				{#each PLACEMENT_OPTIONS as option}
					<ObsidianButton
						active={rule.placement === option.value}
						text={option.label}
						tooltip={`${option.label}: linked note relative to current note`}
						onClick={() =>
							updateRule(rule.id, { placement: option.value })}
					/>
				{/each}
			</div>
			<ObsidianButton
				icon="trash-2"
				class="knowledge-workspace-flow-relation-action"
				tooltip="Delete relation placement"
				ariaLabel={`Delete ${rule.field} relation placement`}
				onClick={() => removeRule(rule.id)}
			/>
		</div>
	{/each}
</div>
