import type { IconName } from 'obsidian';

export type SettingLayout = 'row' | 'stacked' | 'segmented';

export type SettingGridDensity = 'comfortable' | 'compact';

export interface SettingOption<T extends string | number> {
	value: T;
	label: string;
	icon?: IconName;
	ariaLabel?: string;
	tooltip?: string;
}

export type NumericSettingFormatter = (value: number) => string;
