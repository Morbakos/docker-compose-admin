use std::path::PathBuf;

use specta_typescript::Typescript;

fn main() {
    let output = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../src/app/bindings.ts");

    docker_compose_admin_lib::specta_builder()
        .export(Typescript::default(), output)
        .expect("failed to export Tauri bindings");
}
