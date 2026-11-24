import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { commands, type ComposeContainer, type ComposeProject, type DockerEngineStatus } from "@bindings";

export type { ComposeContainer, ComposeProject, DockerEngineStatus };
export type DockerEngineStatusWithChecking = DockerEngineStatus & {
	checking?: boolean;
};
export type ComposeAction = "start" | "stop" | "restart" | "pull" | "build";
export interface BuildInfo {
	version: string;
	commit: string;
	updaterEnabled: boolean;
}
export interface UpdateInfo {
	version: string;
	notes: string | null;
}
export interface ComposeOutput {
	projectDirectory: string;
	stream: "stdout" | "stderr";
	line: string;
	timestamp: number;
}

@Injectable({ providedIn: "root" })
export class DockerService {
	getBuildInfo(): Promise<BuildInfo> {
		return invoke("get_build_info");
	}
	checkForUpdate(): Promise<UpdateInfo | null> {
		return invoke("check_for_update");
	}
	installUpdate(version: string): Promise<void> {
		return invoke("install_update", { expectedVersion: version });
	}
	getEngineStatus(): Promise<DockerEngineStatusWithChecking> {
		return commands.getDockerEngineStatus();
	}
	chooseDirectory(): Promise<string | null> {
		return commands.pickComposeDirectory();
	}
	scanDirectory(rootDirectory: string): Promise<ComposeProject[]> {
		return commands.scanComposeDirectory(rootDirectory);
	}
	getContainers(rootDirectory: string, projectDirectory: string): Promise<ComposeContainer[]> {
		return commands.getComposeContainers(rootDirectory, projectDirectory);
	}
	runServiceAction(
		rootDirectory: string,
		projectDirectory: string,
		service: string,
		action: "start" | "stop" | "restart",
	): Promise<string> {
		return commands.runComposeServiceAction(rootDirectory, projectDirectory, service, action);
	}
	runAction(
		rootDirectory: string,
		projectDirectory: string,
		action: ComposeAction,
		services: string[],
	): Promise<string> {
		return commands.runComposeAction(rootDirectory, projectDirectory, action, services);
	}
	openExternalUrl(url: string): Promise<void> {
		return openUrl(url);
	}
	getLogs(rootDirectory: string, projectDirectory: string): Promise<string> {
		return commands.getComposeLogs(rootDirectory, projectDirectory);
	}

	listenComposeOutput(callback: (output: ComposeOutput) => void): Promise<UnlistenFn> {
		return listen<ComposeOutput>("compose-output", ({ payload }) => callback(payload));
	}
}
