#![allow(dead_code)]
#[path = "../src/mascot_reveal.rs"]
mod mascot_reveal;
#[path = "../src/mascot_layers.rs"]
mod mascot_layers;
#[path = "../src/model.rs"]
mod model;
#[path = "../src/repair_motion.rs"]
mod repair_motion;
#[path = "../src/mascot_motion.rs"]
mod mascot_motion;
#[path = "../src/mascot.rs"]
mod mascot;
#[path = "../src/mascot_scene.rs"]
mod mascot_scene;
#[path = "../src/tokens.rs"]
mod tokens;

use gpui::{size, DevicePixels, SvgRenderer, SvgSize};
use std::{fs, io::Write, sync::Arc};

#[test]
fn layers_keep_both_approved_resting_compositions_and_hidden_endpoints() {
    let renderer = SvgRenderer::new(Arc::new(()));
    for source in [mascot_layers::LIGHT, mascot_layers::NIGHT] {
        for scale in [1, 2] {
            let render = |svg: &str| {
                let parsed = renderer.parse_svg(svg.as_bytes()).unwrap();
                renderer.render_parsed(&parsed, SvgSize::ExactSize(size(DevicePixels(60 * scale), DevicePixels(60 * scale)))).unwrap()
            };
            let original = render(source);
            let rest = render(&mascot_layers::composed(source, mascot_reveal::scene(1.)));
            let differences = original.as_bytes(0).unwrap().iter().zip(rest.as_bytes(0).unwrap()).filter(|(a,b)| a != b).count();
            assert_eq!(differences, 0, "rest is the approved composition at scale {scale}");
            let hidden = render(&mascot_layers::composed(source, mascot_reveal::scene(0.)));
            assert!(hidden.as_bytes(0).unwrap().iter().all(|byte| *byte == 0), "no cat or perch before entry");
        }
    }
}

#[test]
fn cached_layers_preserve_the_surface_mask_rest_and_hidden_endpoints() {
    let renderer = SvgRenderer::new(Arc::new(()));
    for (source, night) in [(mascot_layers::LIGHT, false), (mascot_layers::NIGHT, true)] {
        let scale = 1.25;
        let mut mascot = mascot::Mascot::new(0);
        let surface = mascot::SurfaceFrame::new(model::Geometry::at(0.));
        let mut render = |progress| mascot.compose_frame(night, surface, 1., mascot_reveal::scene(progress), scale, &renderer);
        let rest = mascot::straight_bgra(render(1.));
        let original = renderer.render_single_frame(source.as_bytes(), scale).unwrap();
        let whole = mascot::prepared_pixels(&original);
        let baseline = mascot::straight_bgra(surface.compose(Some(&whole), 1., night, scale));
        assert!(rest.chunks_exact(4).zip(baseline.chunks_exact(4)).all(|(a,b)| a[3] == b[3]), "shared circle coverage must not change");
        assert!(rest == baseline, "rest must reuse the accepted whole-rig rendering");
        let hidden = mascot::straight_bgra(render(0.));
        let empty = mascot::straight_bgra(surface.compose(None, 0., night, scale));
        assert!(hidden == empty, "no hidden head, paws or sill may leak into the surface");
    }
}

#[test]
fn visible_paws_grip_the_rising_sill_before_any_readable_head() {
    let renderer = SvgRenderer::new(Arc::new(()));
    for night in [false, true] {
        for scale in [1., 2.] {
            let mut mascot = mascot::Mascot::new(0);
            let surface = mascot::SurfaceFrame::new(model::Geometry::at(0.));
            let empty = mascot::straight_bgra(surface.compose(None, 0., night, scale));
            let width = (surface.side(scale) * scale).round() as usize;
            // Require readable contrast in each paw, not just an AA crumb or a channel start.
            let visible = |a: &[u8], b: &[u8], half: Option<bool>| a.chunks_exact(4).zip(b.chunks_exact(4)).enumerate()
                .filter(|(i, (a, b))| half.is_none_or(|left| (*i % width < width / 2) == left)
                    && a[..3].iter().zip(&b[..3]).any(|(a, b)| a.abs_diff(*b) >= 8))
                .count() >= (4. * scale * scale) as usize;
            let (mut first_sill, mut first_paws, mut first_head) = (None, None, None);
            for ms in (0..=400).step_by(8) {
                let scene = mascot_reveal::scene(ms as f64 / mascot_reveal::ENTER_MS);
                let sill = mascot::straight_bgra(mascot.compose_frame(night, surface, 1., mascot_reveal::Scene { head_alpha: 0., paws_y: 10., ..scene }, scale, &renderer));
                let paws = mascot::straight_bgra(mascot.compose_frame(night, surface, 1., mascot_reveal::Scene { head_alpha: 0., ..scene }, scale, &renderer));
                let role = mascot::straight_bgra(mascot.compose_frame(night, surface, 1., scene, scale, &renderer));
                if first_sill.is_none() && visible(&sill, &empty, None) { first_sill = Some(ms); }
                let both_paws = visible(&paws, &sill, Some(true)) && visible(&paws, &sill, Some(false));
                if first_paws.is_none() && both_paws { first_paws = Some(ms); }
                if first_head.is_none() && visible(&role, &paws, None) { first_head = Some(ms); }
                if (96..=128).contains(&ms) {
                    assert!(both_paws && role == paws, "the load phase must show both gripping paws and no head");
                }
            }
            let sill = first_sill.expect("the sill must visibly lead");
            let paws = first_paws.expect("both paws must become visible");
            let head = first_head.expect("the pull must reveal the head");
            let at_paws = mascot_reveal::scene(paws as f64 / mascot_reveal::ENTER_MS);
            eprintln!("visible grip night={night} scale={scale}: sill={sill}ms paws={paws}ms head={head}ms sill_remaining={}px", at_paws.perch_y);
            assert!(sill < paws && paws - sill <= 64 && paws + 32 <= head, "visible sill, paws, load, then head");
            assert!(at_paws.perch_y >= 3., "paws must reach while the sill is still rising");
        }
    }
}

