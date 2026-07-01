<script lang="ts">
	import type { App } from 'obsidian';
	import CollapsibleSettingsGroup from './CollapsibleSettingsGroup.svelte';
	import NodeConditionRow from '../filter/NodeConditionRow.svelte';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianSlider from '../obsidian/ObsidianSlider.svelte';
	import {
		getDefaultNodeStyleOperator,
		getNodeStyleFieldOptions,
		getNodeStyleFieldType,
		getNodeStyleOperatorOptions,
		getNodeValueOptions as resolveNodeValueOptions,
		type SuggestionOption,
	} from '../filter-config';
	import type {
		ChartGroup,
		DefaultNodeStyle,
		NodeFilterField,
		NodeFilterOperator,
		NodeStyleField,
		NodeStyleRule,
	} from '../../core/types';
	import { createRuleId } from '../filter/filter-tree';
	import {
		activeNodeStyleValue as resolveActiveNodeStyleValue,
		canMoveRule,
		createNodeStyleRule,
		hasStyleOverride,
		moveRule,
		patchRule,
		removeRule,
		type StyleRuleScope,
	} from '../filter/filter-style-rules';

	const NODE_STYLE_FIELD_OPTIONS = getNodeStyleFieldOptions();
	const NODE_STYLE_SECTIONS = [
		{ scope: 'global', title: 'Global note rules' },
		{ scope: 'current', title: 'Chart note rules' },
	] as const;
	type NodeConditionField = NodeFilterField | NodeStyleField;

	let {
		app,
		folders,
		tags,
		metadataFieldSuggestions,
		metadataFieldTypes,
		metadataFieldValueSuggestions,
		filePathSuggestions,
		groups,
		defaultNodeStyle,
		globalNodeStyleRules,
		nodeStyleOverrides,
		nodeStyleRules,
		onDefaultNodeStyle,
		onGlobalNodeStyleRulesChange,
		onNodeStyleOverrides,
		onNodeStyleRulesChange,
		scheduleColorCommit,
		commitColor,
	}: {
		app: App;
		folders: string[];
		tags: string[];
		metadataFieldSuggestions: string[];
		metadataFieldTypes: Record<string, string>;
		metadataFieldValueSuggestions: Record<string, string[]>;
		filePathSuggestions: string[];
		groups: ChartGroup[];
		defaultNodeStyle: Required<DefaultNodeStyle>;
		globalNodeStyleRules: NodeStyleRule[];
		nodeStyleOverrides: DefaultNodeStyle;
		nodeStyleRules: NodeStyleRule[];
		onDefaultNodeStyle: (style: Required<DefaultNodeStyle>) => void;
		onGlobalNodeStyleRulesChange: (rules: NodeStyleRule[]) => void;
		onNodeStyleOverrides: (style: DefaultNodeStyle) => void;
		onNodeStyleRulesChange: (rules: NodeStyleRule[]) => void;
		scheduleColorCommit: (
			key: string,
			currentColor: string,
			nextColor: string,
			commit: (color: string) => void,
		) => void;
		commitColor: (
			key: string,
			currentColor: string,
			nextColor: string,
			commit: (color: string) => void,
		) => void;
	} = $props();

	let workspaceDefaultOpen = $state(true);
	let chartOverridesOpen = $state(true);
	let ruleSectionsOpen = $state<Record<StyleRuleScope, boolean>>({
		global: true,
		current: true,
	});
	let previousHadNodeOverride = $state<boolean | undefined>(undefined);

	$effect(() => {
		const hasOverride = hasStyleOverride(nodeStyleOverrides);
		if (previousHadNodeOverride === undefined) {
			workspaceDefaultOpen = !hasOverride;
		} else if (hasOverride && !previousHadNodeOverride) {
			workspaceDefaultOpen = false;
		} else if (!hasOverride && previousHadNodeOverride) {
			workspaceDefaultOpen = true;
		}
		previousHadNodeOverride = hasOverride;
	});

	$effect(() => {
		const firstGroupId = groups[0]?.id;
		if (!firstGroupId) {
			return;
		}
		autofillEmptyGroupRuleValues(
			'global',
			globalNodeStyleRules,
			firstGroupId,
		);
		autofillEmptyGroupRuleValues('current', nodeStyleRules, firstGroupId);
	});

	function addNodeRule(scope: 'global' | 'current'): void {
		updateNodeRules(scope, [
			...getNodeRules(scope),
			createNodeStyleRule(createRuleId()),
		]);
	}

	function updateNodeRule(
		scope: 'global' | 'current',
		id: string,
		patch: Partial<NodeStyleRule>,
	): void {
		updateNodeRules(scope, patchRule(getNodeRules(scope), id, patch));
	}

	function updateNodeRuleField(
		scope: 'global' | 'current',
		id: string,
		field: NodeStyleField,
	): void {
		const patch: Partial<NodeStyleRule> = {
			field,
			operator: getDefaultNodeStyleOperator(field, metadataFieldTypes),
			value: '',
		};
		if (field === 'group') {
			patch.value = groups[0]?.id ?? '';
		}
		updateNodeRule(scope, id, patch);
	}

	function updateNodeRules(
		scope: 'global' | 'current',
		rules: NodeStyleRule[],
	): void {
		if (scope === 'global') {
			onGlobalNodeStyleRulesChange(rules);
		} else {
			onNodeStyleRulesChange(rules);
		}
	}

	function autofillEmptyGroupRuleValues(
		scope: 'global' | 'current',
		rules: NodeStyleRule[],
		groupId: string,
	): void {
		const nextRules = rules.map((rule) =>
			rule.field === 'group' && !rule.value.trim()
				? { ...rule, value: groupId }
				: rule,
		);
		if (
			nextRules !== rules &&
			nextRules.some((rule, index) => rule !== rules[index])
		) {
			updateNodeRules(scope, nextRules);
		}
	}

	function getNodeRules(scope: 'global' | 'current'): NodeStyleRule[] {
		return scope === 'global' ? globalNodeStyleRules : nodeStyleRules;
	}

	function moveNodeRule(
		scope: StyleRuleScope,
		id: string,
		direction: -1 | 1,
	): void {
		updateNodeRules(scope, moveRule(getNodeRules(scope), id, direction));
	}

	function updateDefaultNodeStyle(patch: Partial<DefaultNodeStyle>): void {
		onDefaultNodeStyle({ ...defaultNodeStyle, ...patch });
	}

	function updateNodeOverride(patch: DefaultNodeStyle): void {
		onNodeStyleOverrides({ ...nodeStyleOverrides, ...patch });
	}

	function addNodeOverride(): void {
		workspaceDefaultOpen = false;
		chartOverridesOpen = true;
		onNodeStyleOverrides({ ...defaultNodeStyle });
	}

	function clearNodeOverride(): void {
		workspaceDefaultOpen = true;
		onNodeStyleOverrides({});
	}

	function activeNodeStyleValue(
		field: keyof DefaultNodeStyle,
	): string | number {
		return resolveActiveNodeStyleValue(
			nodeStyleOverrides,
			defaultNodeStyle,
			field,
		);
	}

	function activeNodeColor(): string {
		return String(activeNodeStyleValue('color'));
	}

	function activeNodeSize(): number {
		return Number(activeNodeStyleValue('size'));
	}

	function hasNodeOverride(): boolean {
		return hasStyleOverride(nodeStyleOverrides);
	}

	function removeNodeRule(scope: 'global' | 'current', id: string): void {
		updateNodeRules(scope, removeRule(getNodeRules(scope), id));
	}

	function getNodeValueOptions(
		field: NodeFilterField | NodeStyleField,
		operator?: NodeFilterOperator,
	): SuggestionOption[] {
		return resolveNodeValueOptions(field, operator, {
			folders,
			tags,
			metadataFieldSuggestions,
			metadataFieldTypes,
			metadataFieldValueSuggestions,
			filePathSuggestions,
		});
	}

	function getGroupRuleOptions(value: string): Array<{
		value: string;
		label: string;
		detail?: string;
		searchText?: string;
	}> {
		const options = groups.map((group) => ({
			value: group.id,
			label: group.name || group.id,
			detail:
				group.name && group.name !== group.id ? group.id : undefined,
			searchText: `${group.name} ${group.id}`,
		}));
		if (value && !options.some((option) => option.value === value)) {
			return [
				{ value, label: `${value} (missing)`, searchText: value },
				...options,
			];
		}
		return options.length > 0
			? options
			: [{ value: '', label: 'No groups' }];
	}

	function getNodeStyleOperatorOptionsForField(
		field: NodeConditionField,
	): Array<{ value: NodeFilterOperator; label: string }> {
		return getNodeStyleOperatorOptions(
			field as NodeStyleField,
			metadataFieldTypes,
		);
	}

	function getDefaultNodeStyleOperatorForField(
		field: NodeConditionField,
	): NodeFilterOperator {
		return getDefaultNodeStyleOperator(
			field as NodeStyleField,
			metadataFieldTypes,
		);
	}

	function getNodeStyleFieldTypeForField(field: NodeConditionField): string {
		return getNodeStyleFieldType(
			field as NodeStyleField,
			metadataFieldTypes,
		);
	}

	function getNodeStyleValueOptions(
		field: NodeConditionField,
		operator: NodeFilterOperator | undefined,
	): SuggestionOption[] {
		if (field === 'group') {
			return getGroupRuleOptions('');
		}
		return getNodeValueOptions(
			field as NodeFilterField | NodeStyleField,
			operator,
		);
	}
