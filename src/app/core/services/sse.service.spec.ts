import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { ComposeOutput } from "./docker.service";
import { SseService, TAURI_EVENT_LISTEN } from "./sse.service";

describe("SseService", () => {
	it("shares one Tauri listener between subscribers and releases it after the last one leaves", async () => {
		let emit: ((event: { payload: ComposeOutput }) => void) | undefined;
		const unlisten = vi.fn();
		const listenMock = vi.fn(async (_event: string, handler: (event: { payload: ComposeOutput }) => void): Promise<UnlistenFn> => {
			emit = handler;
			return unlisten;
		});

		TestBed.configureTestingModule({
			providers: [{ provide: TAURI_EVENT_LISTEN, useValue: listenMock }],
		});
		const service = TestBed.inject(SseService);
		const first = vi.fn();
		const second = vi.fn();
		const stopFirst = await service.listenComposeOutput(first);
		const stopSecond = await service.listenComposeOutput(second);

		expect(listenMock).toHaveBeenCalledTimes(1);
		const event: ComposeOutput = {
			projectDirectory: "/workspace/app",
			source: "action",
			operation: "build",
			stream: "stdout",
			line: "building",
			timestamp: 1,
		};
		emit?.({ payload: event });
		expect(first).toHaveBeenCalledWith(event);
		expect(second).toHaveBeenCalledWith(event);

		stopFirst();
		expect(unlisten).not.toHaveBeenCalled();
		stopSecond();
		expect(unlisten).toHaveBeenCalledOnce();
	});

	it("unlistens when the last subscriber leaves before Tauri resolves the listener", async () => {
		let resolveListener: ((unlisten: UnlistenFn) => void) | undefined;
		const unlisten = vi.fn();
		const listenMock = vi.fn(() => new Promise<UnlistenFn>((resolve) => { resolveListener = resolve; }));

		TestBed.configureTestingModule({
			providers: [{ provide: TAURI_EVENT_LISTEN, useValue: listenMock }],
		});
		const service = TestBed.inject(SseService);
		const stop = await service.listenComposeOutput(vi.fn());
		stop();
		resolveListener?.(unlisten);
		await Promise.resolve();
		expect(unlisten).toHaveBeenCalledOnce();
	});
});
