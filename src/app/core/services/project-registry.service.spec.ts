import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import type { PersistedComposeProject } from "./docker.service";
import { DockerService } from "./docker.service";
import { ProjectRegistryService } from "./project-registry.service";

function project(directory: string, name = directory): PersistedComposeProject {
	return {
		name,
		directory,
		relativeDirectory: ".",
		composeFiles: [directory + "/compose.yaml"],
		availableComposeFiles: [directory + "/compose.yaml"],
		services: ["api", "worker"],
		watchServices: [],
		status: "stopped",
		rootDirectory: directory,
		selectedServices: ["api"],
		accessible: true,
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("ProjectRegistryService", () => {
	it("queues a refresh requested while another refresh is in progress", async () => {
		localStorage.clear();
		const first = deferred<PersistedComposeProject[]>();
		const second = deferred<PersistedComposeProject[]>();
		const docker = {
			listRegisteredProjects: vi.fn()
				.mockReturnValueOnce(first.promise)
				.mockReturnValueOnce(second.promise),
		};
		await TestBed.configureTestingModule({
			providers: [ProjectRegistryService, { provide: DockerService, useValue: docker }],
		});
		const registry = TestBed.inject(ProjectRegistryService);

		const firstRefresh = registry.refresh();
		const queuedRefresh = registry.refresh();
		expect(docker.listRegisteredProjects).toHaveBeenCalledOnce();
		expect(registry.scanning()).toBe(true);

		first.resolve([project("/work/first")]);
		await vi.waitFor(() => expect(docker.listRegisteredProjects).toHaveBeenCalledTimes(2));
		second.resolve([project("/work/latest")]);
		await Promise.all([firstRefresh, queuedRefresh]);

		expect(registry.projects().map((item) => item.directory)).toEqual(["/work/latest"]);
		expect(registry.scanning()).toBe(false);
	});

	it("clears the scanning state after a failed request and permits a retry", async () => {
		localStorage.clear();
		const docker = {
			listRegisteredProjects: vi.fn()
				.mockRejectedValueOnce(new Error("offline"))
				.mockResolvedValueOnce([project("/work/recovered")]),
		};
		await TestBed.configureTestingModule({
			providers: [ProjectRegistryService, { provide: DockerService, useValue: docker }],
		});
		const registry = TestBed.inject(ProjectRegistryService);

		await expect(registry.refresh()).rejects.toThrow("offline");
		expect(registry.scanning()).toBe(false);
		await registry.refresh();

		expect(registry.projects()[0]?.directory).toBe("/work/recovered");
	});

	it("keeps the selected project when the catalog is refreshed", async () => {
		localStorage.clear();
		const docker = {
			listRegisteredProjects: vi.fn().mockResolvedValue([
				project("/work/first"),
				project("/work/second"),
			]),
		};
		await TestBed.configureTestingModule({
			providers: [ProjectRegistryService, { provide: DockerService, useValue: docker }],
		});
		const registry = TestBed.inject(ProjectRegistryService);

		await registry.refresh();
		registry.selectProject("/work/second");
		await registry.refresh();

		expect(registry.selectedProject()?.directory).toBe("/work/second");
	});
});