#[test]
fn gripping_paws_keep_their_pixel_contact_with_the_sill_through_the_pull() {
    let renderer = SvgRenderer::new(Arc::new(()));
    for night in [false, true] {
        for scale in [1., 2.] {
            let mut mascot = mascot::Mascot::new(0);
            let surface = mascot::SurfaceFrame::new(model::Geometry::at(0.));
            let width = (surface.side(scale) * scale).round() as usize;
            let origin = mascot_reveal::local_origin(surface.native, surface.surface) * scale;
            let unit = mascot_reveal::local_side(surface.surface) / 60. * scale;
            let mut contacts = [Vec::new(), Vec::new()];
            for ms in [88, 112, 160, 224, 320] {
                let scene = mascot_reveal::scene(ms as f64 / mascot_reveal::ENTER_MS);
                let sill = mascot::straight_bgra(mascot.compose_frame(night, surface, 1., mascot_reveal::Scene { head_alpha: 0., paws_y: 10., ..scene }, scale, &renderer));
                let paws = mascot::straight_bgra(mascot.compose_frame(night, surface, 1., mascot_reveal::Scene { head_alpha: 0., ..scene }, scale, &renderer));
                for (half, points) in contacts.iter_mut().enumerate() {
                    let ys: Vec<f32> = paws.chunks_exact(4).zip(sill.chunks_exact(4)).enumerate()
                        .filter(|(i, (a, b))| (*i % width >= width / 2) == (half == 1)
                            && a[..3].iter().zip(&b[..3]).any(|(a, b)| a.abs_diff(*b) >= 8))
                        .map(|(i, _)| (i / width) as f32 + 0.5).collect();
                    assert!(ys.len() >= (4. * scale * scale) as usize, "both paws must grip throughout the pull");
                    let local_contact = (ys.iter().sum::<f32>() / ys.len() as f32 - origin) / unit - scene.perch_y;
                    assert!((35. ..40.).contains(&local_contact), "paw contact must stay at the authored sill edge");
                    points.push(local_contact);
                }
            }
            for contact in contacts {
                let low = contact.iter().copied().fold(f32::INFINITY, f32::min);
                let high = contact.iter().copied().fold(f32::NEG_INFINITY, f32::max);
                eprintln!("contact night={night} scale={scale}: drift={} source px", high - low);
                assert!(high - low < 0.5, "the paw must follow the rising sill, not float in window coordinates");
            }
        }
    }
}

#[test]
fn entrance_blends_back_into_the_frozen_idle_without_chasing_hidden_time() {
    let mut idle = mascot_motion::Idle::new(4);
    idle.sample(0, true, false);
    idle.sample(3000, true, false);
    let frozen = idle.sample(3050, true, false).0;
    assert!(frozen.blink > 0.);
    for (now, progress) in [(3060, 0.), (10000, 0.85), (10110, 1.)] {
        let pose = idle.sample(now, false, false).0;
        assert_eq!(pose, frozen);
        let blended = mascot_scene::idle_pose(pose, mascot_reveal::scene(progress).idle_weight);
        if progress == 0. { assert_eq!(blended, mascot_motion::Pose::default()); }
        if progress == 1. { assert_eq!(blended, frozen); }
    }
    assert_eq!(idle.sample(10120, true, false).0, frozen);
    assert_ne!(idle.sample(10140, true, false).0, frozen);
}

