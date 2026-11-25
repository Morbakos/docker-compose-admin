import { ComposeOutput } from "@services";

export const MAX_COMPOSE_OUTPUT_LINES = 5000;

export function appendComposeOutput(
	current: ComposeOutput[],
	output: ComposeOutput,
	projectDirectory: string,
	source: ComposeOutput["source"],
): ComposeOutput[] {
	if (output.projectDirectory !== projectDirectory || output.source !== source) return current;
	return [...current, output].slice(-MAX_COMPOSE_OUTPUT_LINES);
}
