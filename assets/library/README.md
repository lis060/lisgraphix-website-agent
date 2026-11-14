# Image library

Put your own photos in the folder that matches the template:
`restaurant/`, `salon/` (also barbershops), `boutique/`, `guesthouse/`, `generic/`.

Then list each one in `manifest.json`:

```json
[
  { "file": "salon/chairs-01.jpg", "template": "salon", "alt": "Salon styling chairs by a window", "license": "own" }
]
```

Rules:
- File names use lowercase letters, numbers, `-`, `_`, and end in `.jpg`, `.jpeg`, `.png` or `.webp`.
- `alt` is required (describes the picture for screen readers).
- `license` must be `"own"`. Only photos you took or have the right to use belong here.
- Do not add photos taken from Google Maps, Instagram, or business websites.
- Resize to about 1600px wide before adding, to keep demos fast.

Every image appears on demos with the caption "Illustrative image, not the business's own photo."
