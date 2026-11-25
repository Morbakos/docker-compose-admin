export interface PortContainer {
	ports: string[];
}

export function orderComposeFiles(availableFiles: string[], selectedFiles: string[]): string[] {
	const selected = selectedFiles.filter((file) => availableFiles.includes(file));
	const unselected = availableFiles.filter((file) => !selectedFiles.includes(file));
	return [...selected, ...unselected];
}

export function findApplicationUrl(containers: PortContainer[]): string | null {
	for (const container of containers) {
		for (const port of container.ports) {
			const match = port.match(/^(?:[^:]+:)?(\d+):(\d+)(?:\/(tcp|udp))?$/i);
			if (match && (!match[3] || match[3].toLowerCase() === "tcp")) {
				return "http://localhost:" + match[1];
			}
		}
	}
	return null;
}