</script>

<section>
	<header><h3>Note styles</h3></header>
</section>
<CollapsibleSettingsGroup
	title="Workspace default"
	bind:open={workspaceDefaultOpen}
>
	<div class="knowledge-workspace-rule">
		<div class="knowledge-workspace-rule-row compact">
			<label>
				<span>Color</span>
				<input
					type="color"
					value={defaultNodeStyle.color}
					oninput={(event) =>
						scheduleColorCommit(
							'node:workspace-default',
							defaultNodeStyle.color,
							event.currentTarget.value,
							(color) => updateDefaultNodeStyle({ color }),
						)}
					onchange={(event) =>
						commitColor(
							'node:workspace-default',
							defaultNodeStyle.color,
							event.currentTarget.value,
							(color) => updateDefaultNodeStyle({ color }),
						)}
				/>
			</label>
			<label>
				<span>Size</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						min={1}
						max={30}
						step={0.5}
						value={defaultNodeStyle.size}
						onChange={(size) => updateDefaultNodeStyle({ size })}
					/>
					<span>{defaultNodeStyle.size.toFixed(1)}</span>
				</div>
			</label>
		</div>
	</div>
</CollapsibleSettingsGroup>
<CollapsibleSettingsGroup
	title="Chart overrides"
	bind:open={chartOverridesOpen}
