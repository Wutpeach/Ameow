//! Split the approved vector without changing its paths, gradients or paint order.
pub const LIGHT: &str = include_str!("../assets/mascot/light.svg");
pub const NIGHT: &str = include_str!("../assets/mascot/night.svg");

pub struct Parts<'a> { pub head: &'a str, pub perch: &'a str, pub paws: &'a str, pub defs: &'a str }
impl<'a> Parts<'a> {
    pub fn new(source: &'a str) -> Self {
        let head = source.find(r#"<g id="head""#).expect("approved head");
        let perch = source.find(r#"<g id="perch-a""#).expect("approved perch");
        let end = source.rfind("</g>").expect("approved root clip group");
        let defs = source.find("<defs>").expect("approved definitions");
        Self { head: &source[head..group_end(source, head)],
            perch: &source[perch..group_end(source, perch)],
            paws: &source[group_end(source, perch)..end],
            defs: &source[defs..source.find("</defs>").unwrap() + 7] }
    }
    pub fn document(&self, body: &str) -> String {
        format!(r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="60" height="60" viewBox="0 0 60 60" fill="none">{}{body}</svg>"#, self.defs)
    }
}
fn group_end(source: &str, start: usize) -> usize {
    let mut depth = 0;
    for (offset, _) in source[start..].match_indices('<') {
        let at = start + offset;
        if source[at..].starts_with("<g ") { depth += 1; }
        else if source[at..].starts_with("</g>") {
            depth -= 1;
            if depth == 0 { return at + 4; }
        }
    }
    panic!("embedded vector group must close")
}

/// Offline authored preview only. Production translates cached layers in its shared carrier.
#[cfg(test)]
pub fn composed(source: &str, scene: crate::mascot_reveal::Scene) -> String {
    let p = Parts::new(source);
    let clip = if source == NIGHT { "clip0_5_277" } else { "clip0_5_276" };
    let paws = if scene.paws_y >= 8. { String::new() }
    else if scene.paws_y == 0. && scene.perch_y == 0. { p.paws.to_owned() } else {
        format!(r#"<g clip-path="url(#reveal-paws)"><g transform="translate(0 {})">{}</g></g>"#, scene.perch_y + scene.paws_y, p.paws)
    };
    let body = format!(r#"<defs><clipPath id="reveal-paws"><rect width="60" height="{}"/></clipPath></defs><g clip-path="url(#{clip})"><g opacity="{}" transform="translate(0 {})">{}</g><g transform="translate(0 {})">{}</g>{paws}</g>"#,
        41. + scene.perch_y, scene.head_alpha, scene.head_y, p.head, scene.perch_y, p.perch);
    p.document(&body)
}
