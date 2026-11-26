import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import type { ComposeOutput } from "@services";
import { DockerService, SseService } from "@services";
import { LogsPanel } from "./logs-panel";

describe("LogsPanel", () => {
	it("starts the container log stream and displays only matching project events", async () => {
		let emit: ((output: ComposeOutput) => void) | undefined;
		const unlisten = vi.fn();
		const docker = {
			listenComposeOutput: vi.fn((callback: (output: ComposeOutput) => void) => {
				emit = callback;
				return Promise.resolve(unlisten);
			}),
			startComposeLogs: vi.fn().mockResolvedValue(undefined),
			stopComposeLogs: vi.fn().mockResolvedValue(undefined),
		};
		await TestBed.configureTestingModule({
			imports: [LogsPanel],
			providers: [{ provide: DockerService, useValue: docker }, { provide: SseService, useValue: sse }],
		}).compileComponents();

		const fixture = TestBed.createComponent(LogsPanel);
		fixture.componentRef.setInput("rootDirectory", "/work");
		fixture.componentRef.setInput("projectDirectory", "/work/app");
		fixture.detectChanges();
		await vi.waitFor(() => expect(docker.startComposeLogs).toHaveBeenCalledOnce());

		expect(docker.startComposeLogs).toHaveBeenCalledWith("/work", "/work/app");
		emit?.({ projectDirectory: "/work/other", source: "container", stream: "stdout", line: "ignored", timestamp: 1 });
		emit?.({ projectDirectory: "/work/app", source: "watch", stream: "stdout", line: "ignored", timestamp: 2 });
		emit?.({ projectDirectory: "/work/app", source: "container", stream: "stderr", line: "database unavailable", timestamp: 3 });

		expect(fixture.componentInstance.lines().map((line) => line.line)).toEqual(["database unavailable"]);
		expect(fixture.componentInstance.lines()[0]?.stream).toBe("stderr");
		fixture.destroy();
		await Promise.resolve();
		expect(unlisten).toHaveBeenCalled();
		expect(docker.stopComposeLogs).toHaveBeenCalledWith("/work/app");
	});
});
