const MIN_WINDOW_OPACITY: f64 = 0.6;

#[tauri::command]
pub(crate) fn set_window_opacity(window: tauri::WebviewWindow, opacity: f64) -> Result<(), String> {
    let opacity = validate_window_opacity(opacity)?;
    set_native_window_opacity(&window, opacity)
}

fn validate_window_opacity(opacity: f64) -> Result<f64, String> {
    if opacity.is_finite() && (MIN_WINDOW_OPACITY..=1.0).contains(&opacity) {
        Ok(opacity)
    } else {
        Err(format!(
            "Window opacity must be between {MIN_WINDOW_OPACITY} and 1."
        ))
    }
}

#[cfg(target_os = "macos")]
fn set_native_window_opacity(window: &tauri::WebviewWindow, opacity: f64) -> Result<(), String> {
    let ns_window = window.ns_window().map_err(|error| error.to_string())?;
    let ns_window: &objc2_app_kit::NSWindow = unsafe { &*ns_window.cast() };
    ns_window.setAlphaValue(opacity);
    Ok(())
}

#[cfg(target_os = "linux")]
fn set_native_window_opacity(window: &tauri::WebviewWindow, opacity: f64) -> Result<(), String> {
    use gtk::prelude::WidgetExt;

    let gtk_window = window.gtk_window().map_err(|error| error.to_string())?;
    gtk_window.set_opacity(opacity);
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn set_native_window_opacity(_window: &tauri::WebviewWindow, _opacity: f64) -> Result<(), String> {
    Err("Window translucency is not supported on this platform.".to_string())
}

#[cfg(windows)]
fn set_native_window_opacity(window: &tauri::WebviewWindow, opacity: f64) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetLayeredWindowAttributes, SetWindowLongW, GWL_EXSTYLE, LWA_ALPHA,
        WS_EX_LAYERED,
    };

    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
    let alpha = (opacity * 255.0).round() as u8;
    unsafe {
        let extended_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        SetWindowLongW(hwnd, GWL_EXSTYLE, extended_style | WS_EX_LAYERED as i32);
        if SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA) == 0 {
            return Err("Windows could not update the window opacity.".to_string());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_window_opacity;

    #[test]
    fn window_opacity_stays_within_the_readable_range() {
        assert_eq!(validate_window_opacity(0.6), Ok(0.6));
        assert_eq!(validate_window_opacity(1.0), Ok(1.0));
        assert!(validate_window_opacity(0.59).is_err());
        assert!(validate_window_opacity(1.01).is_err());
        assert!(validate_window_opacity(f64::NAN).is_err());
    }
}
