import { DestroyRef, Injectable, inject, signal } from "@angular/core";
import { DockerService, type BuildInfo, type DockerEngineStatusWithChecking, type UpdateInfo } from "./docker.service";

@Injectable({ providedIn: "root" })
export class ApplicationRuntimeService {
	private readonly docker = inject(DockerService);
	private engineCheckInFlight = false;

	readonly buildInfo = signal<BuildInfo>({ version: "…", commit: "…", updaterEnabled: false });
	readonly availableUpdate = signal<UpdateInfo | null>(null);
	readonly checkingForUpdates = signal(false);
	readonly installingUpdate = signal(false);
	readonly dockerEngine = signal<DockerEngineStatusWithChecking>({
		connected: false, version: null, error: null, checking: true,
	});

	constructor() {
		const destroyRef = inject(DestroyRef);
		const engineTimer = window.setInterval(() => void this.refreshDockerStatus(), 15000);
		const updateTimer = window.setInterval(() => void this.checkForUpdates(), 6 * 60 * 60 * 1000);
		destroyRef.onDestroy(() => {
			window.clearInterval(engineTimer);
			window.clearInterval(updateTimer);
		});
		void this.loadBuildInfo();
		void this.refreshDockerStatus();
	}

	async refreshDockerStatus(): Promise<void> {
		if (this.engineCheckInFlight) return;
		this.engineCheckInFlight = true;
		this.dockerEngine.update((current) => ({ ...current, checking: true }));
		try {
			this.dockerEngine.set({ ...(await this.docker.getEngineStatus()), checking: false });
		} catch (error) {
			this.dockerEngine.set({
				connected: false, version: null, error: this.errorMessage(error), checking: false,
			});
		} finally {
			this.engineCheckInFlight = false;
		}
	}

	async checkForUpdates(): Promise<void> {
		if (this.checkingForUpdates() || !this.buildInfo().updaterEnabled) return;
		this.checkingForUpdates.set(true);
		try {
			this.availableUpdate.set(await this.docker.checkForUpdate());
		} catch (error) {
			console.warn("Unable to check for application updates", error);
		} finally {
			this.checkingForUpdates.set(false);
		}
	}

	async installUpdate(): Promise<void> {
		const update = this.availableUpdate();
		if (!update || this.installingUpdate()) return;
		this.installingUpdate.set(true);
		try {
			await this.docker.installUpdate(update.version);
		} catch (error) {
			this.installingUpdate.set(false);
			throw error;
		}
	}

	private async loadBuildInfo(): Promise<void> {
		try {
			const info = await this.docker.getBuildInfo();
			this.buildInfo.set(info);
			if (info.updaterEnabled) void this.checkForUpdates();
		} catch (error) {
			console.error("Unable to read application build information", error);
		}
	}

	private errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
}
