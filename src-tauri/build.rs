fn main() {
    println!("cargo:rerun-if-env-changed=B6H_UPDATE_TRUST_ROOTS");
    if let Ok(roots) = std::env::var("B6H_UPDATE_TRUST_ROOTS") {
        println!("cargo:rustc-env=B6H_UPDATE_TRUST_ROOTS={roots}");
    }
    tauri_build::build()
}
