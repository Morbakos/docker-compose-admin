import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { ServiceSelection } from "./service-selection";

describe("ServiceSelection", () => {
	it("emits the toggled service when a checkbox changes", async () => {
		await TestBed.configureTestingModule({ imports: [ServiceSelection] }).compileComponents();
		const fixture = TestBed.createComponent(ServiceSelection);
		fixture.componentRef.setInput("services", ["api", "worker"]);
		fixture.componentRef.setInput("selected", ["api"]);
		fixture.detectChanges();

		const toggled = vi.fn();
		fixture.componentInstance.toggled.subscribe(toggled);
		const checkboxes = fixture.nativeElement.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
		checkboxes[1].click();

		expect(toggled).toHaveBeenCalledWith("worker");
		expect(fixture.nativeElement.querySelector(".service-choice").classList.contains("checked")).toBe(true);
		fixture.destroy();
	});

	it("emits select-all and clear actions", async () => {
		await TestBed.configureTestingModule({ imports: [ServiceSelection] }).compileComponents();
		const fixture = TestBed.createComponent(ServiceSelection);
		fixture.componentRef.setInput("services", ["api"]);
		fixture.detectChanges();

		const selectAll = vi.fn();
		const clear = vi.fn();
		fixture.componentInstance.selectAll.subscribe(selectAll);
		fixture.componentInstance.clear.subscribe(clear);
		const buttons = fixture.nativeElement.querySelectorAll("button");
		buttons[0].click();
		buttons[1].click();

		expect(selectAll).toHaveBeenCalledOnce();
		expect(clear).toHaveBeenCalledOnce();
		fixture.destroy();
	});
});
