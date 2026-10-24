# NodeServer-HTML

A tiny Node.js server (no dependencies) that hosts standalone HTML apps and lists them on one page.

## Run

```
npm start
```

Then open http://localhost:3000/

Change the port or folder with environment variables:

```
$env:PORT = 8080; $env:PAGES_DIR = "D:\my-pages"; node server.js
```

## Adding pages

Copy any `.html` file into the `pages` folder (subfolders are fine). It appears in the list on the next reload. No restart is needed.

The list shows each file's `<title>`, falling back to a prettified filename. Supporting files (css, js, images, json) next to the HTML are served too.

## Audio extraction for the video transcriber

Browsers can only decode a few media formats. When the transcriber page is served from this host and the browser fails to read a file (MKV, AVI, AC-3 or DTS audio, very large files), the page uploads it to `POST /api/audio` and the server converts it to 16 kHz mono WAV with ffmpeg.

- The bundled `ffmpeg-static` binary is used by default. Set `FFMPEG_PATH` to use your own ffmpeg.
- Uploads are capped at 4 GB. Change it with `MAX_UPLOAD_MB`.
- `GET /api/audio` reports which ffmpeg binary is in use.

Install dependencies once with `npm install`.

## Routes

| Route | What it returns |
| --- | --- |
| `/` | List of all pages |
| `/pages/<file>.html` | The page itself |
| `/api/pages` | The list as JSON |
| `/healthz` | `ok` |
