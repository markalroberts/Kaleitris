# Kaleitris

Tetris played through a rotating kaleidoscope, with a prism (chromatic) effect and
a warped, tape-wobbled take on the Tetris folk melody generated live with the Web Audio API.

No build step and no dependencies. Open `index.html` in a modern browser, or serve the folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Controls

| Desktop | Phone |
| --- | --- |
| Left / Right move | Drag left / right, or the on-screen buttons |
| Up or X rotate, Z rotate back | Tap the play field (tap the left edge for reverse) |
| Down soft drop, Space hard drop | Drag down to soft drop, flick down to hard drop |
| C hold, P pause, M mute | On-screen HOLD and pause buttons |

Visual toggles: `[` and `]` change the number of prisms (3 to 12), `R` stops or starts the spin,
`F` toggles the prism / bloom pass, `H` toggles the glowing marker on one of the mirrored boards,
`B` toggles an upright non-rotating copy of the board in the centre.

On phones and narrow windows the upright focus board is on by default so the game stays playable.
If a device cannot hold a smooth frame rate the prism pass switches itself off; press `F` to force it back on.
