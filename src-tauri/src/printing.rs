use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::{Value, json};

const MAX_PRINT_PDF_BYTES: usize = 100 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RefeedPreference {
    pub face: &'static str,
    pub leading_edge: &'static str,
}

pub fn validate_refeed(face: &str, leading_edge: &str) -> Result<RefeedPreference, String> {
    if !matches!(face, "faceUp" | "faceDown") || !matches!(leading_edge, "top" | "bottom") {
        return Err("Choose a valid manual duplex paper refeed preference.".into());
    }
    Ok(RefeedPreference {
        face: if face == "faceUp" {
            "faceUp"
        } else {
            "faceDown"
        },
        leading_edge: if leading_edge == "top" {
            "top"
        } else {
            "bottom"
        },
    })
}

pub fn duplex_for_mode(
    mode: &str,
    long_edge: Option<bool>,
    short_edge: Option<bool>,
) -> Result<Option<craft_print::Duplex>, String> {
    match mode {
        "printerDefault" => Ok(None),
        "oneSided" => Ok(Some(craft_print::Duplex::Off)),
        "longEdge" if long_edge == Some(true) => Ok(Some(craft_print::Duplex::LongEdge)),
        "shortEdge" if short_edge == Some(true) => Ok(Some(craft_print::Duplex::ShortEdge)),
        "longEdge" => Err("This printer does not report long-edge duplex support.".into()),
        "shortEdge" => Err("This printer does not report short-edge duplex support.".into()),
        _ => Err("Choose a supported duplex mode.".into()),
    }
}

#[cfg(windows)]
fn printer_capabilities(name: &str) -> (Option<bool>, Option<bool>) {
    use winprint::printer::PrinterDevice;
    use winprint::ticket::{FeatureOptionPackWithPredefined as _, PredefinedDuplexType};
    let Ok(devices) = PrinterDevice::all() else {
        return (None, None);
    };
    let Some(device) = devices.into_iter().find(|device| device.name() == name) else {
        return (None, None);
    };
    let Ok(capabilities) = winprint::ticket::PrintCapabilities::fetch(&device) else {
        return (None, None);
    };
    let mut long = false;
    let mut short = false;
    for duplex in capabilities.duplexes() {
        match duplex.as_predefined_name() {
            Some(PredefinedDuplexType::TwoSidedLongEdge) => long = true,
            Some(PredefinedDuplexType::TwoSidedShortEdge) => short = true,
            _ => {}
        }
    }
    (Some(long), Some(short))
}

#[cfg(not(windows))]
fn printer_capabilities(_: &str) -> (Option<bool>, Option<bool>) {
    (None, None)
}

#[cfg(windows)]
pub fn printers() -> Vec<Value> {
    craft_print::printers().into_iter().map(|printer| {
        let (long, short) = printer_capabilities(&printer.name);
        json!({"name":printer.name,"label":printer.description,"default":printer.default,"duplex":printer.two_sided,"longEdge":long,"shortEdge":short})
    }).collect()
}

#[cfg(not(windows))]
pub fn printers() -> Vec<Value> {
    Vec::new()
}

#[cfg(windows)]
pub fn open_properties(printer: &str) -> Result<(), String> {
    if !craft_print::printers()
        .iter()
        .any(|item| item.name == printer)
    {
        return Err("The selected printer is unavailable.".into());
    }
    std::process::Command::new("rundll32.exe")
        .args(["printui.dll,PrintUIEntry", "/e", "/n", printer])
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open printer properties: {error}"))
}

#[cfg(not(windows))]
pub fn open_properties(_: &str) -> Result<(), String> {
    Err("Windows printer properties are unavailable here.".into())
}

#[cfg(windows)]
pub fn submit_pdf(
    pdf_base64: &str,
    printer: &str,
    mode: &str,
    copies: u32,
    collate: bool,
) -> Result<String, String> {
    let pdf = STANDARD
        .decode(pdf_base64)
        .map_err(|_| "The print PDF is invalid.")?;
    if pdf.is_empty() || pdf.len() > MAX_PRINT_PDF_BYTES {
        return Err("The print PDF is empty or exceeds 100 MB.".into());
    }
    if !(1..=999).contains(&copies) {
        return Err("Copies must be between 1 and 999.".into());
    }
    if !craft_print::printers()
        .iter()
        .any(|item| item.name == printer)
    {
        return Err("The selected printer is unavailable.".into());
    }
    let (long_edge, short_edge) = printer_capabilities(printer);
    let duplex = duplex_for_mode(mode, long_edge, short_edge)?;
    craft_print::submit(
        &pdf,
        &craft_print::Job {
            printer: Some(printer.to_owned()),
            copies,
            collate,
            duplex,
            scaling: craft_print::Scaling::ShrinkToFit,
            grayscale: false,
            title: "WordCraft document".into(),
            options: Vec::new(),
        },
    )
    .map_err(|error| error.to_string())
}

