#!/usr/bin/env python3
"""Reproduce shipped Rust notices from checked, versioned original license material."""
import argparse
import hashlib
import html.parser
import json
from pathlib import Path
import re
import textwrap

ROOT = Path(__file__).resolve().parent.parent
INPUTS = 'distribution/notices/license-compaction-inputs.json'
OUTPUT = 'distribution/notices/rust-notices.txt'


def words(text):
    return ' '.join(text.split())


class Texts:
    def __init__(self):
        self.texts = {}

    def add(self, text):
        paragraphs = [words(p) for p in re.split(r'\n\s*\n', text) if p.strip()]
        normalized = words(text)
        self.texts.setdefault(normalized, (f'T{len(self.texts) + 1}', paragraphs))
        # No license words or their ordering may disappear during normalization.
        assert words(' '.join(paragraphs)) == words(text)
        return self.texts[normalized][0]

    def render(self):
        lines = ['Complete license texts (shared only when all wording matches):', '']
        for name, paragraphs in self.texts.values():
            lines += [name, '=' * len(name), '']
            for paragraph in paragraphs:
                lines += [textwrap.fill(paragraph, width=92, break_long_words=False,
                                        break_on_hyphens=False), '']
        return '\n'.join(lines)


class StandardLibrary(html.parser.HTMLParser):
    """Pinned COPYRIGHT-library.html only; preserve attribution and all pre blocks."""
    ALLOWED = {'html', 'head', 'meta', 'title', 'body', 'h1', 'h2', 'h3', 'ul', 'li',
               'p', 'b', 'code', 'details', 'summary', 'pre', 'div', 'a'}

    def __init__(self, texts):
        super().__init__(convert_charrefs=True)
        self.texts = texts
        self.in_body = False
        self.pre = None
        self.lines = []
        self.raw_pre = []

    def handle_starttag(self, tag, attrs):
        if tag not in self.ALLOWED:
            raise ValueError(f'Unexpected standard-library tag: {tag}')
        if tag == 'body':
            self.in_body = True
        elif self.in_body and tag == 'pre':
            if self.pre is not None:
                raise ValueError('Nested standard-library pre')
            self.pre = []
        elif self.in_body and self.pre is None:
            if tag == 'a':
                url = dict(attrs).get('href', '')
                if url.startswith(('http://', 'https://')):
                    self.lines.append(f' [{url}] ')
            elif tag not in {'b', 'code'}:
                self.lines.append('\n')

    def handle_endtag(self, tag):
        if tag == 'body':
            self.in_body = False
        elif self.in_body and tag == 'pre':
            if self.pre is None:
                raise ValueError('Unmatched standard-library pre')
            text = ''.join(self.pre)
            self.raw_pre.append(text)
            self.lines.append(f'\nLicense text: {self.texts.add(text)}\n')
            self.pre = None
        elif self.in_body and self.pre is None and tag not in {'a', 'b', 'code'}:
            self.lines.append('\n')

    def handle_data(self, data):
        if self.in_body:
            (self.pre if self.pre is not None else self.lines).append(data)

    def result(self):
        if self.in_body or self.pre is not None or not self.raw_pre:
            raise ValueError('Incomplete standard-library HTML')
        return '\n'.join(words(line) for line in ''.join(self.lines).splitlines() if line.strip())


def dependency_bodies(raw, packages):
    markers = list(re.finditer(rb'===== SHA256 ([0-9a-f]{64}) =====\n+', raw))
    needed = {t['sha256'] for p in packages for t in p['texts']}
    bodies = {}
    for index, marker in enumerate(markers):
        digest = marker[1].decode('ascii')
        if digest not in needed:
            continue
        end = markers[index + 1].start() if index + 1 < len(markers) else len(raw)
        body = raw[marker.end():end].strip(b'\n')
        # The historical container inserts newlines around unmodified source bytes.
        candidates = (b'\n' * a + body + b'\n' * b for a in range(6) for b in range(6))
        body = next((b for b in candidates if hashlib.sha256(b).hexdigest() == digest), None)
        if body is None:
            raise ValueError(f'Original license hash mismatch: {digest}')
        bodies[digest] = body.decode('utf-8') if digest != (
            '7b14a70c194b19dbd0625e7eac839a63200f67484521ce5e8d8244b127e8907a'
        ) else body.decode('cp1252')
    if bodies.keys() != needed:
        raise ValueError('Missing original dependency license body')
    return bodies


def generate(root=ROOT):
    inputs = json.loads((root / INPUTS).read_text(encoding='utf-8'))
    checked = {}
    for record in inputs['sources']:
        data = (root / record['path']).read_bytes()
        if hashlib.sha256(data).hexdigest() != record['sha256']:
            raise ValueError(f"Input changed: {record['path']}")
        checked[record['path']] = data
    inventory = json.loads(checked['distribution/notices/rust-dependency-inventory.json'])
    if hashlib.sha256((root / 'Cargo.lock').read_bytes()).hexdigest() != inventory['cargoLockSha256']:
        raise ValueError('Cargo.lock changed; refresh the dependency/source audit before packaging')
    packages = inventory['packages']
    assert inventory['packageCount'] == len(packages)
    bodies = dependency_bodies(checked['distribution/notices/rust-dependency-licenses.txt'], packages)
    texts = Texts()
    refs = {digest: texts.add(body) for digest, body in sorted(bodies.items())}
    lines = ['Rust dependency and standard-library licenses', '',
             'Complete applicable wording is retained below. Identical full texts are shared;',
             'each component maps to a complete license text with its original copyright.',
             'Source hashes and full engineering provenance remain in the matching source tree.', '',
             'Rust packages (Windows normal/build graph; build-only packages retained conservatively):', '']
    for package in packages:
        lines.append(f"{package['name']}@{package['version']} — {package['licenseExpression']}")
        if not package['texts']:
            lines.append('  Exact license-text source remains unresolved.')
        for text in package['texts']:
            lines.append(f"  {text['name']}: {refs[text['sha256']]}")
    lines += ['', 'Original dependency source SHA256 → text:', '']
    lines += [f'{digest}: {ref}' for digest, ref in refs.items()]
    lines += ['', 'Rust 1.98.1 standard library:', '']
    for name in ['rust-standard-library-MIT.txt', 'rust-standard-library-Apache-2.0.txt']:
        data = checked['distribution/notices/' + name]
        lines.append(f'{name}: {texts.add(data.decode("utf-8"))}')
    parser = StandardLibrary(texts)
    parser.feed(checked['distribution/notices/rust-standard-library-notices.txt'].decode('utf-8'))
    lines += [parser.result(), '', texts.render(), '']
    result = '\n'.join(lines).encode('utf-8')
    # Each original body maps to a complete contiguous text, never scattered paragraphs.
    reconstructed = {name: words(' '.join(paragraphs))
                     for name, paragraphs in texts.texts.values()}
    for digest, body in bodies.items():
        assert reconstructed[refs[digest]] == words(body)
    for body in parser.raw_pre:
        assert words(body) in reconstructed.values()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='update the generated notice file')
    args = parser.parse_args()
    generated = generate()
    if args.write:
        (ROOT / OUTPUT).write_bytes(generated)
    elif (ROOT / OUTPUT).read_bytes() != generated:
        raise SystemExit('Generated Rust notices are stale; run scripts/compact_licenses.py --write')
    print(f'Verified original hashes, mappings and complete legal wording: {len(generated)} generated bytes')


if __name__ == '__main__':
    main()
