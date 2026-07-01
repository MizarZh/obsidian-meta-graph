<script lang="ts">
	import type { App } from 'obsidian';
	import CollapsibleSettingsGroup from './CollapsibleSettingsGroup.svelte';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '../obsidian/ObsidianDropdown.svelte';
	import ObsidianSlider from '../obsidian/ObsidianSlider.svelte';
	import ObsidianSuggestInput, {
		type SuggestionOption,
	} from '../obsidian/ObsidianSuggestInput.svelte';
	import ObsidianTextInput from '../obsidian/ObsidianTextInput.svelte';
	import ObsidianToggle from '../obsidian/ObsidianToggle.svelte';
	import PropertyPicker, {
		type PropertyPickerOption,
	} from '../PropertyPicker.svelte';
	import type {
		DefaultLinkStyle,
		LinkLineStyle,
		LinkStyleField,
		LinkStyleRule,
		NodeFilterOperator,
	} from '../../core/types';
	import { createRuleId } from '../filter/filter-tree';
	import {
		activeLinkLineStyle as resolveActiveLinkLineStyle,
		activeLinkStyleValue as resolveActiveLinkStyleValue,
		canMoveRule,
		createLinkStyleRule,
		hasStyleOverride,
		moveRule,
		patchRule,
		removeRule,
		type StyleRuleScope,
	} from '../filter/filter-style-rules';
	import { TEXT_FILTER_OPERATOR_OPTIONS } from '../filter-config';

	const LINK_STYLE_FIELD_OPTIONS = [
		{
			value: 'source-field',
			label: 'metadata',
			detail: 'source-field',
			icon: 'braces',
		},
	] satisfies PropertyPickerOption[];
	const LINK_STYLE_OPERATOR_OPTIONS = TEXT_FILTER_OPERATOR_OPTIONS as Array<{
		value: NodeFilterOperator;
		label: string;
	}>;
	const LINE_STYLE_OPTIONS = [
		{ value: 'solid', label: 'Solid' },
		{ value: 'dashed', label: 'Dashed' },
		{ value: 'dotted', label: 'Dotted' },
	];
	const LINK_STYLE_SECTIONS = [
		{ scope: 'global', title: 'Global link rules' },
		{ scope: 'current', title: 'Chart link rules' },
	] as const;

	let {
		app,
		metadataFieldSuggestions,
		defaultLinkStyle,
		globalLinkStyleRules,
		linkStyleOverrides,
		linkStyleRules,
		onDefaultLinkStyle,
		onGlobalLinkStyleRulesChange,
		onLinkStyleOverrides,
		onLinkStyleRulesChange,
		scheduleColorCommit,
		commitColor,
	}: {
		app: App;
		metadataFieldSuggestions: string[];
		defaultLinkStyle: Required<DefaultLinkStyle>;
		globalLinkStyleRules: LinkStyleRule[];
		linkStyleOverrides: DefaultLinkStyle;
		linkStyleRules: LinkStyleRule[];
		onDefaultLinkStyle: (style: Required<DefaultLinkStyle>) => void;
		onGlobalLinkStyleRulesChange: (rules: LinkStyleRule[]) => void;
		onLinkStyleOverrides: (style: DefaultLinkStyle) => void;
		onLinkStyleRulesChange: (rules: LinkStyleRule[]) => void;
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
	let previousHadLinkOverride = $state<boolean | undefined>(undefined);
	const metadataFieldOptions = $derived(
		metadataFieldSuggestions.map((field) => ({
			value: field,
			label: field,
			searchText: field,
		})),
	);

	$effect(() => {
		const hasOverride = hasStyleOverride(linkStyleOverrides);
		if (previousHadLinkOverride === undefined) {
			workspaceDefaultOpen = !hasOverride;
		} else if (hasOverride && !previousHadLinkOverride) {
			workspaceDefaultOpen = false;
		} else if (!hasOverride && previousHadLinkOverride) {
			workspaceDefaultOpen = true;
		}
		previousHadLinkOverride = hasOverride;
	});

	function addLinkRule(scope: 'global' | 'current'): void {
		updateLinkRules(scope, [
			...getLinkRules(scope),
			createLinkStyleRule(createRuleId()),
		]);
	}

	function updateLinkRule(
		scope: 'global' | 'current',
		id: string,
		patch: Partial<LinkStyleRule>,
	): void {
		updateLinkRules(scope, patchRule(getLinkRules(scope), id, patch));
	}

	function updateLinkRuleField(
		scope: 'global' | 'current',
		id: string,
		field: LinkStyleField,
	): void {
		updateLinkRule(scope, id, {
			field,
			operator: 'is',
			value: '',
		});
	}

	function updateLinkRules(
		scope: 'global' | 'current',
		rules: LinkStyleRule[],
	): void {
		if (scope === 'global') {
			onGlobalLinkStyleRulesChange(rules);
		} else {
			onLinkStyleRulesChange(rules);
		}
	}

	function getLinkRules(scope: 'global' | 'current'): LinkStyleRule[] {
		return scope === 'global' ? globalLinkStyleRules : linkStyleRules;
	}

	function moveLinkRule(
		scope: StyleRuleScope,
		id: string,
		direction: -1 | 1,
	): void {
		updateLinkRules(scope, moveRule(getLinkRules(scope), id, direction));
	}

	function updateDefaultLinkStyle(patch: Partial<DefaultLinkStyle>): void {
		onDefaultLinkStyle({ ...defaultLinkStyle, ...patch });
	}

	function updateLinkOverride(patch: DefaultLinkStyle): void {
		onLinkStyleOverrides({ ...linkStyleOverrides, ...patch });
	}

	function addLinkOverride(): void {
		workspaceDefaultOpen = false;
		chartOverridesOpen = true;
		onLinkStyleOverrides({ ...defaultLinkStyle });
	}

	function clearLinkOverride(): void {
		workspaceDefaultOpen = true;
		onLinkStyleOverrides({});
	}

	function activeLinkStyleValue(
		field: keyof DefaultLinkStyle,
	): string | number | boolean {
		return resolveActiveLinkStyleValue(
			linkStyleOverrides,
			defaultLinkStyle,
			field,
		);
	}

	function activeLinkColor(): string {
		return String(activeLinkStyleValue('color'));
	}

	function activeLinkSize(): number {
		return Number(activeLinkStyleValue('size'));
	}

	function activeLinkLineStyle(): LinkLineStyle {
		return resolveActiveLinkLineStyle(linkStyleOverrides, defaultLinkStyle);
	}

	function activeLinkLabel(): string {
		return String(activeLinkStyleValue('label'));
	}

	function activeLinkShowLabel(): boolean {
		return Boolean(activeLinkStyleValue('showLabel'));
	}

	function activeLinkHidden(): boolean {
		return Boolean(activeLinkStyleValue('hidden'));
	}

	function hasLinkOverride(): boolean {
		return hasStyleOverride(linkStyleOverrides);
	}

	function removeLinkRule(scope: 'global' | 'current', id: string): void {
		updateLinkRules(scope, removeRule(getLinkRules(scope), id));
	}

	function getLinkRuleOperator(rule: LinkStyleRule): NodeFilterOperator {
		return rule.operator ?? 'is';
	}

	function getVisibleLinkRuleField(rule: LinkStyleRule): LinkStyleField {
		return rule.field === 'relation' ? 'source-field' : rule.field;
	}

	function shouldShowLinkRuleValue(rule: LinkStyleRule): boolean {
		return !['has-value', 'empty', 'is-empty', 'is-not-empty'].includes(
			getLinkRuleOperator(rule),
		);
	}

	function getMetadataValueOptions(rule: LinkStyleRule): SuggestionOption[] {
		if (
			rule.value &&
			!metadataFieldOptions.some((option) => option.value === rule.value)
		) {
			return [
				{
					value: rule.value,
					label: rule.value,
					searchText: rule.value,
				},
				...metadataFieldOptions,
			];
		}
		return metadataFieldOptions;
	}
</script>

<section>
	<header><h3>Link styles</h3></header>
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
					value={defaultLinkStyle.color}
					oninput={(event) =>
						scheduleColorCommit(
							'link:workspace-default',
							defaultLinkStyle.color,
							event.currentTarget.value,
							(color) => updateDefaultLinkStyle({ color }),
						)}
					onchange={(event) =>
						commitColor(
							'link:workspace-default',
							defaultLinkStyle.color,
							event.currentTarget.value,
							(color) => updateDefaultLinkStyle({ color }),
						)}
				/>
			</label>
			<label>
				<span>Width</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						min={0.5}
						max={10}
						step={0.5}
						value={defaultLinkStyle.size}
						format={(value) => value.toFixed(1)}
						onChange={(size) => updateDefaultLinkStyle({ size })}
					/>
					<span>{defaultLinkStyle.size.toFixed(1)}</span>
				</div>
			</label>
		</div>
		<div class="knowledge-workspace-line-style-row">
			<span>Line</span>
			<div class="knowledge-workspace-segmented">
				{#each LINE_STYLE_OPTIONS as option}
					<ObsidianButton
						active={defaultLinkStyle.lineStyle === option.value}
						text={option.label}
						onClick={() =>
							updateDefaultLinkStyle({
								lineStyle: option.value as LinkLineStyle,
							})}
					/>
				{/each}
			</div>
		</div>
		<div class="knowledge-workspace-rule-row link-line-label">
			<label class="knowledge-workspace-rule-label">
				<span>Label</span>
				<ObsidianTextInput
					type="text"
					placeholder="Optional label"
					value={defaultLinkStyle.label}
					onInput={(label) => updateDefaultLinkStyle({ label })}
				/>
			</label>
		</div>
		<div class="knowledge-workspace-toggle-row">
			<label class="checkbox">
				<ObsidianToggle
					value={defaultLinkStyle.showLabel}
					onChange={(showLabel) =>
						updateDefaultLinkStyle({ showLabel })}
				/>
				<span>Show label</span>
			</label>
			<label class="checkbox">
				<ObsidianToggle
					value={defaultLinkStyle.hidden}
					onChange={(hidden) => updateDefaultLinkStyle({ hidden })}
				/>
				<span>Hidden</span>
			</label>
		</div>
	</div>
</CollapsibleSettingsGroup>
<CollapsibleSettingsGroup
	title="Chart overrides"
	bind:open={chartOverridesOpen}
>
	{#snippet actions()}
		{#if !hasLinkOverride()}
			<ObsidianButton
				class="knowledge-workspace-add-rule-button"
				ariaLabel="Add chart link override"
				icon="plus"
				onClick={addLinkOverride}
			/>
		{/if}
	{/snippet}
	{#if hasLinkOverride()}
		<div class="knowledge-workspace-rule">
			<div class="knowledge-workspace-rule-row override-heading">
				<strong>This chart</strong>
				<ObsidianButton
					class="knowledge-workspace-remove-rule-button"
					ariaLabel="Remove chart link override"
					icon="trash-2"
					onClick={clearLinkOverride}
				/>
			</div>
			<div class="knowledge-workspace-rule-row compact">
				<label>
					<span>Color</span>
					<input
						type="color"
						value={activeLinkColor()}
						oninput={(event) =>
							scheduleColorCommit(
								'link:chart-override',
								activeLinkColor(),
								event.currentTarget.value,
								(color) => updateLinkOverride({ color }),
							)}
						onchange={(event) =>
							commitColor(
								'link:chart-override',
								activeLinkColor(),
								event.currentTarget.value,
								(color) => updateLinkOverride({ color }),
							)}
					/>
				</label>
				<label>
					<span>Width</span>
					<div class="knowledge-workspace-slider-value">
						<ObsidianSlider
							min={0.5}
							max={10}
							step={0.5}
							value={activeLinkSize()}
							format={(value) => value.toFixed(1)}
							onChange={(size) => updateLinkOverride({ size })}
						/>
						<span>{activeLinkSize().toFixed(1)}</span>
					</div>
				</label>
			</div>
			<div class="knowledge-workspace-line-style-row">
				<span>Line</span>
				<div class="knowledge-workspace-segmented">
					{#each LINE_STYLE_OPTIONS as option}
						<ObsidianButton
							active={activeLinkLineStyle() === option.value}
							text={option.label}
							onClick={() =>
								updateLinkOverride({
									lineStyle: option.value as LinkLineStyle,
								})}
						/>
					{/each}
				</div>
			</div>
			<div class="knowledge-workspace-rule-row link-line-label">
				<label class="knowledge-workspace-rule-label">
					<span>Label</span>
					<ObsidianTextInput
						type="text"
						placeholder="Optional label"
						value={activeLinkLabel()}
						onInput={(label) => updateLinkOverride({ label })}
					/>
				</label>
			</div>
			<div class="knowledge-workspace-toggle-row">
				<label class="checkbox">
					<ObsidianToggle
						value={activeLinkShowLabel()}
						onChange={(showLabel) =>
							updateLinkOverride({ showLabel })}
					/>
					<span>Show label</span>
				</label>
				<label class="checkbox">
					<ObsidianToggle
						value={activeLinkHidden()}
						onChange={(hidden) => updateLinkOverride({ hidden })}
					/>
					<span>Hidden</span>
				</label>
			</div>
		</div>
	{/if}
</CollapsibleSettingsGroup>
{#each LINK_STYLE_SECTIONS as section}
	<CollapsibleSettingsGroup
		title={section.title}
		bind:open={ruleSectionsOpen[section.scope]}
	>
		{#snippet actions()}
			<ObsidianButton
				class="knowledge-workspace-add-rule-button"
				ariaLabel="Add link style rule"
				icon="plus"
				onClick={() => addLinkRule(section.scope)}
			/>
		{/snippet}
		{#each getLinkRules(section.scope) as rule (rule.id)}
			<div class="knowledge-workspace-rule">
				<div class="knowledge-workspace-rule-row style-condition">
					<div class="knowledge-workspace-move-rule-buttons">
						<ObsidianButton
							icon="chevron-up"
							ariaLabel="Move link style rule up"
							disabled={!canMoveRule(
								getLinkRules(section.scope),
								rule.id,
								-1,
							)}
							onClick={() =>
								moveLinkRule(section.scope, rule.id, -1)}
						/>
						<ObsidianButton
							icon="chevron-down"
							ariaLabel="Move link style rule down"
							disabled={!canMoveRule(
								getLinkRules(section.scope),
								rule.id,
								1,
							)}
							onClick={() =>
								moveLinkRule(section.scope, rule.id, 1)}
						/>
					</div>
					<PropertyPicker
						value={getVisibleLinkRuleField(rule)}
						options={LINK_STYLE_FIELD_OPTIONS}
						onSelect={(value) =>
							updateLinkRuleField(
								section.scope,
								rule.id,
								value as LinkStyleField,
							)}
					/>
					<ObsidianDropdown
						value={getLinkRuleOperator(rule)}
						options={LINK_STYLE_OPERATOR_OPTIONS}
						onChange={(value) =>
							updateLinkRule(section.scope, rule.id, {
								field: getVisibleLinkRuleField(rule),
								operator: value as NodeFilterOperator,
							})}
					/>
					{#if shouldShowLinkRuleValue(rule)}
						<ObsidianSuggestInput
							{app}
							type="text"
							placeholder="Value"
							value={rule.value}
							options={getMetadataValueOptions(rule)}
							showOnEmpty={true}
							onInput={(value) =>
								updateLinkRule(section.scope, rule.id, {
									field: getVisibleLinkRuleField(rule),
									value,
								})}
							onSelect={(option) =>
								updateLinkRule(section.scope, rule.id, {
									field: getVisibleLinkRuleField(rule),
									value: option.value,
								})}
						/>
					{:else}
						<ObsidianTextInput
							type="text"
							placeholder=""
							disabled={true}
							value={rule.value}
							onInput={(value) =>
								updateLinkRule(section.scope, rule.id, {
									field: getVisibleLinkRuleField(rule),
									value,
								})}
						/>
					{/if}
					<ObsidianButton
						class="knowledge-workspace-remove-rule-button"
						ariaLabel="Remove link style rule"
						icon="trash-2"
						onClick={() => removeLinkRule(section.scope, rule.id)}
					/>
				</div>
				<div class="knowledge-workspace-rule-row compact">
					<label>
						<span>Color</span>
						<input
							type="color"
							value={rule.color}
							oninput={(event) =>
								scheduleColorCommit(
									`link:${section.scope}:${rule.id}`,
									rule.color,
									event.currentTarget.value,
									(color) =>
										updateLinkRule(section.scope, rule.id, {
											color,
										}),
								)}
							onchange={(event) =>
								commitColor(
									`link:${section.scope}:${rule.id}`,
									rule.color,
									event.currentTarget.value,
									(color) =>
										updateLinkRule(section.scope, rule.id, {
											color,
										}),
								)}
						/>
					</label>
					<label>
						<span>Width</span>
						<div class="knowledge-workspace-slider-value">
							<ObsidianSlider
								min={0.5}
								max={10}
								step={0.5}
								value={rule.size}
								format={(value) => value.toFixed(1)}
								onChange={(value) =>
									updateLinkRule(section.scope, rule.id, {
										size: value,
									})}
							/>
							<span>{rule.size.toFixed(1)}</span>
						</div>
					</label>
				</div>
				<div class="knowledge-workspace-line-style-row">
					<span>Line</span>
					<div class="knowledge-workspace-segmented">
						{#each LINE_STYLE_OPTIONS as option}
							<ObsidianButton
								active={rule.lineStyle === option.value}
								text={option.label}
								onClick={() =>
									updateLinkRule(section.scope, rule.id, {
										lineStyle:
											option.value as LinkLineStyle,
									})}
							/>
						{/each}
					</div>
				</div>
				<div class="knowledge-workspace-rule-row link-line-label">
					<label class="knowledge-workspace-rule-label">
						<span>Label</span>
						<ObsidianTextInput
							type="text"
							placeholder="Optional label"
							value={rule.label}
							onInput={(value) =>
								updateLinkRule(section.scope, rule.id, {
									label: value,
								})}
						/>
					</label>
				</div>
				<div class="knowledge-workspace-toggle-row">
					<label class="checkbox">
						<ObsidianToggle
							value={rule.showLabel}
							onChange={(value) =>
								updateLinkRule(section.scope, rule.id, {
									showLabel: value,
								})}
						/>
						<span>Show label</span>
					</label>
					<label class="checkbox">
						<ObsidianToggle
							value={rule.hidden}
							onChange={(value) =>
								updateLinkRule(section.scope, rule.id, {
									hidden: value,
								})}
						/>
						<span>Hidden</span>
					</label>
				</div>
			</div>
		{/each}
	</CollapsibleSettingsGroup>
{/each}
