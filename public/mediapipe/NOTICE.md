# MediaPipe files served by Mirror AI

Live 3D try-on tracks the body on the visitor's device with Google's MediaPipe. These files are redistributed
unchanged:

- `pose_landmarker_lite.task`: the Pose Landmarker "lite" model (float16, version 1), from
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
  (SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`). Model card:
  https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
- `wasm/`: the WebAssembly runtime from the npm package `@mediapipe/tasks-vision@1.0.1`, copied at build time.

MediaPipe is Copyright Google LLC. The npm package is licensed under the Apache License 2.0 (see
`LICENSE-APACHE-2.0.txt` in this folder). Neither the model card nor the `.task` file states a licence for the
model itself. **Assumption (not confirmed by Google):** it's distributed on the same Apache-2.0 terms as the
package that loads it.
