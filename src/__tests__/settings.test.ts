import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	normalizeNodeOpenMode,
} from '../settings/settings';

describe('plugin settings', () => {
	it('defaults node opening to a new tab', () => {
		expect(DEFAULT_SETTINGS.nodeOpenMode).toBe('tab');
	});

	it('normalizes persisted node open modes', () => {
		expect(normalizeNodeOpenMode('right-split')).toBe('right-split');
		expect(normalizeNodeOpenMode('internal-preview')).toBe(
			'internal-preview',
		);
		expect(normalizeNodeOpenMode('invalid')).toBe('tab');
	});
});
