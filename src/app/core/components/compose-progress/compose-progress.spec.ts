import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import type { ComposeOutput } from "@services";
import { SseService } from "@services";
import { ComposeProgress } from "./compose-progress";

describe("ComposeProgress", () => {
	it("displays Watch output for the active project and releases its listener", async () => {
		let emit: ((output: ComposeOutput) => void) | undefined;
		const unlisten = vi.fn();
		const docker = {
			listenComposeOutput: vi.fn((callback: (output: ComposeOutput) => void) => {
				emit = callback;
				return Promise.resolve(unlisten);
			}),
		};
		await TestBed.configureTestingModule({
			imports: [ComposeProgress],
			providers: [{ provide: SseService, useValue: sse }],
		}).compileComponents();

		const fixture = TestBed.createComponent(ComposeProgress);
		fixture.componentRef.setInput("projectDirectory", "/work/app");
		fixture.detectChanges();
		await vi.waitFor(() => expect(sse.listenComposeOutput).toHaveBeenCalledOnce());

		emit?.({ projectDirectory: "/work/other", source: "watch", stream: "stdout", line: "ignored", timestamp: 1 });
		emit?.({ projectDirectory: "/work/app", source: "container", stream: "stdout", line: "ignored", timestamp: 2 });
		emit?.({ projectDirectory: "/work/app", source: "watch", stream: "stdout", line: "watching files", timestamp: 3 });
		expect(fixture.componentInstance.lines().map((line) => line.line)).toEqual(["watching files"]);

		fixture.destroy();
		expect(unlisten).toHaveBeenCalled();
	});
});
