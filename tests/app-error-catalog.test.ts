import { describe, expect, it } from "vitest";
import { AppErrorCatalogService } from "../src/app/core/services/app-error-catalog.service";

describe("AppErrorCatalogService", () => {
	const catalog = new AppErrorCatalogService();

	it("translates structured Docker errors into user-friendly messages", () => {
		expect(catalog.getUserMessage({ code: "DOCKER_UNAVAILABLE", details: "Cannot connect to the Docker daemon" })).toContain("Docker n'est pas démarré");
		expect(catalog.getUserMessage({ code: "PORT_ALREADY_IN_USE", details: "Bind failed: port is already allocated" })).toContain("port nécessaire");
		expect(catalog.getUserMessage({ code: "IMAGE_PULL_FAILED", details: "pull access denied" })).toContain("récupérer");
	});

	it("recognizes structured application error codes", () => {
		expect(catalog.getUserMessage({ code: "PORT_ALREADY_IN_USE", details: "technical detail" })).toContain("port nécessaire");
		expect(catalog.getCode({ code: "DOCKER_UNAVAILABLE" })).toBe("DOCKER_UNAVAILABLE");
		expect(catalog.getCode({ code: "UNTRUSTED_CODE" })).toBe("UNKNOWN_ERROR");
		expect(catalog.getUserMessage({ code: "UNTRUSTED_CODE", message: "unsafe", details: "SECRET" })).toContain("erreur inattendue");
	});

	it("preserves approved user-facing validation messages", () => {
		expect(catalog.getUserMessage("Sélectionnez au moins un service.")).toBe("Sélectionnez au moins un service.");
	});

	it("does not classify or expose unstructured technical error details", () => {
		expect(catalog.getUserMessage(new Error("SECRET_INTERNAL_TRACE"))).toBe(
			"Une erreur inattendue s'est produite. Réessayez ou consultez les détails techniques.",
		);
	});

	it("maps startup and timeout failures to actionable messages", () => {
		expect(catalog.getUserMessage({ code: "ENVIRONMENT_START_FAILED", details: "Compose up failed" })).toContain("n'a pas pu démarrer");
		expect(catalog.getUserMessage({ code: "OPERATION_TIMEOUT", details: "Operation timed out" })).toContain("plus de temps que prévu");
	});
});