#[test]
fn compact_startup_first_visible_pixels_are_role_free_without_window_travel() {
    let renderer = SvgRenderer::new(Arc::new(()));
    for night in [false, true] {
        for scale in [1., 2.] {
            let mut model = model::Model::new(0, false);
            let initial = model.geometry();
            let mut reveal = mascot_reveal::Reveal::startup();
            let mut mascot = mascot::Mascot::new(0);
            reveal.sample(5000, false, 0., false, false);
            for (now, first_visible) in [(10000, true), (10016, false)] {
                model.tick(now);
                assert_eq!(mascot::SurfaceFrame::new(model.geometry()), mascot::SurfaceFrame::new(initial), "startup must not synthesize window travel");
                reveal.sample(now, model.target_full, model.fullness, true, false);
                let frame = mascot::SurfaceFrame::new(model.geometry());
                let pixels = mascot::straight_bgra(mascot.compose_frame(night, frame, reveal.alpha(), mascot_reveal::scene(reveal.progress), scale, &renderer));
                let empty = mascot::straight_bgra(frame.compose(None, 0., night, scale));
                if first_visible {
                    assert!(pixels == empty, "first visible startup frame must not flash the resting cat");
                    assert_eq!(reveal.progress, 0.);
                    assert_eq!(mascot.prepare_us, 0, "hidden startup must not prepare a resting role");
                } else {
                    assert!(pixels != empty, "the accepted entrance must advance after visibility");
                    assert!(reveal.progress > 0. && reveal.progress < 0.04);
                }
            }
        }
    }
}

#[test]
fn full_target_first_frame_removes_cached_partial_and_resting_role_pixels() {
    let renderer = SvgRenderer::new(Arc::new(()));
    let scale = 1.25;
    for night in [false, true] {
        for progress in [0.85, 1.] {
            let mut reveal = mascot_reveal::Reveal::default();
            reveal.sample(0, true, 1., true, false);
            reveal.sample(0, false, 0., true, false);
            let now = (mascot_reveal::ENTER_MS * progress) as u64;
            reveal.sample(now, false, 0., true, false);
            let mut mascot = mascot::Mascot::new(0);
            let compact = mascot::SurfaceFrame::new(model::Geometry::at(0.));
            let visible = mascot::straight_bgra(mascot.compose_frame(night, compact, reveal.alpha(), mascot_reveal::scene(reveal.progress), scale, &renderer));
            let empty = mascot::straight_bgra(compact.compose(None, 0., night, scale));
            assert!(visible != empty, "the regression must start from a visible cached role");
            assert_eq!(reveal.sample(now, true, 0., true, false), None);
            assert_eq!((reveal.progress, reveal.alpha()), (0., 0.));
            for fullness in [0., 0.5, 1.] {
                assert_eq!(reveal.sample(now, true, fullness, false, false), None);
                let frame = mascot::SurfaceFrame::new(model::Geometry::at(fullness));
                let first_full = mascot::straight_bgra(mascot.compose_frame(night, frame, reveal.alpha(), mascot_reveal::scene(reveal.progress), scale, &renderer));
                assert_eq!(mascot.prepare_us, 0, "hiding must not prepare role sources");
                let baseline = mascot::straight_bgra(frame.compose(None, 0., night, scale));
                assert!(first_full == baseline, "Full target must remove cat, sill and paws in the same frame");
            }
        }
    }
}

#[test]
fn prepared_layer_opacity_preserves_occlusion() {
    let renderer = SvgRenderer::new(Arc::new(()));
    let scale = 1.25;
    let surface = mascot::SurfaceFrame::new(model::Geometry::at(0.5));
    let scene = mascot_reveal::scene(0.3);
    let mut mascot = mascot::Mascot::new(0);
    let opaque = mascot::straight_bgra(mascot.compose_frame(false, surface, 1., scene, scale, &renderer));
    let faded = mascot::straight_bgra(mascot.compose_frame(false, surface, 0.35, scene, scale, &renderer));
    let empty = mascot::straight_bgra(surface.compose(None, 0., false, scale));
    let width = (surface.side(scale) * scale).round() as usize;
    let center = (mascot_reveal::local_origin(surface.native, surface.surface) + 30.) * scale;
    for (i, ((a, b), base)) in opaque.chunks_exact(4).zip(faded.chunks_exact(4)).zip(empty.chunks_exact(4)).enumerate() {
        let x = (i % width) as f32 + 0.5 - center;
        let y = (i / width) as f32 + 0.5 - center;
        if x.hypot(y) > 27. * scale { continue; }
        for channel in 0..3 {
            let expected = (base[channel] as f32 + (a[channel] as f32 - base[channel] as f32) * 0.35).round() as u8;
            assert!(b[channel].abs_diff(expected) <= 3, "foreground must occlude the cat before group opacity; pixel {i}");
        }
    }
}

