fn main() {
    println!("cargo:rerun-if-env-changed=GOOGLE_DESKTOP_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=GOOGLE_DESKTOP_CLIENT_SECRET");
    println!("cargo:rerun-if-env-changed=ZILOBASE_DESKTOP_API_URL");
    tauri_build::build()
}
