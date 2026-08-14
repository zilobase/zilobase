fn main() {
    println!("cargo:rerun-if-env-changed=GOOGLE_DESKTOP_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=GOOGLE_DESKTOP_CLIENT_SECRET");
    tauri_build::build()
}
