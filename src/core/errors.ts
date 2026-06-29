export interface FormatErrorOptions {
	includeStack?: boolean;
}

export function formatError(
	error: unknown,
	options: FormatErrorOptions = {},
): string {
	if (!(error instanceof Error)) {
		return String(error);
	}

	const message = `${error.name}: ${error.message}`;
	return options.includeStack ? `${message}\n${error.stack ?? ''}` : message;
}
