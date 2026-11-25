import { DestroyRef, Injectable, inject, signal } from "@angular/core";
import { DockerService, type BuildInfo, type UpdateInfo } from "./docker.service";

@Injectable({ providedIn: "root" })
export class ApplicationUpdateService {
	private readonly docker = inject(DockerService);

	readonly buildInfo = signal<BuildInfo>({ version: "…", commit: "…", updaterEnabled: false });
	readonly availableUpdate = signal<UpdateInfo | null>(null);
	readonly checking = signal(false);
	readonly installing = signal(false);

	constructor() {
		const timer = window.setInterval(() => void this.checkForUpdates(), 6 * 60 * 60 * 1000);
		inject(DestroyRef).onDestroy(() => window.clearInterval(timer));
		void this.loadBuildInfo();
	}

	async checkForUpdates(): Promise<void> {
		if (this.checking() || !this.buildInfo().updaterEnabled) return;
		this.checking.set(true);
		try {
			this.availableUpdate.set(await this.docker.checkForUpdate());
		} catch (error) {
			console.warn("Unable to check for application updates", error);
		} finally {
			this.checking.set(false);
		}
	}

	async installUpdate(): Promise<void> {
		const update = this.availableUpdate();
		if (!update || this.installing()) return;
		this.installing.set(true);
		try {
			await this.docker.installUpdate(update.version);
		} catch (error) {
			this.installing.set(false);
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
}
