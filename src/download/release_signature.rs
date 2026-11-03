//! Narrow verifier for yt-dlp's binary OpenPGP release signatures.
//!
//! Key source: yt-dlp public.key at b77c9304e1c4220cca450c583491904daf8455af,
//! SHA-256 45d6b415928b5f3e228b461fa9e6d7eb56a824931c785ece00279a06c7a6d6e5.
//! Rotation fails closed; offline verification cannot discover revocations or rollback.
use ring::{digest, signature};

const MODULUS: &[u8] = include_bytes!("../../assets/yt-dlp-release-rsa-modulus.bin");
const FINGERPRINT: &[u8] = &[
    0xac, 0x0c, 0xbb, 0xe6, 0x84, 0x8d, 0x6a, 0x87, 0x34, 0x64, 0xaf, 0x4e, 0x57, 0xcf, 0x65, 0x93,
    0x3b, 0x5a, 0x75, 0x81,
];

pub(crate) fn verify(sums: &[u8], signature: &[u8]) -> Result<(), String> {
    verify_inner(sums, signature).ok_or_else(|| "E_UPDATE_SIGNATURE".into())
}

fn take<'a>(data: &mut &'a [u8], n: usize) -> Option<&'a [u8]> {
    let (first, rest) = data.split_at_checked(n)?;
    *data = rest;
    Some(first)
}

fn u16_len(data: &mut &[u8]) -> Option<usize> {
    let b = take(data, 2)?;
    Some(u16::from_be_bytes([b[0], b[1]]) as usize)
}

// Only definite packet lengths are accepted, including old-format signatures.
fn packet(data: &[u8]) -> Option<&[u8]> {
    let mut data = data;
    let tag = take(&mut data, 1)?[0];
    let len = if tag & 0xc0 == 0xc0 && tag & 0x3f == 2 {
        let first = take(&mut data, 1)?[0];
        match first {
            0..=191 => first as usize,
            192..=223 => ((first as usize - 192) << 8) + take(&mut data, 1)?[0] as usize + 192,
            255 => u32::from_be_bytes(take(&mut data, 4)?.try_into().ok()?) as usize,
            _ => return None,
        }
    } else if tag & 0x80 != 0 && tag & 0x40 == 0 && (tag >> 2) & 0x0f == 2 {
        match tag & 3 {
            0 => take(&mut data, 1)?[0] as usize,
            1 => u16_len(&mut data)?,
            2 => u32::from_be_bytes(take(&mut data, 4)?.try_into().ok()?) as usize,
            _ => return None,
        }
    } else {
        return None;
    };
    let body = take(&mut data, len)?;
    data.is_empty().then_some(body)
}

fn subpackets(mut data: &[u8], hashed: bool) -> Option<()> {
    let (mut fingerprint, mut created, mut issuer) = (false, false, false);
    while !data.is_empty() {
        let first = take(&mut data, 1)?[0];
        let len = match first {
            0..=191 => first as usize,
            192..=254 => ((first as usize - 192) << 8) + take(&mut data, 1)?[0] as usize + 192,
            255 => u32::from_be_bytes(take(&mut data, 4)?.try_into().ok()?) as usize,
        };
        let sub = take(&mut data, len)?;
        match sub {
            [33, 4, rest @ ..] if hashed && !fingerprint && rest == FINGERPRINT => {
                fingerprint = true
            }
            [2, _, _, _, _] if hashed && !created => created = true,
            [16, _, _, _, _, _, _, _, _] if !hashed && !issuer => issuer = true,
            _ => return None,
        }
    }
    if hashed {
        (fingerprint && created).then_some(())
    } else {
        issuer.then_some(())
    }
}

fn verify_inner(sums: &[u8], signature: &[u8]) -> Option<()> {
    if sums.len() > 1024 * 1024 || signature.len() > 4096 {
        return None;
    }
    let body = packet(signature)?;
    let mut data = body;
    if take(&mut data, 4)? != [4, 0, 1, 10] {
        return None;
    }
    let hashed_len = u16_len(&mut data)?;
    subpackets(take(&mut data, hashed_len)?, true)?;
    let signed_header_len = 6 + hashed_len;
    let unhashed_len = u16_len(&mut data)?;
    subpackets(take(&mut data, unhashed_len)?, false)?;
    let prefix = take(&mut data, 2)?;
    let bits = u16_len(&mut data)?;
    if bits == 0 || bits > 4096 {
        return None;
    }
    let mpi = take(&mut data, bits.div_ceil(8))?;
    if !data.is_empty()
        || mpi[0] == 0
        || (mpi.len() - 1) * 8 + (8 - mpi[0].leading_zeros() as usize) != bits
    {
        return None;
    }
    let mut padded = [0u8; 512];
    padded[512 - mpi.len()..].copy_from_slice(mpi);
    let mut signed = Vec::with_capacity(sums.len() + signed_header_len + 6);
    signed.extend_from_slice(sums);
    signed.extend_from_slice(&body[..signed_header_len]);
    signed.extend_from_slice(&[4, 0xff]);
    signed.extend_from_slice(&(signed_header_len as u32).to_be_bytes());
    if &digest::digest(&digest::SHA512, &signed).as_ref()[..2] != prefix {
        return None;
    }
    signature::RsaPublicKeyComponents {
        n: MODULUS,
        e: &[1, 0, 1],
    }
    .verify(&signature::RSA_PKCS1_2048_8192_SHA512, &signed, &padded)
    .ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    const SUMS: &[u8] = include_bytes!("../../assets/test/yt-dlp-2026.10.26-SHA2-256SUMS");
    const SIG: &[u8] = include_bytes!("../../assets/test/yt-dlp-2026.10.26-SHA2-256SUMS.sig");

    #[test]
    fn authentic_release_and_tampering() {
        assert!(verify(SUMS, SIG).is_ok());
        let mut sums = SUMS.to_vec();
        sums[0] ^= 1;
        assert!(verify(&sums, SIG).is_err());
        let mut sig = SIG.to_vec();
        *sig.last_mut().unwrap() ^= 1;
        assert!(verify(SUMS, &sig).is_err());
        for n in 0..SIG.len() {
            assert!(verify(SUMS, &SIG[..n]).is_err());
        }
        let mut extra = SIG.to_vec();
        extra.push(0);
        assert!(verify(SUMS, &extra).is_err());
        assert!(verify(&vec![0; 1024 * 1024 + 1], SIG).is_err());
        assert!(verify(SUMS, &vec![0; 4097]).is_err());
    }

    #[test]
    fn unsupported_signature_fields_fail_closed() {
        for (offset, value) in [
            (4, 1),
            (5, 2),
            (6, 8),
            (10, 0xa1),
            (10, 3),
            (10, 0x7f),
            (12, 5),
            (32, 1),
            (54, 0),
        ] {
            let mut sig = SIG.to_vec();
            sig[offset] = value;
            assert!(verify(SUMS, &sig).is_err(), "offset {offset}");
        }
        let mut sig = SIG.to_vec();
        sig[0] = 0x8b;
        assert!(verify(SUMS, &sig).is_err());
    }
}
