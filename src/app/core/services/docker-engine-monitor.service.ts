import { DestroyRef, Injectable, inject, signal } from "@angular/core";
import { DockerService, type DockerEngineStatusWithChecking } from "./docker.service";

@Injectable({ providedIn: "root" })
export class DockerEngineMonitorService {
	private readonly docker = inject(DockerService);
	private checkInFlight = false;

	readonly status = signal<DockerEngineStatusWithChecking>({
		connected: false, version: null, error: null, checking: true,
	});

	constructor() {
		const timer = window.setInterval(() => void this.refresh(), 15000);
		inject(DestroyRef).onDestroy(() => window.clearInterval(timer));
		void this.refresh();
	}

	async refresh(): Promise<void> {
		if (this.checkInFlight) return;
		this.checkInFlight = true;
		this.status.update((current) => ({ ...current, checking: true }));
		try {
			this.status.set({ ...(await this.docker.getEngineStatus()), checking: false });
		} catch (error) {
			this.status.set({
				connected: false,
				version: null,
				error: error instanceof Error ? error.message : String(error),
				checking: false,
			});
		} finally {
			this.checkInFlight = false;
		}
	}
}
