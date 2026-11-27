import { describe, expect, it } from "bun:test";
import { parseLegacyServiceSelections } from "../src/app/core/services/legacy-service-selections";

describe("parseLegacyServiceSelections", () => {
	it("parses project service selections", () => {
		expect(parseLegacyServiceSelections('{"C:/work/app":["api","worker"]}'))
			.toEqual({ "C:/work/app": ["api", "worker"] });
	});

	it("rejects invalid JSON and unexpected shapes", () => {
		expect(parseLegacyServiceSelections("{")).toBeNull();
		expect(parseLegacyServiceSelections("[]")).toBeNull();
		expect(parseLegacyServiceSelections('{"project":"api"}')).toBeNull();
		expect(parseLegacyServiceSelections('{"project":["api",1]}')).toBeNull();
	});

	it("accepts an empty object", () => {
		expect(parseLegacyServiceSelections("{}")).toEqual({});
	});
});
