//! Rounded Full-surface projection used by the current magnetic follow.
use std::f32::consts::{FRAC_PI_2, PI, TAU};
pub const SIDE: f32 = 200.;
pub const RADIUS: f32 = 20.;
pub const STRAIGHT: f32 = SIDE - 2. * RADIUS;
pub const QUARTER: f32 = RADIUS * FRAC_PI_2;
pub const PERIMETER: f32 = 4. * STRAIGHT + TAU * RADIUS;
pub fn wrap(s: f32) -> f32 {
    s.rem_euclid(PERIMETER)
}
pub fn point_at(s: f32) -> [f32; 2] {
    let s = wrap(s);
    let side = (s / (STRAIGHT + QUARTER)).floor() as usize;
    let u = s - side as f32 * (STRAIGHT + QUARTER);
    if u <= STRAIGHT {
        match side {
            0 => [RADIUS + u, 0.],
            1 => [SIDE, RADIUS + u],
            2 => [SIDE - RADIUS - u, SIDE],
            _ => [0., SIDE - RADIUS - u],
        }
    } else {
        let angle = -FRAC_PI_2 + side as f32 * FRAC_PI_2 + (u - STRAIGHT) / RADIUS;
        let center = match side {
            0 => [SIDE - RADIUS, RADIUS],
            1 => [SIDE - RADIUS, SIDE - RADIUS],
            2 => [RADIUS, SIDE - RADIUS],
            _ => [RADIUS, RADIUS],
        };
        [
            center[0] + RADIUS * angle.cos(),
            center[1] + RADIUS * angle.sin(),
        ]
    }
}
#[derive(Clone, Copy, Debug)]
pub struct Projection {
    pub point: [f32; 2],
    pub distance: f32,
}
pub fn nearest(p: [f32; 2]) -> Projection {
    let mut best = Projection {
        point: [RADIUS, 0.],
        distance: f32::INFINITY,
    };
    let mut consider = |s: f32| {
        let q = point_at(s);
        let d = (p[0] - q[0]).hypot(p[1] - q[1]);
        if d < best.distance {
            best = Projection {
                point: q,
                distance: d,
            };
        }
    };
    consider((p[0] - RADIUS).clamp(0., STRAIGHT));
    consider(STRAIGHT + QUARTER + (p[1] - RADIUS).clamp(0., STRAIGHT));
    consider(2. * (STRAIGHT + QUARTER) + (SIDE - RADIUS - p[0]).clamp(0., STRAIGHT));
    consider(3. * (STRAIGHT + QUARTER) + (SIDE - RADIUS - p[1]).clamp(0., STRAIGHT));
    for side in 0..4 {
        let center = match side {
            0 => [SIDE - RADIUS, RADIUS],
            1 => [SIDE - RADIUS, SIDE - RADIUS],
            2 => [RADIUS, SIDE - RADIUS],
            _ => [RADIUS, RADIUS],
        };
        let start = -FRAC_PI_2 + side as f32 * FRAC_PI_2;
        let angle = (p[1] - center[1]).atan2(p[0] - center[0]);
        let angle = if side == 0 && angle > PI {
            angle - TAU
        } else if side >= 2 && angle < 0. {
            angle + TAU
        } else {
            angle
        };
        let theta = angle.clamp(start, start + FRAC_PI_2);
        consider(side as f32 * (STRAIGHT + QUARTER) + STRAIGHT + (theta - start) * RADIUS);
    }
    let c = [
        p[0].clamp(RADIUS, SIDE - RADIUS),
        p[1].clamp(RADIUS, SIDE - RADIUS),
    ];
    let inside = (p[0] - c[0]).hypot(p[1] - c[1]) <= RADIUS;
    if inside {
        best.distance = -best.distance;
    }
    best
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn projection_follows_all_edges_and_round_corners_continuously() {
        for step in 0..=2000 {
            let s = PERIMETER * step as f32 / 2000.;
            let p = point_at(s);
            let n = nearest(p);
            assert!(n.distance.abs() < 0.0001);
            assert!((n.point[0] - p[0]).hypot(n.point[1] - p[1]) < 0.001);
            let p2 = point_at(s + 0.1);
            assert!((p2[0] - p[0]).hypot(p2[1] - p[1]) < 0.101);
        }
        assert!((nearest([0., 0.]).distance - 8.28427).abs() < 0.001);
        assert_eq!(nearest([100., 100.]).distance, -100.);
        assert!((nearest([100., -10.]).distance - 10.).abs() < 0.001);
    }
}
