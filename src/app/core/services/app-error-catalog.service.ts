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

const safeUserMessages = [
	"sélectionnez au moins un service.",
	"la sélection contient un service inconnu pour ce projet.",
	"sélectionnez au moins un service à démarrer.",
	"aucun fichier docker compose reconnu dans ce dossier.",
	"plusieurs projets compose ont été détectés. sélectionnez le dossier d'un seul projet pour l'ajouter individuellement.",
	"la version disponible a changé. vérifiez à nouveau les mises à jour.",
	"aucune mise à jour n'est actuellement disponible.",
	"le chemin sélectionné n'est pas un dossier.",
	"action effectuée, mais impossible d’actualiser l’état du projet",
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

@Injectable({ providedIn: "root" })
export class AppErrorCatalogService {
	getCode(error: unknown): AppErrorCode {
		if (!error || typeof error !== "object" || !("code" in error)) return "UNKNOWN_ERROR";
		const code = (error as AppErrorPayload).code;
		return code && Object.prototype.hasOwnProperty.call(messages, code)
			? code as AppErrorCode
			: "UNKNOWN_ERROR";
	}

	getUserMessage(error: unknown): string {
		const text = extractErrorText(error).trim();
		if (typeof error === "string" && safeUserMessages.some((message) => normalize(text).includes(normalize(message)))) {
			return text;
		}
		return messages[this.getCode(error)];
	}
}
