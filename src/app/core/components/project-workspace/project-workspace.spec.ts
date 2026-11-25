import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import type { ComposeContainer, ComposeProject } from "@bindings";
import { DockerService } from "@services";
import { ProjectWorkspace } from "./project-workspace";

const project: ComposeProject = {
	name: "Example",
	directory: "/work/example",
	relativeDirectory: ".",
	composeFiles: ["/work/example/compose.yaml", "/work/example/compose.dev.yaml"],
	availableComposeFiles: [
		"/work/example/compose.yaml",
		"/work/example/compose.dev.yaml",
		"/work/example/compose.local.yaml",
	],
	services: ["api", "web"],
	watchServices: ["web"],
	status: "stopped",
	rootDirectory: "/work/example",
	selectedServices: ["api", "web"],
	accessible: true,
};

const container: ComposeContainer = {
	id: "container-1", name: "web-1", service: "web", state: "running",
	status: "Up", ports: ["4200:80/tcp"], cpu: null, memory: null,
};

describe("ProjectWorkspace", () => {
	it("orders selected Compose files first and emits reordering changes", async () => {
		const docker = {
			getContainers: vi.fn().mockResolvedValue([]),
			listenComposeOutput: vi.fn().mockResolvedValue(() => {}),
			startComposeLogs: vi.fn().mockResolvedValue(undefined),
			stopComposeLogs: vi.fn().mockResolvedValue(undefined),
		};
		await TestBed.configureTestingModule({
			imports: [ProjectWorkspace],
			providers: [{ provide: DockerService, useValue: docker }],
		}).compileComponents();

		const fixture = TestBed.createComponent(ProjectWorkspace);
		fixture.componentRef.setInput("project", project);
		fixture.detectChanges();
		await fixture.whenStable();

		expect(fixture.componentInstance.orderedComposeFiles()).toEqual([
			"/work/example/compose.yaml",
			"/work/example/compose.dev.yaml",
			"/work/example/compose.local.yaml",
		]);
		const changed = vi.fn();
		fixture.componentInstance.composeFilesChange.subscribe(changed);
		fixture.componentInstance.moveComposeFile("/work/example/compose.yaml", 1);
		expect(changed).toHaveBeenCalledWith([
			"/work/example/compose.dev.yaml",
			"/work/example/compose.yaml",
		]);
		fixture.destroy();
	});

	it("derives the application URL from the first published TCP port", async () => {
		const docker = {
			getContainers: vi.fn().mockResolvedValue([container]),
			listenComposeOutput: vi.fn().mockResolvedValue(() => {}),
			startComposeLogs: vi.fn().mockResolvedValue(undefined),
			stopComposeLogs: vi.fn().mockResolvedValue(undefined),
		};
		await TestBed.configureTestingModule({
			imports: [ProjectWorkspace],
			providers: [{ provide: DockerService, useValue: docker }],
		}).compileComponents();

		const fixture = TestBed.createComponent(ProjectWorkspace);
		fixture.componentRef.setInput("project", project);
		fixture.detectChanges();
		await fixture.whenStable();

		expect(fixture.componentInstance.applicationUrl()).toBe("http://localhost:4200");
		expect(docker.getContainers).toHaveBeenCalledWith(project.rootDirectory, project.directory);
		fixture.destroy();
	});
});
