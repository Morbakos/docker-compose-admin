export function parseLegacyServiceSelections(raw: string): Record<string, string[]> | null {
	try {
		const value: unknown = JSON.parse(raw);
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		const entries = Object.entries(value);
		if (entries.some(([, services]) =>
			!Array.isArray(services) || services.some((service) => typeof service !== "string"),
		)) return null;
		return Object.fromEntries(entries) as Record<string, string[]>;
	} catch {
		return null;
	}
}
