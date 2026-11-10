//! About's local, virtualized reader for the current executable's notice text.
use super::{ButtonStyle, Page, SettingsWindow};
use crate::{tokens::Palette, ui_text::Language};
use gpui::{prelude::*, *};
use std::sync::OnceLock;

fn lines() -> &'static Vec<&'static str> {
    static LINES: OnceLock<Vec<&'static str>> = OnceLock::new();
    LINES.get_or_init(|| ameow_next::third_party_notices::TEXT.lines().collect())
}

impl SettingsWindow {
    pub(super) fn open_notices(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.notices_open = true;
        self.notices_copied = None;
        self.notices_scroll.scroll_to(ListOffset::default());
        self.scroll.set_offset(point(px(0.), px(0.)));
        window.focus(&self.notices_focus, cx);
        cx.notify();
    }

    pub(super) fn close_notices(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.notices_open = false;
        if let Some(focus) = self.control_focus.borrow().get("third-party-licenses") {
            window.focus(focus, cx);
        }
        cx.notify();
    }

    pub(super) fn notices_key(
        &mut self,
        key: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.page != Page::About || !self.notices_open {
            return false;
        }
        if key == "escape" {
            self.close_notices(window, cx);
            return true;
        }
        if !self.notices_focus.is_focused(window) {
            return false;
        }
        let index = self.notices_scroll.logical_scroll_top().item_ix;
        let target = match key {
            "home" => 0,
            "end" => lines().len() - 1,
            "up" => index.saturating_sub(1),
            "down" => (index + 1).min(lines().len() - 1),
            "pageup" => index.saturating_sub(12),
            "pagedown" | "space" => (index + 12).min(lines().len() - 1),
            _ => return false,
        };
        self.notices_scroll.scroll_to(ListOffset {
            item_ix: target,
            offset_in_item: px(0.),
        });
        cx.notify();
        true
    }

    pub(super) fn notices_page(&self, cx: &mut Context<Self>) -> AnyElement {
        let l: Language = self.projection.language;
        let p = Palette::new(self.projection.night);
        div()
            .size_full()
            .flex()
            .flex_col()
            .child(self.page_header(
                l.text("第三方许可", "Third-party licenses"),
                l.text(
                    "随当前版本提供，可离线阅读。",
                    "Included with this version. Available offline.",
                ),
            ))
            .child(
                div()
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_between()
                    .mb(px(12.))
                    .child(self.button(
                        "close-notices",
                        l.text("返回", "Back"),
                        true,
                        ButtonStyle::Quiet,
                        cx,
                        |this, window, cx| this.close_notices(window, cx),
                    ))
                    .child(self.button(
                        "copy-notices",
                        if self.notices_copied == Some(true) {
                            l.text("已复制", "Copied")
                        } else {
                            l.text("复制全文", "Copy all")
                        },
                        true,
                        ButtonStyle::Quiet,
                        cx,
                        |this, window, cx| {
                            this.notices_copied = Some(
                                crate::tray::copy_text(
                                    super::hwnd(window),
                                    ameow_next::third_party_notices::TEXT,
                                )
                                .is_ok(),
                            );
                            cx.notify();
                        },
                    )),
            )
            .when(self.notices_copied == Some(false), |s| {
                s.child(
                    div()
                        .text_color(super::error_text(p))
                        .mb(px(8.))
                        .child(l.text("无法复制，请重试。", "Could not copy. Try again.")),
                )
            })
            .child(
                div()
                    .id("notices-reader")
                    .relative()
                    .flex_1()
                    .min_h(px(0.))
                    .min_w(px(0.))
                    .rounded(px(6.))
                    .border_1()
                    .border_color(p.control_border())
                    .overflow_hidden()
                    .track_focus(&self.notices_focus)
                    .when(self.keyboard_focus, |s| {
                        s.focus(move |s| s.border_color(p.blue))
                    })
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(|this, _, window, cx| window.focus(&this.notices_focus, cx)),
                    )
                    .child(
                        list(self.notices_scroll.clone(), |index, _, _| {
                            div()
                                .w_full()
                                .min_h(px(18.))
                                .px(px(12.))
                                .text_size(px(12.))
                                .line_height(px(18.))
                                .child(lines()[index])
                                .into_any_element()
                        })
                        .size_full(),
                    )
                    .child(
                        div()
                            .absolute()
                            .right(px(3.))
                            .top(px(4.))
                            .bottom(px(4.))
                            .w(px(3.))
                            .child(
                                canvas(
                                    {
                                        let scroll = self.notices_scroll.clone();
                                        move |_, _, _| scroll.logical_scroll_top().item_ix
                                    },
                                    move |bounds, index, window, _| {
                                        let height = px(24.).min(bounds.size.height);
                                        let fraction =
                                            index as f32 / (lines().len() - 1).max(1) as f32;
                                        let origin = bounds.origin
                                            + point(
                                                px(0.),
                                                (bounds.size.height - height) * fraction,
                                            );
                                        window.paint_quad(fill(
                                            Bounds::new(origin, size(bounds.size.width, height)),
                                            p.neutral.opacity(0.4),
                                        ));
                                    },
                                )
                                .size_full(),
                            ),
                    ),
            )
            .into_any_element()
    }
}
