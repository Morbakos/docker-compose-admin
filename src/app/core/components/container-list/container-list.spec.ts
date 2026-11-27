import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import type { ComposeContainer } from "@bindings";
import { ContainerList } from "./container-list";

const stoppedContainer: ComposeContainer = {
	id: "container-1", name: "api-1", service: "api", state: "exited",
	status: "Exited (0)", ports: ["8080:80/tcp"], cpu: null, memory: null,
};

describe("ContainerList", () => {
	it("emits the selected action for a stopped container", async () => {
		await TestBed.configureTestingModule({ imports: [ContainerList] }).compileComponents();
		const fixture = TestBed.createComponent(ContainerList);
		fixture.componentRef.setInput("containers", [stoppedContainer]);
		fixture.componentRef.setInput("loading", false);
		fixture.componentRef.setInput("busy", false);
		fixture.detectChanges();

		const action = vi.fn();
		fixture.componentInstance.action.subscribe(action);
		fixture.nativeElement.querySelector(".container-actions button").click();

		expect(action).toHaveBeenCalledWith({ container: stoppedContainer, action: "start" });
		fixture.destroy();
	});

	it("shows a loading message while containers are being fetched", async () => {
		await TestBed.configureTestingModule({ imports: [ContainerList] }).compileComponents();
		const fixture = TestBed.createComponent(ContainerList);
		fixture.componentRef.setInput("containers", []);
		fixture.componentRef.setInput("loading", true);
		fixture.componentRef.setInput("busy", false);
		fixture.detectChanges();

		expect(fixture.nativeElement.textContent).toContain("Chargement des services");
		expect(fixture.nativeElement.querySelector(".container-actions")).toBeNull();
		fixture.destroy();
	});

	it("disables container actions while a Compose operation is running", async () => {
		await TestBed.configureTestingModule({ imports: [ContainerList] }).compileComponents();
		const fixture = TestBed.createComponent(ContainerList);
		fixture.componentRef.setInput("containers", [stoppedContainer]);
		fixture.componentRef.setInput("loading", false);
		fixture.componentRef.setInput("busy", true);
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector(".container-actions button").disabled).toBe(true);
		fixture.destroy();
	});
});
