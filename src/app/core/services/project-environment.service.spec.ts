import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import type { PersistedComposeProject } from "./docker.service";
import { DockerService } from "./docker.service";
import { ProjectEnvironmentService } from "./project-environment.service";
import { ProjectRegistryService } from "./project-registry.service";

const project: PersistedComposeProject = {
	name: "Example",
	directory: "/work/example",
	relativeDirectory: ".",
	composeFiles: ["/work/example/compose.yaml"],
	availableComposeFiles: ["/work/example/compose.yaml"],
	services: ["api"],
	watchServices: [],
	status: "stopped",
	rootDirectory: "/work/example",
	selectedServices: ["api"],
	accessible: true,
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => { resolve = res; });
	return { promise, resolve };
}

async function setup(docker: Record<string, ReturnType<typeof vi.fn>>) {
	await TestBed.configureTestingModule({
		providers: [
			ProjectEnvironmentService,
			ProjectRegistryService,
			{ provide: DockerService, useValue: docker },
		],
	});
	const registry = TestBed.inject(ProjectRegistryService);
	registry.projects.set([project]);
	registry.selectedDirectory.set(project.directory);
	vi.spyOn(registry, "refresh").mockResolvedValue();
	return { environment: TestBed.inject(ProjectEnvironmentService), registry };
}

describe("ProjectEnvironmentService", () => {
	it("prevents starting when no service is selected", async () => {
		const docker = { runAction: vi.fn().mockResolvedValue("started") };
		const { environment, registry } = await setup(docker);
		registry.projects.update((projects) => projects.map((item) => ({ ...item, selectedServices: [] })));

		await environment.runAction("start");

		expect(docker.runAction).not.toHaveBeenCalled();
		expect(environment.notice()?.kind).toBe("error");
		expect(environment.busyDirectory()).toBeNull();
	});

	it("blocks overlapping Compose operations and releases the busy state", async () => {
		const operation = deferred<string>();
		const docker = { runAction: vi.fn().mockReturnValue(operation.promise) };
		const { environment } = await setup(docker);

		const first = environment.runAction("stop");
		expect(environment.busyDirectory()).toBe(project.directory);
		await environment.runAction("stop");
		expect(docker.runAction).toHaveBeenCalledOnce();

		operation.resolve("Stopped");
		await first;

		expect(environment.busyDirectory()).toBeNull();
		expect(environment.notice()?.text).toBe("Stopped");
	});

	it("preserves structured backend error codes when displaying action failures", async () => {
		const docker = {
			runAction: vi.fn().mockRejectedValue({
				code: "DOCKER_UNAVAILABLE",
				message: "unsafe backend message",
				details: "Cannot connect to the Docker daemon",
			}),
		};
		const { environment } = await setup(docker);

		await environment.runAction("stop");

		expect(environment.notice()?.kind).toBe("error");
		expect(environment.notice()?.text).toContain("Docker n'est pas démarré");
		expect(environment.notice()?.text).not.toContain("unsafe backend message");
		expect(environment.notice()?.text).not.toContain("Cannot connect");
	});

	it("distinguishes a successful action from a failed status refresh", async () => {
		const docker = { runAction: vi.fn().mockResolvedValue("Environment stopped") };
		const { environment, registry } = await setup(docker);
		vi.spyOn(registry, "refresh").mockRejectedValue(new Error("refresh failed"));

		await environment.runAction("stop");

		expect(docker.runAction).toHaveBeenCalledOnce();
		expect(environment.notice()?.kind).toBe("error");
		expect(environment.notice()?.text).toContain("Action effectuée");
		expect(environment.busyDirectory()).toBeNull();
	});
});
