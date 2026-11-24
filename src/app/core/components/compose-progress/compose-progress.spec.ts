import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ComposeProgress } from "./compose-progress";

describe("ComposeProgress", () => {
	let component: ComposeProgress;
	let fixture: ComponentFixture<ComposeProgress>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [ComposeProgress],
		}).compileComponents();

		fixture = TestBed.createComponent(ComposeProgress);
		component = fixture.componentInstance;
		await fixture.whenStable();
	});

	it("should create", () => {
		expect(component).toBeTruthy();
	});
});