#[test]
fn prepared_local_motion_has_bounded_sources_and_reports_composition_cost() {
    let renderer = SvgRenderer::new(Arc::new(()));
    let scale = 2.;
    let mut mascot = mascot::Mascot::new(0);
    let surface = mascot::SurfaceFrame::new(model::Geometry::at(0.));
    mascot.compose_frame(false, surface, 1., mascot_reveal::scene(1.), scale, &renderer);
    let rest_prepare = mascot.prepare_us;
    mascot.compose_frame(false, surface, 1., mascot_reveal::scene(0.), scale, &renderer);
    let layer_prepare = mascot.prepare_us;
    let mut times = Vec::new();
    for elapsed in (0..=mascot_reveal::ENTER_MS as u64).step_by(16) {
        let start = std::time::Instant::now();
        let pixels = mascot.compose_frame(false, surface, 1., mascot_reveal::scene(elapsed as f64 / mascot_reveal::ENTER_MS), scale, &renderer);
        assert_eq!(pixels.width(), 160);
        assert_eq!(mascot.prepare_us, 0, "local timeline frames must reuse prepared sources");
        times.push(start.elapsed().as_micros());
    }
    times.sort_unstable();
    eprintln!("cached 3-layer composition @2x: median={}us p95={}us max={}us (debug CPU, not native present)", times[times.len()/2], times[times.len()*95/100], times.last().unwrap());
    eprintln!("cold source preparation @2x: whole={rest_prepare}us layers={layer_prepare}us (one miss, not cached composition)");
}

/// Explicit export, not a native UI test; no desktop, clicks or recording.
#[test]
#[ignore]
fn export_authored_motion_preview() {
    let directory = std::path::PathBuf::from(std::env::var_os("AMEOW_REVEAL_PREVIEW_DIR").expect("explicit output directory"));
    fs::create_dir_all(&directory).unwrap();
    let renderer = SvgRenderer::new(Arc::new(()));
    for (theme, night) in [("light", false), ("night", true)] {
        // Stream to the existing external preview encoder; never archive raw frame dumps.
        let background = if night { "color=c=0x111214:s=560x560:r=60" } else { "color=c=0xe5e6e8:s=560x560:r=60" };
        let mut encoder = std::process::Command::new("ffmpeg")
            .args(["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pixel_format", "bgra", "-video_size", "560x560", "-framerate", "60", "-i", "pipe:0", "-f", "lavfi", "-i", background, "-filter_complex", "[1:v][0:v]overlay=shortest=1:format=auto,format=yuv420p", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-movflags", "+faststart"])
            .arg(directory.join(format!("{theme}.mp4")))
            .stdin(std::process::Stdio::piped()).spawn().expect("ffmpeg for explicit offline preview");
        let mut output = encoder.stdin.take().unwrap();
        let mut trace = fs::File::create(directory.join(format!("{theme}.csv"))).unwrap();
        writeln!(trace, "ms,target_full,fullness,surface,progress,alpha,reveal_delay,perch_y,head_y,paws_y").unwrap();
        let mut motion = repair_motion::Motion::new(0);
        motion.tick(0, true, true);
        let mut reveal = mascot_reveal::Reveal::default();
        reveal.sample(0, true, 1., true, false);
        let mut mascot = mascot::Mascot::new(0);
        for frame in 0..180 {
            let now = frame * 1000 / 60;
            let full = !(350..2000).contains(&now);
            motion.tick(now, full, false);
            let g = motion.geometry();
            let delay = reveal.sample(now, full, motion.x, true, false);
            let s = mascot_reveal::scene(reveal.progress);
            let opacity = reveal.alpha();
            if full { assert_eq!((reveal.progress, opacity, delay), (0., 0., None)); }
            let surface = mascot::SurfaceFrame::new(g);
            let image = mascot.compose_frame(night, surface, opacity, s, 2., &renderer);
            let side = image.width() as usize;
            let bytes = mascot::straight_bgra(image);
            let position = g.origin([42., 42.]);
            let origin_x = (position[0] * 2.).round() as usize;
            let origin_y = (position[1] * 2.).round() as usize;
            let mut canvas = vec![0u8; 560 * 560 * 4];
            for y in 0..side {
                let destination = ((origin_y + y) * 560 + origin_x) * 4;
                canvas[destination..destination + side * 4].copy_from_slice(&bytes[y * side * 4..(y + 1) * side * 4]);
            }
            output.write_all(&canvas).unwrap();
            writeln!(trace, "{now},{full},{},{},{},{},{},{},{},{}", motion.x, g.surface, reveal.progress, opacity, delay.map(|value| value.to_string()).unwrap_or_default(), s.perch_y, s.head_y, s.paws_y).unwrap();
        }
        drop(output);
        assert!(encoder.wait().unwrap().success(), "offline preview encoding");
    }
}
