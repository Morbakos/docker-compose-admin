import { describe, expect, it } from "bun:test";
import { appendComposeOutput, MAX_COMPOSE_OUTPUT_LINES } from "../src/app/core/components/compose-output-buffer";
import type { ComposeOutput } from "../src/app/core/services/docker.service";

function output(projectDirectory: string, source: ComposeOutput["source"], line: string): ComposeOutput {
	return { projectDirectory, source, stream: "stdout", line, timestamp: 1 };
}

describe("appendComposeOutput", () => {
	it("ignores events from another project or output stream", () => {
		const current = [output("/project", "container", "existing")];
		expect(appendComposeOutput(current, output("/other", "container", "wrong-project"), "/project", "container"))
			.toBe(current);
		expect(appendComposeOutput(current, output("/project", "watch", "wrong-stream"), "/project", "container"))
			.toBe(current);
	});

	it("appends matching events without mutating the existing buffer", () => {
		const current = [output("/project", "watch", "first")];
		const next = appendComposeOutput(current, output("/project", "watch", "second"), "/project", "watch");
		expect(next.map((item) => item.line)).toEqual(["first", "second"]);
		expect(current).toHaveLength(1);
	});

	it("keeps only the newest 5000 lines", () => {
		const current = Array.from({ length: MAX_COMPOSE_OUTPUT_LINES }, (_, index) =>
			output("/project", "container", String(index)),
		);
		const next = appendComposeOutput(current, output("/project", "container", "newest"), "/project", "container");
		expect(next).toHaveLength(MAX_COMPOSE_OUTPUT_LINES);
		expect(next[0]?.line).toBe("1");
		expect(next.at(-1)?.line).toBe("newest");
	});
});
