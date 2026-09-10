export function styleRuleCondition(
	field: string,
	operator: string,
	value: string,
): string {
	const unary = [
		'has-value',
		'empty',
		'is-empty',
		'is-not-empty',
		'is-true',
		'is-false',
		'has value',
		'is empty',
		'is not empty',
		'is true',
		'is false',
	].includes(operator);
	return [field, operator.replaceAll('-', ' '), unary ? '' : value]
		.filter(Boolean)
		.join(' ');
}

export function styleRuleCaption(
	name: string | undefined,
	condition: string,
	details: string,
) {
	const customName = typeof name === 'string' ? name.trim() : '';
	return {
		title: customName || condition,
		summary: customName ? `${condition} · ${details}` : details,
	};
}
