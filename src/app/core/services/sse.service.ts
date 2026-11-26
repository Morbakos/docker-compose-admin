import { Injectable } from "@angular/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ComposeOutput } from "./docker.service";

/** Owns the frontend subscription to backend process-output events. */
@Injectable({ providedIn: "root" })
export class SseService {
	listenComposeOutput(callback: (output: ComposeOutput) => void): Promise<UnlistenFn> {
		return listen<ComposeOutput>("compose-output", ({ payload }) => callback(payload));
	}
}
