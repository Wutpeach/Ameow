//! Shared effective appearance and display language. Stored preferences remain in Settings.
use ameow_next::download::settings::{LanguagePreference, ThemePreference};
use windows_sys::Win32::{
    Globalization::GetUserDefaultUILanguage,
    System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RegGetValueW},
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Language {
    #[default]
    Chinese,
    English,
}
impl Language {
    pub fn text(self, zh: &'static str, en: &'static str) -> &'static str {
        match self {
            Self::Chinese => zh,
            Self::English => en,
        }
    }
    /// Translate application errors only. Never call this on titles, URLs or copied diagnostics.
    pub fn message(self, message: &str) -> String {
        if let Some((_, code)) = message.split_once(" failed (Windows error ") {
            return format!(
                "{}{}",
                self.text(
                    "Windows 操作失败，请检查权限。错误码：",
                    "Windows operation failed; check permissions. Error code: "
                ),
                code.trim_end_matches(')')
            );
        }
        if let Some(error) = message.strip_prefix("保存失败，默认设置未更改。") {
            return format!(
                "{}{}",
                self.text(
                    "保存失败，当前设置未更改。",
                    "Save failed; current settings are unchanged. "
                ),
                self.message(error)
            );
        }
        let direct = match message {
            "无法加载托盘图标，请重新打开 Ameow" => Some((message, "Cannot load the tray icon. Reopen Ameow.")),
            "托盘图标更新失败，请重新打开 Ameow" => Some((message, "Cannot update the tray icon. Reopen Ameow.")),
            "Ameow 已被 Windows 禁用，请在 Windows 设置的启动应用中启用 Ameow" => {
                Some((
                    message,
                    "Windows disabled Ameow at login. Enable it in Windows Settings > Startup apps.",
                ))
            }
            "无法识别 Windows 启动应用的批准状态" => Some((
                message,
                "Cannot read Windows startup approval. Check Windows Settings > Startup apps.",
            )),
            "无法读取 Windows 启动应用的批准状态" => Some((
                message,
                "Cannot read Windows startup approval. Check Windows Settings > Startup apps.",
            )),
            "Only public HTTP(S) video URLs without credentials are supported"
            | "Only public HTTP(S) media URLs without credentials are supported"
            | "Missing site host"
            | "Invalid site path"
            | "Playlist/series URLs do not identify one media object" => {
                Some(("请使用公开的单个媒体或作品链接。", message))
            }
            "Use a supported single video, Imgur image/album, or Bluesky image post URL" => Some((
                "请使用 YouTube/Bilibili 单视频、Imgur 图片/相册或 Bluesky 单帖图片链接。", message)),
            _ => None,
        };
        if let Some((zh, en)) = direct {
            return match self {
                Self::Chinese => zh,
                Self::English => en,
            }
            .to_string();
        }
        let code = message.split(':').next().unwrap_or(message);
        if code.starts_with("E_") {
            let pair = match code {
                "E_SETTINGS_READ" => Some((
                    "无法读取已保存设置，请检查设置文件与权限。",
                    "Cannot read saved settings. Check the settings file and permissions.",
                )),
                "E_SETTINGS_SAVE" => Some((
                    "设置未保存，请检查目录和设置文件的写入权限。",
                    "Settings were not saved. Check folder and settings-file permissions.",
                )),
                "E_DUPLICATE" => {
                    Some(("该视频已在下载队列中", "This video is already in the queue"))
                }
                "E_STORAGE" => Some((
                    "无法访问下载目录，请检查文件夹与权限。",
                    "Cannot access the download folder. Check the folder and permissions.",
                )),
                "E_NETWORK" | "E_NETWORK_ENGINE_ROUTE_UNSUPPORTED" => Some((
                    "网络连接不可用，请检查网络和代理设置。",
                    "Network connection unavailable. Check your connection and proxy settings.",
                )),
                "E_RUNTIME" | "E_RUNTIME_OWNER_LOST" => Some((
                    "下载组件尚未就绪，请检查诊断后重试。",
                    "Download components are not ready. Check diagnostics and retry.",
                )),
                "E_STOPPING" | "E_STOPPED" => Some((
                    "正在安全停止，暂不能执行此操作。",
                    "Safely stopping. This action is currently unavailable.",
                )),
                "E_URL" | "E_REQUEST" | "E_UNSUPPORTED" | "E_INPUT" => Some((
                    "链接无效或暂不支持，请复制受支持的视频链接。",
                    "Invalid or unsupported link. Copy a supported video link.",
                )),
                _ => None,
            };
            if let Some((zh, en)) = pair {
                return format!("{} ({code})", self.text(zh, en));
            }
        }
        message.to_owned()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SystemPreferences {
    pub night: bool,
    pub language: Language,
}
impl SystemPreferences {
    pub fn read() -> Self {
        let key: Vec<u16> = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let value: Vec<u16> = "AppsUseLightTheme".encode_utf16().chain(Some(0)).collect();
        let mut light: u32 = 1;
        let mut size = std::mem::size_of_val(&light) as u32;
        let status = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                key.as_ptr(),
                value.as_ptr(),
                RRF_RT_REG_DWORD,
                std::ptr::null_mut(),
                (&mut light as *mut u32).cast(),
                &mut size,
            )
        };
        let language_id = unsafe { GetUserDefaultUILanguage() };
        Self {
            night: status == 0 && light == 0,
            language: language_from_id(language_id),
        }
    }
    pub fn effective(
        self,
        theme: ThemePreference,
        language: LanguagePreference,
    ) -> (bool, Language) {
        (
            match theme {
                ThemePreference::System => self.night,
                ThemePreference::Light => false,
                ThemePreference::Dark => true,
            },
            match language {
                LanguagePreference::System => self.language,
                LanguagePreference::Chinese => Language::Chinese,
                LanguagePreference::English => Language::English,
            },
        )
    }
}
fn language_from_id(id: u16) -> Language {
    if id & 0x3ff == 4 {
        Language::Chinese
    } else {
        Language::English
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_choices_ignore_system_and_system_choices_follow_new_readings() {
        let light = SystemPreferences {
            night: false,
            language: Language::English,
        };
        let dark = SystemPreferences {
            night: true,
            language: Language::Chinese,
        };
        assert_eq!(
            light.effective(ThemePreference::System, LanguagePreference::System),
            (false, Language::English)
        );
        assert_eq!(
            dark.effective(ThemePreference::System, LanguagePreference::System),
            (true, Language::Chinese)
        );
        for system in [light, dark] {
            assert_eq!(
                system.effective(ThemePreference::Light, LanguagePreference::Chinese),
                (false, Language::Chinese)
            );
            assert_eq!(
                system.effective(ThemePreference::Dark, LanguagePreference::English),
                (true, Language::English)
            );
        }
        assert_eq!(language_from_id(0x0804), Language::Chinese);
        assert_eq!(language_from_id(0x0409), Language::English);
        assert_eq!(language_from_id(0x0411), Language::English);
        assert_eq!(language_from_id(0), Language::English);
    }
    #[test]
    fn display_errors_are_localized_but_unknown_content_is_preserved() {
        assert!(
            Language::Chinese
                .message("E_SETTINGS_SAVE: Cannot replace saved defaults")
                .contains("设置未保存")
        );
        assert!(
            Language::English
                .message("E_SETTINGS_SAVE: Cannot replace saved defaults")
                .contains("not saved")
        );
        assert!(
            Language::English
                .message("保存失败，默认设置未更改。E_SETTINGS_SAVE")
                .starts_with("Save failed;")
        );
        assert!(
            Language::English
                .message("Ameow 已被 Windows 禁用，请在 Windows 设置的启动应用中启用 Ameow")
                .starts_with("Windows disabled")
        );
        assert_eq!(
            Language::English.message("user-title 视频.mp4"),
            "user-title 视频.mp4"
        );
    }
}
