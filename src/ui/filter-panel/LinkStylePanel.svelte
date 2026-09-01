<script lang="ts">
	import type { App } from 'obsidian';
	import SettingsSection from '../settings/SettingsSection.svelte';
	import LinkVisualSettings, {
		type LinkVisualValue,
	} from '../settings/style/LinkVisualSettings.svelte';
	import LinkBehaviorSettings from '../settings/style/LinkBehaviorSettings.svelte';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '../obsidian/ObsidianDropdown.svelte';
	import ObsidianSuggestInput, {
		type SuggestionOption,
	} from '../obsidian/ObsidianSuggestInput.svelte';
	import ObsidianTextInput from '../obsidian/ObsidianTextInput.svelte';
	import PropertyPicker, {
		type PropertyPickerOption,
	} from '../PropertyPicker.svelte';
	import type {
		DefaultLinkStyle,
		LinkStyleField,
		LinkStyleRule,
		NodeFilterOperator,
	} from '../../core/types';
	import { createRuleId } from '../filter/filter-tree';
	import {
		activeLinkLineStyle as resolveActiveLinkLineStyle,
		activeLinkArrowStyle as resolveActiveLinkArrowStyle,
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
	import {
		BUILT_IN_DEFAULT_PLAIN_LINK_STYLE,
		BUILT_IN_DEFAULT_UNRESOLVED_LINK_STYLE,
	} from '../../workspace/meta-graph-model';

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
		plainLinkStyleOverrides,
		unresolvedLinkStyleOverrides,
		linkStyleRules,
		showPlainLinks,
		showUnresolvedLinks,
		onDefaultLinkStyle,
		onGlobalLinkStyleRulesChange,
		onLinkStyleOverrides,
		onPlainLinkStyleOverrides,
		onUnresolvedLinkStyleOverrides,
		onLinkStyleRulesChange,
		onMoveLinkStyleRule,
	}: {
		app: App;
		metadataFieldSuggestions: string[];
		defaultLinkStyle: Required<DefaultLinkStyle>;
		globalLinkStyleRules: LinkStyleRule[];
		linkStyleOverrides: DefaultLinkStyle;
		plainLinkStyleOverrides: DefaultLinkStyle;
		unresolvedLinkStyleOverrides: DefaultLinkStyle;
		linkStyleRules: LinkStyleRule[];
		showPlainLinks: boolean;
		showUnresolvedLinks: boolean;
		onDefaultLinkStyle: (style: Required<DefaultLinkStyle>) => void;
		onGlobalLinkStyleRulesChange: (rules: LinkStyleRule[]) => void;
		onLinkStyleOverrides: (style: DefaultLinkStyle) => void;
		onPlainLinkStyleOverrides: (style: DefaultLinkStyle) => void;
		onUnresolvedLinkStyleOverrides: (style: DefaultLinkStyle) => void;
		onLinkStyleRulesChange: (rules: LinkStyleRule[]) => void;
		onMoveLinkStyleRule: (id: string, targetScope: StyleRuleScope) => void;
	} = $props();

	let workspaceDefaultOpen = $state(true);
	let chartOverridesOpen = $state(true);
	let plainLinksOpen = $state(true);
	let unresolvedLinksOpen = $state(true);
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

	function moveLinkRuleToScope(scope: StyleRuleScope, id: string): void {
		onMoveLinkStyleRule(id, scope === 'global' ? 'current' : 'global');
	}

	function updateDefaultLinkStyle(patch: Partial<DefaultLinkStyle>): void {
		onDefaultLinkStyle({ ...defaultLinkStyle, ...patch });
	}

	function updateLinkOverride(patch: Partial<DefaultLinkStyle>): void {
		onLinkStyleOverrides({ ...linkStyleOverrides, ...patch });
	}

	function updatePlainLinkOverride(patch: Partial<DefaultLinkStyle>): void {
		onPlainLinkStyleOverrides({ ...plainLinkStyleOverrides, ...patch });
	}

	function updateUnresolvedLinkOverride(
		patch: Partial<DefaultLinkStyle>,
	): void {
		onUnresolvedLinkStyleOverrides({
			...unresolvedLinkStyleOverrides,
			...patch,
		});
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

	function clearPlainLinkOverride(): void {
		onPlainLinkStyleOverrides({});
	}

	function clearUnresolvedLinkOverride(): void {
		onUnresolvedLinkStyleOverrides({});
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

	function activeLinkVisualValue(): LinkVisualValue {
		return {
			color: String(activeLinkStyleValue('color')),
			size: Number(activeLinkStyleValue('size')),
			opacity: Number(activeLinkStyleValue('opacity') ?? 1),
			lineStyle: resolveActiveLinkLineStyle(
				linkStyleOverrides,
				defaultLinkStyle,
			),
			arrowStyle: resolveActiveLinkArrowStyle(
				linkStyleOverrides,
				defaultLinkStyle,
			),
			arrowSize: Number(activeLinkStyleValue('arrowSize') ?? 1),
		};
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

	function activePlainLinkStyleValue(
		field: keyof DefaultLinkStyle,
	): string | number | boolean {
		return (
			plainLinkStyleOverrides[field] ??
			BUILT_IN_DEFAULT_PLAIN_LINK_STYLE[field]
		);
	}

	function activePlainLinkVisualValue(): LinkVisualValue {
		return {
			color: String(activePlainLinkStyleValue('color')),
			size: Number(activePlainLinkStyleValue('size')),
			opacity: Number(activePlainLinkStyleValue('opacity') ?? 1),
			lineStyle: activePlainLinkStyleValue(
				'lineStyle',
			) as LinkVisualValue['lineStyle'],
			arrowStyle: (activePlainLinkStyleValue('arrowStyle') ??
				'filled') as LinkVisualValue['arrowStyle'],
			arrowSize: Number(activePlainLinkStyleValue('arrowSize') ?? 1),
		};
	}

	function activePlainLinkHidden(): boolean {
		return Boolean(activePlainLinkStyleValue('hidden'));
	}

	function activeUnresolvedLinkStyleValue(
		field: keyof DefaultLinkStyle,
	): string | number | boolean {
		return (
			unresolvedLinkStyleOverrides[field] ??
			BUILT_IN_DEFAULT_UNRESOLVED_LINK_STYLE[field]
		);
	}

	function activeUnresolvedLinkVisualValue(): LinkVisualValue {
		return {
			color: String(activeUnresolvedLinkStyleValue('color')),
			size: Number(activeUnresolvedLinkStyleValue('size')),
			opacity: Number(activeUnresolvedLinkStyleValue('opacity') ?? 1),
			lineStyle: activeUnresolvedLinkStyleValue(
				'lineStyle',
			) as LinkVisualValue['lineStyle'],
			arrowStyle: (activeUnresolvedLinkStyleValue('arrowStyle') ??
				'filled') as LinkVisualValue['arrowStyle'],
			arrowSize: Number(activeUnresolvedLinkStyleValue('arrowSize') ?? 1),
		};
	}

	function activeUnresolvedLinkHidden(): boolean {
		return Boolean(activeUnresolvedLinkStyleValue('hidden'));
	}

	function hasLinkOverride(): boolean {
		return hasStyleOverride(linkStyleOverrides);
	}

	function hasPlainLinkOverride(): boolean {
		return hasStyleOverride(plainLinkStyleOverrides);
	}

	function hasUnresolvedLinkOverride(): boolean {
		return hasStyleOverride(unresolvedLinkStyleOverrides);
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
<SettingsSection title="Workspace default" bind:open={workspaceDefaultOpen}>
	<div class="knowledge-workspace-rule">
		<LinkVisualSettings
			value={defaultLinkStyle}
			commitKey="link:workspace-default"
			onPatch={updateDefaultLinkStyle}
		/>
		<LinkBehaviorSettings
			value={defaultLinkStyle}
			onPatch={updateDefaultLinkStyle}
		/>
	</div>
</SettingsSection>
<SettingsSection title="Chart overrides" bind:open={chartOverridesOpen}>
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
			<LinkVisualSettings
				value={activeLinkVisualValue()}
				commitKey="link:chart-override"
				onPatch={updateLinkOverride}
			/>
			<LinkBehaviorSettings
				value={{
					label: activeLinkLabel(),
					showLabel: activeLinkShowLabel(),
					hidden: activeLinkHidden(),
				}}
				onPatch={updateLinkOverride}
			/>
		</div>
	{/if}
</SettingsSection>
{#each LINK_STYLE_SECTIONS as section}
	<SettingsSection
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
					<div class="knowledge-workspace-style-rule-actions">
						<ObsidianButton
							class="knowledge-workspace-move-rule-button"
							ariaLabel={section.scope === 'global'
								? 'Move to chart link rules'
								: 'Move to global link rules'}
							tooltip={section.scope === 'global'
								? 'Move to chart link rules'
								: 'Move to global link rules'}
							icon={section.scope === 'global'
								? 'layout-dashboard'
								: 'globe'}
							onClick={() =>
								moveLinkRuleToScope(section.scope, rule.id)}
						/>
						<ObsidianButton
							class="knowledge-workspace-remove-rule-button"
							ariaLabel="Remove link style rule"
							icon="trash-2"
							onClick={() =>
								removeLinkRule(section.scope, rule.id)}
						/>
					</div>
				</div>
				<LinkVisualSettings
					value={{
						color: rule.color,
						size: rule.size,
						opacity: rule.opacity ?? 1,
						lineStyle: rule.lineStyle,
						arrowStyle: rule.arrowStyle ?? 'filled',
						arrowSize: rule.arrowSize ?? 1,
					}}
					commitKey={`link:${section.scope}:${rule.id}`}
					onPatch={(patch) =>
						updateLinkRule(section.scope, rule.id, patch)}
				/>
				<LinkBehaviorSettings
					value={{
						label: rule.label,
						showLabel: rule.showLabel,
						hidden: rule.hidden,
					}}
					onPatch={(patch) =>
						updateLinkRule(section.scope, rule.id, patch)}
				/>
			</div>
		{/each}
	</SettingsSection>
{/each}
{#if showUnresolvedLinks}
	<SettingsSection title="Unresolved links" bind:open={unresolvedLinksOpen}>
		{#snippet actions()}
			{#if hasUnresolvedLinkOverride()}
				<ObsidianButton
					class="knowledge-workspace-remove-rule-button"
					ariaLabel="Reset unresolved link style"
					icon="rotate-ccw"
					onClick={clearUnresolvedLinkOverride}
				/>
			{/if}
		{/snippet}
		<div class="knowledge-workspace-rule">
			<LinkVisualSettings
				value={activeUnresolvedLinkVisualValue()}
				commitKey="link:unresolved"
				onPatch={updateUnresolvedLinkOverride}
			/>
			<LinkBehaviorSettings
				value={{ hidden: activeUnresolvedLinkHidden() }}
				onPatch={updateUnresolvedLinkOverride}
			/>
		</div>
	</SettingsSection>
{/if}
{#if showPlainLinks}
	<SettingsSection title="Plain links" bind:open={plainLinksOpen}>
		{#snippet actions()}
			{#if hasPlainLinkOverride()}
				<ObsidianButton
					class="knowledge-workspace-remove-rule-button"
					ariaLabel="Reset plain link style"
					icon="rotate-ccw"
					onClick={clearPlainLinkOverride}
				/>
			{/if}
		{/snippet}
		<div class="knowledge-workspace-rule">
			<LinkVisualSettings
				value={activePlainLinkVisualValue()}
				commitKey="link:plain"
				onPatch={updatePlainLinkOverride}
			/>
			<LinkBehaviorSettings
				value={{ hidden: activePlainLinkHidden() }}
				onPatch={updatePlainLinkOverride}
			/>
		</div>
	</SettingsSection>
{/if}
