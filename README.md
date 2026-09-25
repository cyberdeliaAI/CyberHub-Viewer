# CyberHub Viewer

Open an image or local folder and inspect image generation metadata.

- Version: `1.2`
- Channel: `stable`
- Publisher: `official`

## Installation

1. Open **Module Manager** in CyberHub.
2. Click **Check for updates**.
3. Find **Viewer** and choose **Install** or **Update**.
4. Restart CyberHub when the installation finishes.

The ZIP attached to this repository's GitHub Release can also be imported manually through Settings.

## Folder browsing (1.2)

Version `1.2` adds folder browsing to the existing Viewer.

1. Click **Open folder** and choose a folder on the computer running your browser.
2. Click a thumbnail to open the image with the usual metadata, copy actions,
   and PNG metadata editor. The first image opens automatically.
3. Use **Previous image** / **Next image**, or the left/right arrow keys, to browse.
4. Choose **Top**, **Left**, or **Right** under **Thumbnails**. Viewer remembers
   this preference in this browser. On narrow screens the strip appears above
   the image to leave room for the image and metadata.
5. Enable **Include subfolders** to also show images below the selected folder.
   By default only the selected folder itself is shown.

PNG, JPG/JPEG and WEBP files are sorted by relative filename, with numeric
ordering (for example `image2` before `image10`). Other files are ignored.
Thumbnails load as they approach the visible part of the strip. Folder contents
are not uploaded as a batch: the selected image is sent to the running CyberHub
instance for metadata analysis, as with opening a single image.

**Open folder** replaces the current folder. **Close folder** clears the folder
and preview; opening or dropping a single image also leaves folder mode. Canceling
the chooser keeps the current selection. To see newly added or changed files,
open the folder again. A page reload clears the selected files.

The folder chooser uses the browser's directory input. If folder selection is
unavailable, individual image selection still works. On a remote CyberHub
connection, this chooses a folder on the browser device, not the Hub host.
Folder images are not added to Gallery or saved in Settings. Metadata editing
still downloads a separate PNG without overwriting the original.

## Development checks

Run the frontend regression tests with Node.js (no additional npm packages):

```sh
node --test tests/viewer.test.cjs
```

For an integration check, load this module with CyberHub Core and test `/viewer`
with a folder containing PNG/JPEG/WEBP images, a nested folder, and an unsupported
file. Check all strip positions, keyboard navigation, PNG editing, empty folders,
and single-image selection. Keep test images and local settings out of Git.

## Python Packages

- `Pillow>=9.0`

## Privacy

CyberHub runs locally. A module uses an external service only when its function requires it and the user starts that action.

## License

See `LICENSE.md` and `THIRD-PARTY-NOTICES.md`.
