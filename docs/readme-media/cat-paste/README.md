# README Gallery recording

These two sequences use an isolated Gallery preview and synthetic state changes.
The same example job is used for resolving and downloading; no link, clipboard,
account, network transfer, or production queue is involved. The pointer and
Ctrl + V prompt are overlays, not captured input. The GIFs demonstrate the
interface and do not establish native interaction or download acceptance.

The cat recording had two 50 ms compositor frames with incomplete window
content at 1850 and 1900 ms. The published GIF omits those frames without
interpolation; the raw recording stays in the per-run directory. Posters use
actual settled cat and download-progress frames. Both GIFs and posters use the
same 400 × 400 crop (40, 40, 440, 440). The offline editor accepts only the
SHA-256 identities of this recording's two raw GIFs. To repeat this edit:

    python docs/readme-media/cat-paste/edit.py docs/readme-media/.work/cat-paste/<run-id>

On a Windows desktop whose owner has explicitly made it available, run:

    python docs/readme-media/cat-paste/record.py --exe D:/Ameow/target/debug/ameow.exe

The script checks the reviewed EXE SHA-256, uses a per-run control directory under
`docs/readme-media/.work/cat-paste/`, and writes a receipt there. A supervisor
owns the preview process tree and enforces a 60-second deadline. The GUI preview
and its small neutral backdrop close before GIF encoding begins. Recording writes
raw GIFs only; review a new recording before deciding how to edit it. The reference
EXE reports version 0.5.0; its compiling source revision is not established.
Each frame checks the visible window stack before and after capture, but cannot
eliminate a brief compositor or window-order race between those checks.
