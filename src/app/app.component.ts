import { Component, signal } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { commands } from "@binding";
import { format, startOfToday } from "date-fns"

@Component({
	selector: "app-root",
	imports: [RouterOutlet],
	templateUrl: "./app.component.html",
	styleUrl: "./app.component.css",
})
export class AppComponent {
	greetingMessage = signal("");

	greet(event: SubmitEvent, name: string): void {
		event.preventDefault();

		// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
		// invoke<string>("greet", { name }).then((text) => {
		//   this.greetingMessage.set(text);
		// });

		commands.greet(name, format(startOfToday(), "yyyy-MM-dd")).then((text) => {
			this.greetingMessage.set(text);
		});
	}
}
