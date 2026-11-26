import { Injectable, InjectionToken, inject } from "@angular/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Observable, share } from "rxjs";
import type { ComposeOutput } from "./docker.service";

export const TAURI_EVENT_LISTEN = new InjectionToken<typeof listen>("TAURI_EVENT_LISTEN", {
	providedIn: "root",
	factory: () => listen,
});

/** Owns one shared frontend subscription to backend process-output events. */
@Injectable({ providedIn: "root" })
export class SseService {
	private readonly tauriListen = inject(TAURI_EVENT_LISTEN);
	private readonly composeOutput$ = new Observable<ComposeOutput>((subscriber) => {
		let disposed = false;
		let unlisten: UnlistenFn | undefined;

		void this.tauriListen<ComposeOutput>("compose-output", ({ payload }) => subscriber.next(payload))
			.then((stopListening) => {
				if (disposed) stopListening();
				else unlisten = stopListening;
			})
			.catch((error: unknown) => subscriber.error(error));

		return () => {
			disposed = true;
			unlisten?.();
		};
	}).pipe(share());

	listenComposeOutput(callback: (output: ComposeOutput) => void): Promise<UnlistenFn> {
		const subscription = this.composeOutput$.subscribe({
			next: callback,
			error: (error: unknown) => console.error("Unable to receive backend process events", error),
		});
		return Promise.resolve(() => subscription.unsubscribe());
	}
}
