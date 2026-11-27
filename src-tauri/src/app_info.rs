use serde::Serialize;
use specta::Type;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;
use url::Url;

const UPDATE_ENDPOINT: &str =
    "https://github.com/Morbakos/docker-compose-admin/releases/latest/download/latest.json";

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    pub version: String,
    pub commit: String,
    pub updater_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn get_build_info() -> BuildInfo {
    BuildInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        commit: option_env!("GIT_COMMIT").unwrap_or("dev").to_string(),
        updater_enabled: option_env!("TAURI_UPDATER_PUBLIC_KEY")
            .is_some_and(|key| !key.trim().is_empty()),
    }
}

fn configured_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, crate::app_error::AppError> {
    let public_key = option_env!("TAURI_UPDATER_PUBLIC_KEY")
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| crate::app_error::AppError::from("La clé publique de mise à jour n'est pas configurée dans cette version."))?;

    app.updater_builder()
        .pubkey(public_key)
        .endpoints(vec![Url::parse(UPDATE_ENDPOINT).map_err(crate::app_error::AppError::from)?])
        .map_err(|error| error.to_string())?
        .build()
        .map_err(crate::app_error::AppError::from)
}

#[tauri::command]
#[specta::specta]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, crate::app_error::AppError> {
    let update = configured_updater(&app)?
        .check()
        .await
        .map_err(crate::app_error::AppError::from)?;

    Ok(update.map(|update| UpdateInfo {
        version: update.version,
        notes: update.body,
    }))
}

#[tauri::command]
#[specta::specta]
pub async fn install_update(app: AppHandle, expected_version: String) -> Result<(), crate::app_error::AppError> {
    let update = configured_updater(&app)?
        .check()
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Aucune mise à jour n'est actuellement disponible.".to_string())?;

    if update.version != expected_version {
        return Err("La version disponible a changé. Vérifiez à nouveau les mises à jour.".into());
    }

    update
        .download_and_install(|_chunk_length, _content_length| {}, || {})
        .await
        .map_err(|error| error.to_string())?;

    app.request_restart();
    Ok(())
}
