import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import type { ComposeOutput } from "./docker.service";
import { SseService } from "./sse.service";

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(),
}));

describe("SseService", () => {
	beforeEach(() => vi.clearAllMocks());

	it("shares one Tauri listener between subscribers and releases it after the last one leaves", async () => {
		let emit: ((event: { payload: ComposeOutput }) => void) | undefined;
		const unlisten = vi.fn();
		vi.mocked(listen).mockImplementation(async (_event, handler) => {
			emit = handler as (event: { payload: ComposeOutput }) => void;
			return unlisten;
		});

		const service = TestBed.inject(SseService);
		const first = vi.fn();
		const second = vi.fn();
		const stopFirst = await service.listenComposeOutput(first);
		const stopSecond = await service.listenComposeOutput(second);

		expect(listen).toHaveBeenCalledTimes(1);
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
});
