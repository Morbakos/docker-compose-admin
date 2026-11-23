use tauri_specta::{collect_commands, Builder};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
#[specta::specta]
fn greet(name: &str, local_date_time: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust! \n
		It is currently {}", name, local_date_time)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

	let builder = Builder::new()
        // Then register them (separated by a comma)
        .commands(collect_commands![greet,]);

    #[cfg(debug_assertions)]
	builder
		.export(Typescript::default(), "../src/app/bindings.ts")
		.expect("Failed to export typescript bindings");


    // tauri::Builder::default()
    //     .plugin(tauri_plugin_opener::init())
    //     .invoke_handler(tauri::generate_handler![greet])
    //     .run(tauri::generate_context!())
    //     .expect("error while running tauri application");

	tauri::Builder::default()
		.invoke_handler(builder.invoke_handler())
		.setup(move |app| {
			builder.mount_events(app);
			Ok(())
		})
		.run(tauri::generate_context!())
		.expect("error while running tauri application");
}