#[cfg(windows)]
pub fn submit_manual_pass(pdf_base64: &str, printer: &str, pass: &str) -> Result<String, String> {
    let pdf = decode_pdf(pdf_base64)?;
    if !craft_print::printers()
        .iter()
        .any(|item| item.name == printer)
    {
        return Err("The selected printer is unavailable.".into());
    }
    let title = match pass {
        "front" => "WordCraft manual duplex front sides",
        "back" => "WordCraft manual duplex back sides",
        _ => return Err("Choose the front or back manual duplex pass.".into()),
    };
    craft_print::submit(
        &pdf,
        &craft_print::Job {
            printer: Some(printer.to_owned()),
            copies: 1,
            collate: true,
            duplex: Some(craft_print::Duplex::Off),
            scaling: craft_print::Scaling::ShrinkToFit,
            grayscale: false,
            title: title.into(),
            options: Vec::new(),
        },
    )
    .map_err(|error| error.to_string())
}

#[cfg(windows)]
fn decode_pdf(value: &str) -> Result<Vec<u8>, String> {
    let bytes = STANDARD
        .decode(value)
        .map_err(|_| "The manual duplex PDF is invalid.")?;
    if bytes.is_empty() || bytes.len() > MAX_PRINT_PDF_BYTES {
        return Err("The manual duplex PDF is empty or exceeds 100 MB.".into());
    }
    Ok(bytes)
}

#[cfg(not(windows))]
pub fn submit_pdf(_: &str, _: &str, _: &str, _: u32, _: bool) -> Result<String, String> {
    Err("Windows printing is unavailable here.".into())
}

#[cfg(not(windows))]
pub fn submit_manual_pass(_: &str, _: &str, _: &str) -> Result<String, String> {
    Err("Windows printing is unavailable here.".into())
}

pub fn refeed_preferences() -> Result<Value, String> {
    crate::storage::word_refeed_preferences()
}

pub fn save_refeed_preference(
    printer: &str,
    face: &str,
    leading_edge: &str,
) -> Result<Value, String> {
    if printer.trim().is_empty() || printer.len() > 1024 || printer.chars().any(char::is_control) {
        return Err("The selected printer name is invalid.".into());
    }
    let preference = validate_refeed(face, leading_edge)?;
    crate::storage::save_word_refeed_preference(printer, preference.face, preference.leading_edge)?;
    refeed_preferences()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selected_duplex_mode_maps_to_the_spooler_setting() {
        assert_eq!(duplex_for_mode("printerDefault", None, None).unwrap(), None);
        assert_eq!(
            duplex_for_mode("oneSided", None, None).unwrap(),
            Some(craft_print::Duplex::Off)
        );
        assert_eq!(
            duplex_for_mode("longEdge", Some(true), Some(false)).unwrap(),
            Some(craft_print::Duplex::LongEdge)
        );
        assert_eq!(
            duplex_for_mode("shortEdge", Some(false), Some(true)).unwrap(),
            Some(craft_print::Duplex::ShortEdge)
        );
        assert!(duplex_for_mode("longEdge", None, Some(true)).is_err());
        assert!(duplex_for_mode("shortEdge", Some(true), None).is_err());
    }

    #[test]
    fn refeed_preferences_accept_only_supported_orientations() {
        assert_eq!(
            validate_refeed("faceUp", "top").unwrap(),
            RefeedPreference {
                face: "faceUp",
                leading_edge: "top"
            }
        );
        assert_eq!(
            validate_refeed("faceDown", "bottom").unwrap(),
            RefeedPreference {
                face: "faceDown",
                leading_edge: "bottom"
            }
        );
        assert!(validate_refeed("sideways", "top").is_err());
        assert!(validate_refeed("faceUp", "left").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn installed_printer_capabilities_have_the_bridge_shape() {
        let discovered = printers();
        println!("{}", Value::Array(discovered.clone()));
        for printer in discovered {
            assert!(
                printer["name"]
                    .as_str()
                    .is_some_and(|name| !name.is_empty())
            );
            assert!(printer["default"].is_boolean());
            for capability in ["longEdge", "shortEdge"] {
                assert!(printer[capability].is_boolean() || printer[capability].is_null());
            }
        }
    }
}
