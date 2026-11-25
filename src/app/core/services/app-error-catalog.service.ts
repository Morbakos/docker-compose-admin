import { Injectable } from "@angular/core";

export type AppErrorCode =
	| "DOCKER_UNAVAILABLE"
	| "DOCKER_CLI_NOT_FOUND"
	| "DOCKER_PERMISSION_DENIED"
	| "COMPOSE_CONFIGURATION_INVALID"
	| "PORT_ALREADY_IN_USE"
	| "IMAGE_BUILD_FAILED"
	| "IMAGE_PULL_FAILED"
	| "ENVIRONMENT_START_FAILED"
	| "ENVIRONMENT_STOP_FAILED"
	| "ENVIRONMENT_RESTART_FAILED"
	| "SERVICE_ACTION_FAILED"
	| "PROJECT_NOT_ACCESSIBLE"
	| "PROJECT_NOT_REGISTERED"
	| "COMPOSE_SELECTION_INVALID"
	| "PREFERENCES_SAVE_FAILED"
	| "UPDATE_CHECK_FAILED"
	| "UPDATE_INSTALL_FAILED"
	| "OPERATION_TIMEOUT"
	| "UNKNOWN_ERROR";

export interface AppErrorPayload {
	code?: string;
	message?: string;
	details?: string;
}

const messages: Record<AppErrorCode, string> = {
	DOCKER_UNAVAILABLE: "Docker n'est pas démarré. Lancez Docker Desktop, puis réessayez.",
	DOCKER_CLI_NOT_FOUND: "Docker semble ne pas être installé ou accessible.",
	DOCKER_PERMISSION_DENIED: "Compose Admin ne parvient pas à accéder à Docker. Vérifiez les autorisations.",
	COMPOSE_CONFIGURATION_INVALID: "La configuration de votre environnement contient une erreur. Vérifiez vos fichiers Compose.",
	PORT_ALREADY_IN_USE: "Un autre logiciel utilise déjà un port nécessaire à l'application.",
	IMAGE_BUILD_FAILED: "La préparation d'une image a échoué.",
	IMAGE_PULL_FAILED: "Impossible de récupérer une ou plusieurs images nécessaires.",
	ENVIRONMENT_START_FAILED: "L'environnement n'a pas pu démarrer. Consultez les détails pour en savoir plus.",
	ENVIRONMENT_STOP_FAILED: "L'environnement n'a pas pu être arrêté. Réessayez.",
	ENVIRONMENT_RESTART_FAILED: "L'environnement n'a pas pu redémarrer. Réessayez.",
	SERVICE_ACTION_FAILED: "Une action sur le service n'a pas pu être effectuée.",
	PROJECT_NOT_ACCESSIBLE: "Le dossier du projet est inaccessible. Vérifiez qu'il existe toujours.",
	PROJECT_NOT_REGISTERED: "Ce projet n'est plus enregistré dans Compose Admin. Actualisez la liste des projets.",
	COMPOSE_SELECTION_INVALID: "La sélection des fichiers Compose n'est plus valide. Vérifiez-la puis réessayez.",
	PREFERENCES_SAVE_FAILED: "Impossible d'enregistrer vos préférences.",
	UPDATE_CHECK_FAILED: "Impossible de vérifier les mises à jour pour le moment.",
	UPDATE_INSTALL_FAILED: "La mise à jour n'a pas pu être installée.",
	OPERATION_TIMEOUT: "L'opération prend plus de temps que prévu. Vous pouvez réessayer.",
	UNKNOWN_ERROR: "Une erreur inattendue s'est produite. Réessayez ou consultez les détails techniques.",
};

const knownCodes: Record<string, AppErrorCode> = {
	DOCKER_UNAVAILABLE: "DOCKER_UNAVAILABLE",
	DockerUnavailable: "DOCKER_UNAVAILABLE",
	DOCKER_CLI_NOT_FOUND: "DOCKER_CLI_NOT_FOUND",
	DockerCliNotFound: "DOCKER_CLI_NOT_FOUND",
	DOCKER_PERMISSION_DENIED: "DOCKER_PERMISSION_DENIED",
	DockerPermissionDenied: "DOCKER_PERMISSION_DENIED",
	COMPOSE_CONFIGURATION_INVALID: "COMPOSE_CONFIGURATION_INVALID",
	ComposeConfigurationInvalid: "COMPOSE_CONFIGURATION_INVALID",
	PORT_ALREADY_IN_USE: "PORT_ALREADY_IN_USE",
	PortAlreadyInUse: "PORT_ALREADY_IN_USE",
	IMAGE_BUILD_FAILED: "IMAGE_BUILD_FAILED",
	ImageBuildFailed: "IMAGE_BUILD_FAILED",
	IMAGE_PULL_FAILED: "IMAGE_PULL_FAILED",
	ImagePullFailed: "IMAGE_PULL_FAILED",
	ENVIRONMENT_START_FAILED: "ENVIRONMENT_START_FAILED",
	EnvironmentStartFailed: "ENVIRONMENT_START_FAILED",
	ENVIRONMENT_STOP_FAILED: "ENVIRONMENT_STOP_FAILED",
	EnvironmentStopFailed: "ENVIRONMENT_STOP_FAILED",
	ENVIRONMENT_RESTART_FAILED: "ENVIRONMENT_RESTART_FAILED",
	EnvironmentRestartFailed: "ENVIRONMENT_RESTART_FAILED",
	SERVICE_ACTION_FAILED: "SERVICE_ACTION_FAILED",
	ServiceActionFailed: "SERVICE_ACTION_FAILED",
	PROJECT_NOT_ACCESSIBLE: "PROJECT_NOT_ACCESSIBLE",
	ProjectNotAccessible: "PROJECT_NOT_ACCESSIBLE",
	PROJECT_NOT_REGISTERED: "PROJECT_NOT_REGISTERED",
	ProjectNotRegistered: "PROJECT_NOT_REGISTERED",
	COMPOSE_SELECTION_INVALID: "COMPOSE_SELECTION_INVALID",
	ComposeSelectionInvalid: "COMPOSE_SELECTION_INVALID",
	PREFERENCES_SAVE_FAILED: "PREFERENCES_SAVE_FAILED",
	PreferencesSaveFailed: "PREFERENCES_SAVE_FAILED",
	UPDATE_CHECK_FAILED: "UPDATE_CHECK_FAILED",
	UpdateCheckFailed: "UPDATE_CHECK_FAILED",
	UPDATE_INSTALL_FAILED: "UPDATE_INSTALL_FAILED",
	UpdateInstallFailed: "UPDATE_INSTALL_FAILED",
	OPERATION_TIMEOUT: "OPERATION_TIMEOUT",
	OperationTimeout: "OPERATION_TIMEOUT",
	UNKNOWN_ERROR: "UNKNOWN_ERROR",
	Unknown: "UNKNOWN_ERROR",
};

