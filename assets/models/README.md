# Detection model

`yolo11n-obb.onnx` — Ultralytics YOLO11n-OBB (oriented bounding boxes) trained on the DOTA v1 aerial dataset
(15 classes: plane, ship, storage tank, baseball diamond, tennis court, basketball court, ground track field,
harbor, bridge, large vehicle, small vehicle, helicopter, roundabout, soccer ball field, swimming pool),
exported to ONNX (input 1×3×1024×1024, output 1×20×21504: cx, cy, w, h, 15 class scores, angle in radians).

**Licence:** the Ultralytics YOLO models are licensed under **AGPL-3.0** (https://github.com/ultralytics/ultralytics/blob/main/LICENSE).
Using this file in a publicly available app means the app's source must stay available under AGPL-3.0-compatible terms.
For closed-source / commercial use you need an Ultralytics Enterprise licence — or replace this file with another
oriented-box ONNX model with the same input/output layout (the app only reads `assets/models/yolo11n-obb.onnx`).
