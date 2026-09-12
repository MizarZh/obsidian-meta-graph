import type { NodeBadgeSettings } from '@/core/types';
export const DEFAULT_NODE_BADGES: NodeBadgeSettings = {
	enabled: true,
	scale: 1,
	position: 'top-right',
};
export function normalizeNodeBadges(value: unknown): NodeBadgeSettings {
	const config =
		value && typeof value === 'object'
			? (value as Partial<NodeBadgeSettings>)
			: {};
	return {
		enabled: typeof config.enabled === 'boolean' ? config.enabled : true,
		scale:
			typeof config.scale === 'number' && Number.isFinite(config.scale)
				? Math.max(0.25, Math.min(2, config.scale))
				: 1,
		position: [
			'top-right',
			'top-left',
			'bottom-right',
			'bottom-left',
		].includes(config.position ?? '')
			? config.position!
			: 'top-right',
	};
}