const safeUserMessages = [
	"sélectionnez au moins un service.",
	"la sélection contient un service inconnu pour ce projet.",
	"sélectionnez au moins un service à démarrer.",
	"aucun fichier docker compose reconnu dans ce dossier.",
	"plusieurs projets compose ont été détectés. sélectionnez le dossier d'un seul projet pour l'ajouter individuellement.",
	"la version disponible a changé. vérifiez à nouveau les mises à jour.",
	"aucune mise à jour n'est actuellement disponible.",
	"le chemin sélectionné n'est pas un dossier.",
];

function extractErrorText(error: unknown): string {
	if (typeof error === "string") return error;
	if (error instanceof Error) return error.message;
	if (error && typeof error === "object") {
		const payload = error as AppErrorPayload;
		return payload.message ?? payload.details ?? "";
	}
	return "";
}

function normalize(text: string): string {
	return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function classifyLegacyError(text: string): AppErrorCode {
	const value = normalize(text);
	if (value.includes("docker cli introuvable") || value.includes("executable file not found") || value.includes("command not found: docker")) return "DOCKER_CLI_NOT_FOUND";
	if (value.includes("permission denied") || value.includes("access denied") || value.includes("operation not permitted")) return "DOCKER_PERMISSION_DENIED";
	if (value.includes("cannot connect to the docker daemon") || value.includes("docker daemon") || value.includes("docker engine ne repond pas") || value.includes("docker n'est pas demarre")) return "DOCKER_UNAVAILABLE";
	if (value.includes("port is already allocated") || value.includes("address already in use") || value.includes("port") && value.includes("already in use")) return "PORT_ALREADY_IN_USE";
	if (value.includes("yaml") || value.includes("compose file") && (value.includes("invalid") || value.includes("not found")) || value.includes("configuration compose json invalide")) return "COMPOSE_CONFIGURATION_INVALID";
	if (value.includes("pull access denied") || value.includes("failed to pull") || value.includes("pulling")) return "IMAGE_PULL_FAILED";
	if (value.includes("build") && (value.includes("failed") || value.includes("error"))) return "IMAGE_BUILD_FAILED";
	if (value.includes("timed out") || value.includes("timeout") || value.includes("delai depasse")) return "OPERATION_TIMEOUT";
	if (value.includes("dossier inaccessible") || value.includes("no such file or directory") || value.includes("path not found")) return "PROJECT_NOT_ACCESSIBLE";
	if (value.includes("projet non enregistre") || value.includes("projet enregistre introuvable")) return "PROJECT_NOT_REGISTERED";
	if (value.includes("selection des fichiers compose") || value.includes("selection compose invalide")) return "COMPOSE_SELECTION_INVALID";
	if (value.includes("mise a jour") && (value.includes("download") || value.includes("install"))) return "UPDATE_INSTALL_FAILED";
	if (value.includes("mise a jour") && (value.includes("check") || value.includes("verification"))) return "UPDATE_CHECK_FAILED";
	if (value.includes("service") && (value.includes("failed") || value.includes("error"))) return "SERVICE_ACTION_FAILED";
	if (value.includes("restart") || value.includes("redemarrage")) return "ENVIRONMENT_RESTART_FAILED";
	if (value.includes("start") || value.includes("demarrage") || value.includes("up")) return "ENVIRONMENT_START_FAILED";
	if (value.includes("stop") || value.includes("arret")) return "ENVIRONMENT_STOP_FAILED";
	if (value.includes("sauvegarde") || value.includes("database") || value.includes("sqlite")) return "PREFERENCES_SAVE_FAILED";
	return "UNKNOWN_ERROR";
}

@Injectable({ providedIn: "root" })
export class AppErrorCatalogService {
	getCode(error: unknown): AppErrorCode {
		if (error && typeof error === "object" && "code" in error) {
			const code = (error as AppErrorPayload).code;
			if (code && knownCodes[code]) return knownCodes[code];
		}
		return classifyLegacyError(extractErrorText(error));
	}

	getUserMessage(error: unknown): string {
		const text = extractErrorText(error).trim();
		if (safeUserMessages.some((message) => normalize(text).includes(normalize(message)))) return text;
		return messages[this.getCode(error)];
	}
}
