mod app_info;
mod compose;
mod docker;
mod project_manager;\nmod process_output;

use specta_typescript::Typescript;
use tauri_specta::{collect_commands, Builder};

pub fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        compose::pick_compose_directory,
        compose::scan_compose_directory,
        compose::run_compose_action,
        compose::start_compose_logs,
        compose::stop_compose_logs,
        docker::get_docker_engine_status,
        compose::get_compose_containers,
        compose::run_compose_service_action,
        app_info::get_build_info,
        app_info::check_for_update,
        app_info::install_update,
        project_manager::list_registered_projects,
        project_manager::add_registered_projects,
        project_manager::remove_registered_project,
        project_manager::save_project_compose_files,
        project_manager::save_project_services
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta_builder = specta_builder();

    #[cfg(debug_assertions)]
    specta_builder
        .export(Typescript::default(), "../src/app/bindings.ts")
        .expect("failed to export Tauri bindings");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app| {
            specta_builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
