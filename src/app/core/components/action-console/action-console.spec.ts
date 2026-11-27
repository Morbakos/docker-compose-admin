import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import type { ComposeOutput } from "@services";
import { ActionConsole } from "./action-console";

describe("ActionConsole", () => {
	it("renders the supplied entries and emits clear without owning the data", async () => {
		const entries: ComposeOutput[] = [{
			projectDirectory: "/work/app",
			source: "action",
			operation: "build",
			stream: "stderr",
			line: "image build failed",
			timestamp: 1,
		}];
		await TestBed.configureTestingModule({ imports: [ActionConsole] }).compileComponents();
		const fixture = TestBed.createComponent(ActionConsole);
		fixture.componentRef.setInput("title", "Construction des images");
		fixture.componentRef.setInput("entries", entries);
		fixture.detectChanges();
		const clear = vi.fn();
		fixture.componentInstance.clear.subscribe(clear);
		expect(fixture.nativeElement.textContent).toContain("Construction des images");
		expect(fixture.nativeElement.textContent).toContain("image build failed");
		fixture.nativeElement.querySelector("button").click();
		expect(clear).toHaveBeenCalledOnce();
		expect(fixture.componentInstance.entries()).toBe(entries);
	});
});
