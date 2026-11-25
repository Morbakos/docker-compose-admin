import { describe, expect, it } from "bun:test";
import { findApplicationUrl, orderComposeFiles } from "../src/app/core/components/project-workspace/workspace-configuration";

describe("orderComposeFiles", () => {
	it("keeps selected files first in their configured order", () => {
		expect(orderComposeFiles(
			["compose.yaml", "compose.dev.yaml", "compose.local.yaml"],
			["compose.local.yaml", "compose.yaml"],
		)).toEqual(["compose.local.yaml", "compose.yaml", "compose.dev.yaml"]);
	});

	it("ignores stale selections without dropping available files", () => {
		expect(orderComposeFiles(["compose.yaml", "compose.dev.yaml"], ["missing.yaml"]))
			.toEqual(["compose.yaml", "compose.dev.yaml"]);
	});
});

describe("findApplicationUrl", () => {
	it("uses the first published TCP port", () => {
		expect(findApplicationUrl([{ ports: ["8080:80/tcp", "4200:4200"] }]))
			.toBe("http://localhost:8080");
	});

	it("supports host IP and ephemeral host port formats", () => {
		expect(findApplicationUrl([{ ports: ["127.0.0.1:5173:80/tcp"] }]))
			.toBe("http://localhost:5173");
	});

	it("skips UDP mappings and returns null when no TCP mapping exists", () => {
		expect(findApplicationUrl([{ ports: ["5353:53/udp"] }])).toBeNull();
		expect(findApplicationUrl([])).toBeNull();
	});
});