>
	{#snippet actions()}
		{#if !hasNodeOverride()}
			<ObsidianButton
				class="knowledge-workspace-add-rule-button"
				ariaLabel="Add chart note override"
				icon="plus"
				onClick={addNodeOverride}
			/>
		{/if}
	{/snippet}
	{#if hasNodeOverride()}
		<div class="knowledge-workspace-rule">
			<div class="knowledge-workspace-rule-row override-heading">
				<strong>This chart</strong>
				<ObsidianButton
					class="knowledge-workspace-remove-rule-button"
					ariaLabel="Remove chart note override"
					icon="trash-2"
					onClick={clearNodeOverride}
				/>
			</div>
			<div class="knowledge-workspace-rule-row compact">
				<label>
					<span>Color</span>
					<input
						type="color"
						value={activeNodeColor()}
						oninput={(event) =>
							scheduleColorCommit(
								'node:chart-override',
								activeNodeColor(),
								event.currentTarget.value,
								(color) => updateNodeOverride({ color }),
							)}
						onchange={(event) =>
							commitColor(
								'node:chart-override',
								activeNodeColor(),
								event.currentTarget.value,
								(color) => updateNodeOverride({ color }),
							)}
					/>
				</label>
				<label>
					<span>Size</span>
					<div class="knowledge-workspace-slider-value">
						<ObsidianSlider
							min={1}
							max={30}
							step={0.5}
							value={activeNodeSize()}
							onChange={(size) => updateNodeOverride({ size })}
						/>
						<span>{activeNodeSize().toFixed(1)}</span>
					</div>
				</label>
			</div>
		</div>
	{/if}
</CollapsibleSettingsGroup>
{#each NODE_STYLE_SECTIONS as section}
	<CollapsibleSettingsGroup
		title={section.title}
		bind:open={ruleSectionsOpen[section.scope]}
	>
		{#snippet actions()}
			<ObsidianButton
				class="knowledge-workspace-add-rule-button"
				ariaLabel="Add note style rule"
				icon="plus"
				onClick={() => addNodeRule(section.scope)}
			/>
		{/snippet}
		{#each getNodeRules(section.scope) as rule (rule.id)}
			<div class="knowledge-workspace-rule">
				<NodeConditionRow
					{app}
					class="style-condition"
					field={rule.field}
					operator={rule.operator}
					value={rule.value}
					fieldOptions={NODE_STYLE_FIELD_OPTIONS}
					getOperatorOptions={getNodeStyleOperatorOptionsForField}
					getDefaultOperator={getDefaultNodeStyleOperatorForField}
					getFieldType={getNodeStyleFieldTypeForField}
					getValueOptions={getNodeStyleValueOptions}
					onFieldChange={(value) =>
						updateNodeRuleField(
							section.scope,
							rule.id,
							value as NodeStyleField,
						)}
					onOperatorChange={(value) =>
						updateNodeRule(section.scope, rule.id, {
							operator: value,
						})}
					onValueChange={(value) =>
						updateNodeRule(section.scope, rule.id, {
							value,
						})}
				>
					{#snippet leading()}
						<div class="knowledge-workspace-move-rule-buttons">
							<ObsidianButton
								icon="chevron-up"
								ariaLabel="Move note style rule up"
								disabled={!canMoveRule(
									getNodeRules(section.scope),
									rule.id,
									-1,
								)}
								onClick={() =>
									moveNodeRule(section.scope, rule.id, -1)}
							/>
							<ObsidianButton
								icon="chevron-down"
								ariaLabel="Move note style rule down"
								disabled={!canMoveRule(
									getNodeRules(section.scope),
									rule.id,
									1,
								)}
								onClick={() =>
									moveNodeRule(section.scope, rule.id, 1)}
							/>
						</div>
					{/snippet}
					{#snippet actions()}
						<ObsidianButton
							class="knowledge-workspace-remove-rule-button"
							ariaLabel="Remove note style rule"
							icon="trash-2"
							onClick={() =>
								removeNodeRule(section.scope, rule.id)}
						/>
					{/snippet}
				</NodeConditionRow>
				<div class="knowledge-workspace-rule-row compact">
					<label>
						<span>Color</span>
						<input
							type="color"
							value={rule.color}
							oninput={(event) =>
								scheduleColorCommit(
									`node:${section.scope}:${rule.id}`,
									rule.color,
									event.currentTarget.value,
									(color) =>
										updateNodeRule(section.scope, rule.id, {
											color,
										}),
								)}
							onchange={(event) =>
								commitColor(
									`node:${section.scope}:${rule.id}`,
									rule.color,
									event.currentTarget.value,
									(color) =>
										updateNodeRule(section.scope, rule.id, {
											color,
										}),
								)}
						/>
					</label>
					<label>
						<span>Size</span>
						<div class="knowledge-workspace-slider-value">
							<ObsidianSlider
								min={1}
								max={30}
								step={0.5}
								value={rule.size}
								onChange={(value) =>
									updateNodeRule(section.scope, rule.id, {
										size: value,
									})}
							/>
							<span>{rule.size.toFixed(1)}</span>
						</div>
					</label>
				</div>
			</div>
		{/each}
	</CollapsibleSettingsGroup>
{/each}
