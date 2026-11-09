//! Current executable's offline notices. No installation-directory or network lookup.
pub static TEXT: &str = include_str!(concat!(env!("OUT_DIR"), "/third_party_notices.txt"));
