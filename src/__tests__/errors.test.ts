import { describe, expect, it } from 'vitest';
import { formatError } from '../core/errors';

describe('formatError', () => {
	it('formats Error values with optional stack', () => {
		const error = new Error('boom');
		error.stack = 'stack trace';

		expect(formatError(error)).toBe('Error: boom');
		expect(formatError(error, { includeStack: true })).toBe(
			'Error: boom\nstack trace',
		);
	});

	it('formats non-Error values', () => {
		expect(formatError('nope')).toBe('nope');
		expect(formatError(42)).toBe('42');
	});
});
