use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub details: Option<String>,
}

impl AppError {
    pub fn new(code: &str, message: &str, details: Option<String>) -> Self {
        Self { code: code.to_string(), message: message.to_string(), details }
    }

    fn classify(details: &str) -> (&'static str, &'static str) {
        let value = details.to_lowercase();
        if value.contains("docker cli introuvable") || value.contains("executable file not found") || value.contains("command not found: docker") {
            ("DOCKER_CLI_NOT_FOUND", "Docker semble ne pas être installé ou accessible.")
        } else if value.contains("permission denied") || value.contains("access denied") || value.contains("operation not permitted") {
            ("DOCKER_PERMISSION_DENIED", "Compose Admin ne parvient pas à accéder à Docker. Vérifiez les autorisations.")
        } else if value.contains("cannot connect to the docker daemon") || value.contains("docker daemon") {
            ("DOCKER_UNAVAILABLE", "Docker n'est pas démarré. Lancez Docker Desktop, puis réessayez.")
        } else if value.contains("port is already allocated") || value.contains("address already in use") || value.contains("port") && value.contains("already in use") {
            ("PORT_ALREADY_IN_USE", "Un autre logiciel utilise déjà un port nécessaire à l'application.")
        } else if value.contains("pull access denied") || value.contains("failed to pull") {
            ("IMAGE_PULL_FAILED", "Impossible de récupérer une ou plusieurs images nécessaires.")
        } else if value.contains("build") && (value.contains("failed") || value.contains("error")) {
            ("IMAGE_BUILD_FAILED", "La préparation d'une image a échoué.")
        } else if value.contains("yaml") || value.contains("compose file") && (value.contains("invalid") || value.contains("not found")) || value.contains("configuration compose json invalide") {
            ("COMPOSE_CONFIGURATION_INVALID", "La configuration de votre environnement contient une erreur. Vérifiez vos fichiers Compose.")
        } else if value.contains("timed out") || value.contains("timeout") || value.contains("délai dépassé") {
            ("OPERATION_TIMEOUT", "L'opération prend plus de temps que prévu. Vous pouvez réessayer.")
        } else if value.contains("dossier inaccessible") || value.contains("no such file or directory") || value.contains("path not found") {
            ("PROJECT_NOT_ACCESSIBLE", "Le dossier du projet est inaccessible. Vérifiez qu'il existe toujours.")
        } else if value.contains("projet non enregistré") || value.contains("projet enregistré introuvable") {
            ("PROJECT_NOT_REGISTERED", "Ce projet n'est plus enregistré dans Compose Admin. Actualisez la liste des projets.")
        } else if value.contains("selection") && value.contains("compose") || value.contains("sélection") && value.contains("compose") || value.contains("fichier compose") && value.contains("sélectionnez") {
            ("COMPOSE_SELECTION_INVALID", "La sélection des fichiers Compose n'est plus valide. Vérifiez-la puis réessayez.")
        } else if value.contains("sélectionnez au moins un service") || value.contains("service inconnu pour ce projet") {
            ("SERVICE_ACTION_FAILED", "La sélection des services n'est pas valide. Vérifiez les services choisis.")
        } else if value.contains("sauvegarde") || value.contains("database") || value.contains("sqlite") || value.contains("base locale") {
            ("PREFERENCES_SAVE_FAILED", "Impossible d'enregistrer vos préférences.")
        } else if value.contains("mise à jour") && value.contains("version disponible a changé") {
            ("UPDATE_CHECK_FAILED", "La version disponible a changé. Vérifiez à nouveau les mises à jour.")
        } else if (value.contains("mise à jour") || value.contains("mise a jour")) && (value.contains("download") || value.contains("install")) {
            ("UPDATE_INSTALL_FAILED", "La mise à jour n'a pas pu être installée.")
        } else if value.contains("mise à jour") || value.contains("mise a jour") || value.contains("updater") {
            ("UPDATE_CHECK_FAILED", "Impossible de vérifier les mises à jour pour le moment.")
        } else if value.contains("restart") || value.contains("redémarrage") || value.contains("redemarrage") {
            ("ENVIRONMENT_RESTART_FAILED", "L'environnement n'a pas pu redémarrer. Réessayez.")
        } else if value.contains("stop") || value.contains("arrêt") || value.contains("arret") {
            ("ENVIRONMENT_STOP_FAILED", "L'environnement n'a pas pu être arrêté. Réessayez.")
        } else if value.contains("service") && (value.contains("failed") || value.contains("error") || value.contains("échou")) {
            ("SERVICE_ACTION_FAILED", "Une action sur le service n'a pas pu être effectuée.")
        } else if value.contains("start") || value.contains("démarrer") || value.contains("démarrage") || value.contains("demarrage") || value.contains(" up ") {
            ("ENVIRONMENT_START_FAILED", "L'environnement n'a pas pu démarrer. Consultez les détails pour en savoir plus.")
        } else {
            ("UNKNOWN_ERROR", "Une erreur inattendue s'est produite. Réessayez ou consultez les détails techniques.")
        }
    }
}

impl From<String> for AppError {
    fn from(details: String) -> Self {
        let (code, message) = Self::classify(&details);
        Self::new(code, message, Some(details))
    }
}
impl From<&str> for AppError {
    fn from(details: &str) -> Self { details.to_string().into() }
}
impl fmt::Display for AppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result { write!(formatter, "{}", self.message) }
}
impl std::error::Error for AppError {}

#[cfg(test)]
mod tests {
    use super::AppError;

    #[test]
    fn maps_docker_daemon_failures_to_a_stable_code_and_safe_message() {
        let details = "Cannot connect to the Docker daemon: /var/run/docker.sock".to_string();
        let error = AppError::from(details.clone());
        assert_eq!(error.code, "DOCKER_UNAVAILABLE");
        assert_eq!(error.details.as_deref(), Some(details.as_str()));
        assert!(!error.message.contains("/var/run/docker.sock"));
    }

    #[test]
    fn unknown_errors_keep_diagnostics_separate_from_the_user_message() {
        let details = "SECRET_INTERNAL_TRACE".to_string();
        let error = AppError::from(details.clone());
        assert_eq!(error.code, "UNKNOWN_ERROR");
        assert_eq!(error.details.as_deref(), Some(details.as_str()));
        assert!(!error.message.contains(&details));
    }
}
