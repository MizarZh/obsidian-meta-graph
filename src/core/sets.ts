export function setsEqual<T>(
	left: ReadonlySet<T>,
	right: ReadonlySet<T>,
): boolean {
	if (left.size !== right.size) {
		return false;
	}
	for (const value of left) {
		if (!right.has(value)) {
			return false;
		}
	}
	return true;
}
