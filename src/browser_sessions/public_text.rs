//! Attempt credentials only; never serialized or formatted as diagnostics.
use super::{Attempt, MAX_DATABASE, Result, storage};
use std::{collections::BTreeSet, fs::File, io::Read};

impl Attempt {
    pub fn public_text(&self, text: &str) -> Result<String> {
        // Keep the original browser values as well as CookieJar updates made by the engine.
        let mut values: BTreeSet<String> = self.values.iter().cloned().collect();
        let file = File::open(&self.path).map_err(|_| storage())?;
        if file.metadata().map_err(|_| storage())?.len() > MAX_DATABASE {
            return Err(storage());
        }
        let mut jar = String::new();
        file.take(MAX_DATABASE + 1)
            .read_to_string(&mut jar)
            .map_err(|_| storage())?;
        if jar.len() as u64 > MAX_DATABASE {
            return Err(storage());
        }
        for line in jar
            .lines()
            .filter(|s| !s.starts_with('#') || s.starts_with("#HttpOnly_"))
        {
            if let Some(value) = line.splitn(7, '\t').nth(6) {
                if value.len() > 16384 {
                    return Err(storage());
                }
                values.insert(value.to_owned());
            }
        }
        Ok(redact(text, values))
    }
}
fn redact(text: &str, values: BTreeSet<String>) -> String {
    // An oversized free label is not needed for naming; do not scan or truncate secrets in it.
    if text.len() > 8192 {
        return "[redacted]".into();
    }
    let mut patterns = BTreeSet::new();
    for value in values.into_iter().filter(|s| !s.is_empty()) {
        // Cover ordinary URL/form presentation without a site or cookie-name allowlist.
        let encoded: String = value
            .bytes()
            .map(|b| {
                if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
                    (b as char).to_string()
                } else {
                    format!("%{b:02X}")
                }
            })
            .collect();
        patterns.insert(encoded.replace("%20", "+"));
        patterns.insert(encoded);
        patterns.insert(value);
    }
    let mut patterns: Vec<_> = patterns.into_iter().collect();
    patterns.sort_by_key(|s| std::cmp::Reverse(s.len()));
    let mut rest = text;
    let mut result = String::new();
    let mut count = 0;
    // Match before shortening: a credential crossing the title limit must not leak a prefix.
    // Replacement text is emitted once, never reinterpreted as another credential.
    while !rest.is_empty() && count < 160 {
        if let Some(pattern) = patterns.iter().find(|p| rest.starts_with(p.as_str())) {
            let mut end = pattern.len();
            let mut cursor = rest.chars().next().unwrap().len_utf8();
            while cursor < end {
                if let Some(overlap) = patterns
                    .iter()
                    .find(|p| rest[cursor..].starts_with(p.as_str()))
                {
                    end = end.max(cursor + overlap.len());
                }
                cursor += rest[cursor..].chars().next().unwrap().len_utf8();
            }
            let replacement: String = "[redacted]".chars().take(160 - count).collect();
            count += replacement.chars().count();
            result.push_str(&replacement);
            rest = &rest[end..];
        } else {
            let c = rest.chars().next().unwrap();
            if c.is_whitespace() {
                if !result.is_empty() && !result.ends_with(' ') {
                    result.push(' ');
                    count += 1;
                }
            } else if !c.is_control() {
                result.push(c);
                count += 1;
            }
            rest = &rest[c.len_utf8()..];
        }
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn credential_echoes_are_removed_before_normalization_or_shortening() {
        let values = BTreeSet::from(["opaque-Credential-r7s9".into(), "alpha+beta/secret".into()]);
        assert_eq!(redact("雨后的小猫 2026", values.clone()), "雨后的小猫 2026");
        assert_eq!(
            redact("clip opaque-Credential-r7s9 part", values.clone()),
            "clip [redacted] part"
        );
        assert_eq!(
            redact("alpha%2Bbeta%2Fsecret", values.clone()),
            "[redacted]"
        );
        let value = redact(
            &format!("{}opaque-Credential-r7s9", "猫".repeat(155)),
            values,
        );
        assert!(!value.contains("opaque"));
        assert_eq!(
            redact("abcabc", BTreeSet::from(["abc".into(), "ab".into()])),
            "[redacted][redacted]"
        );
        assert_eq!(
            redact("abcdef", BTreeSet::from(["abc".into(), "bcdef".into()])),
            "[redacted]"
        );
        assert_eq!(
            redact(&format!("{}normal title", " ".repeat(500)), BTreeSet::new()),
            "normal title"
        );
    }
}
