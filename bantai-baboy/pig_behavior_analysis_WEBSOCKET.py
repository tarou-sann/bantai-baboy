import os
import math
from collections import defaultdict, deque
from flask import Flask, request, jsonify
from flask_sock import Sock
from ultralytics import YOLO
import cv2
import numpy as np
import tensorflow as tf
from werkzeug.utils import secure_filename
import base64
import json

app = Flask(__name__)
sock = Sock(app)

# --- CONFIG ---
MOBILENET_PATH = 'mobilenet_model/mobilenet_pig_classifier.h5'
BEHAVIOR_CLASSES = ['Drinking', 'Eating', 'Investigating', 'Lying', 'Moutend', 'Sleeping', 'Walking']
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- GLOBAL MODEL VARIABLES ---
yolo_model = None
behavior_model = None

# --- ID MAPPING ---
id_mapper = {}
next_clean_id = 1

def get_clean_pig_id(bytetrack_id):
    global next_clean_id
    if bytetrack_id not in id_mapper:
        id_mapper[bytetrack_id] = next_clean_id
        next_clean_id += 1
    return id_mapper[bytetrack_id]

def reset_id_mapper():
    global id_mapper, next_clean_id
    id_mapper = {}
    next_clean_id = 1

def load_models():
    global yolo_model, behavior_model
    if yolo_model is None or behavior_model is None:
        print("Loading models... please wait...")
        yolo_model = YOLO('pig_baseline7/2nd_weight/best.pt')
        behavior_model = tf.keras.models.load_model(MOBILENET_PATH)
        print("Models loaded!")
    else:
        print("Models already loaded.")

with app.app_context():
    load_models()

def handle_upload(request):
    if 'file' not in request.files:
        return None, jsonify({"error": "No file part in the request"}), 400
    file = request.files['file']
    if file.filename == '':
        return None, jsonify({"error": "No selected file"}), 400
    filename = secure_filename(file.filename)
    path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(path)
    return path, None, None

def analyze_video_data(video_path):
    reset_id_mapper()
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    INTERVAL_SECONDS = 2
    frames_per_interval = int(fps * INTERVAL_SECONDS)
    behavior_counts = {cls: 0 for cls in BEHAVIOR_CLASSES}
    pig_behavior_history = defaultdict(lambda: defaultdict(int))
    track_history = defaultdict(lambda: deque(maxlen=15))
    idle_frames = defaultdict(int)
    lethargic_pigs = set()
    MOVEMENT_THRESHOLD = 10.0
    IDLE_FRAMES_FOR_LETHARGY = int((fps / 5) * 10)
    RESTING_BEHAVIORS = {'Lying', 'Sleeping'}
    displacement_history = defaultdict(lambda: deque(maxlen=20))
    limping_pigs = set()
    LIMP_MEAN_MIN = 3.0
    LIMP_VARIANCE_THRESHOLD = 30.0
    time_series = []
    interval_pig_behaviors = defaultdict(str)
    interval_pig_ids = set()
    interval_lethargic_ids = set()
    interval_limping_ids = set()
    current_interval = 0
    frame_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        frame_count += 1

        if frame_count > 0 and frame_count % frames_per_interval == 0:
            time_label = f"{current_interval * INTERVAL_SECONDS}s"
            behavior_summary = defaultdict(list)
            for pig_id, behavior in interval_pig_behaviors.items():
                behavior_summary[behavior].append(pig_id)
            time_series.append({
                "time": time_label,
                "pig_count": len(interval_pig_ids),
                "behavior_breakdown": {
                    behavior: {"count": len(pigs), "pig_ids": sorted(pigs)}
                    for behavior, pigs in behavior_summary.items()
                },
                "lethargy": len(interval_lethargic_ids) > 0,
                "lethargic_ids": sorted(list(interval_lethargic_ids)),
                "limping": len(interval_limping_ids) > 0,
                "limping_ids": sorted(list(interval_limping_ids)),
            })
            current_interval += 1
            interval_pig_ids = set()
            interval_pig_behaviors = defaultdict(str)
            interval_lethargic_ids = set()
            interval_limping_ids = set()

        if frame_count % 5 != 0: continue

        results = yolo_model.track(frame, persist=True, verbose=False, conf=0.3)
        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
            bytetrack_ids = results[0].boxes.id.int().cpu().tolist()
            for box, bytetrack_id in zip(boxes, bytetrack_ids):
                clean_id = get_clean_pig_id(bytetrack_id)
                x1, y1, x2, y2 = box
                cx = (x1 + x2) / 2.0
                cy = (y1 + y2) / 2.0
                interval_pig_ids.add(clean_id)
                pig_crop = frame[y1:y2, x1:x2]
                current_behavior = None
                if pig_crop.size > 0:
                    roi = cv2.resize(pig_crop, (224, 224))
                    roi = tf.keras.preprocessing.image.img_to_array(roi)
                    roi = np.expand_dims(roi, axis=0)
                    roi = roi / 255.0
                    preds = behavior_model.predict(roi, verbose=0)
                    top_idx = np.argmax(preds[0])
                    current_behavior = BEHAVIOR_CLASSES[top_idx]
                    behavior_counts[current_behavior] += 1
                    pig_behavior_history[clean_id][current_behavior] += 1
                    interval_pig_behaviors[clean_id] = current_behavior
                prev_pos = track_history[clean_id][-1] if track_history[clean_id] else None
                track_history[clean_id].append((cx, cy))
                if prev_pos is not None:
                    displacement = math.sqrt((cx - prev_pos[0])**2 + (cy - prev_pos[1])**2)
                    displacement_history[clean_id].append(displacement)
                    is_resting = current_behavior in RESTING_BEHAVIORS
                    if displacement < MOVEMENT_THRESHOLD and not is_resting:
                        idle_frames[clean_id] += 1
                    else:
                        idle_frames[clean_id] = 0
                    if idle_frames[clean_id] >= IDLE_FRAMES_FOR_LETHARGY:
                        lethargic_pigs.add(clean_id)
                        interval_lethargic_ids.add(clean_id)
                    if current_behavior == 'Walking' and len(displacement_history[clean_id]) >= 10:
                        displacements = list(displacement_history[clean_id])
                        mean_disp = sum(displacements) / len(displacements)
                        variance = sum((d - mean_disp) ** 2 for d in displacements) / len(displacements)
                        if mean_disp > LIMP_MEAN_MIN and variance > LIMP_VARIANCE_THRESHOLD:
                            limping_pigs.add(clean_id)
                            interval_limping_ids.add(clean_id)

    if interval_pig_ids:
        time_label = f"{current_interval * INTERVAL_SECONDS}s"
        behavior_summary = defaultdict(list)
        for pig_id, behavior in interval_pig_behaviors.items():
            behavior_summary[behavior].append(pig_id)
        time_series.append({
            "time": time_label,
            "pig_count": len(interval_pig_ids),
            "behavior_breakdown": {
                behavior: {"count": len(pigs), "pig_ids": sorted(pigs)}
                for behavior, pigs in behavior_summary.items()
            },
            "lethargy": len(interval_lethargic_ids) > 0,
            "lethargic_ids": sorted(list(interval_lethargic_ids)),
            "limping": len(interval_limping_ids) > 0,
            "limping_ids": sorted(list(interval_limping_ids)),
        })

    cap.release()
    pig_summaries = []
    for pig_id, behaviors in pig_behavior_history.items():
        predominant_behavior = max(behaviors, key=behaviors.get)
        pig_summaries.append({
            "pig_id": pig_id,
            "predominant_behavior": predominant_behavior,
            "behavior_counts": dict(behaviors),
            "is_lethargic": pig_id in lethargic_pigs,
            "is_limping": pig_id in limping_pigs
        })
    pig_summaries.sort(key=lambda x: x["pig_id"])
    most_common = max(behavior_counts, key=behavior_counts.get) if sum(behavior_counts.values()) > 0 else "No Pig Detected"
    return {
        "primary_behavior": most_common,
        "overall_behavior_counts": behavior_counts,
        "total_unique_pigs": len(pig_behavior_history),
        "pig_summaries": pig_summaries,
        "lethargy_flags": len(lethargic_pigs),
        "limping_flags": len(limping_pigs),
        "time_series": time_series
    }

def analyze_image_data(image_path):
    img = cv2.imread(image_path)
    if img is None:
        return "Error: Could not read image", {}
    behavior_counts = {cls: 0 for cls in BEHAVIOR_CLASSES}
    results = yolo_model(img, conf=0.3, verbose=False)
    if len(results[0].boxes) > 0:
        boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
        for box in boxes:
            x1, y1, x2, y2 = box
            pig_crop = img[y1:y2, x1:x2]
            if pig_crop.size > 0:
                roi = cv2.resize(pig_crop, (224, 224))
                roi = tf.keras.preprocessing.image.img_to_array(roi)
                roi = np.expand_dims(roi, axis=0)
                roi = roi / 255.0
                preds = behavior_model.predict(roi, verbose=0)
                top_idx = np.argmax(preds[0])
                behavior = BEHAVIOR_CLASSES[top_idx]
                behavior_counts[behavior] += 1
    total_detected = sum(behavior_counts.values())
    most_common = max(behavior_counts, key=behavior_counts.get) if total_detected > 0 else "No Pig Detected"
    return most_common, behavior_counts

@app.route('/analyze-video', methods=['POST'])
def analyze_video():
    file_path, error_response, status_code = handle_upload(request)
    if error_response:
        return error_response, status_code
    print(f"Analyzing Video: {os.path.basename(file_path)}...")
    try:
        result = analyze_video_data(file_path)
        return jsonify({
            "status": "success",
            "media_type": "video",
            "primary_behavior": result["primary_behavior"],
            "details": result["overall_behavior_counts"],
            "total_unique_pigs": result["total_unique_pigs"],
            "pig_summaries": result["pig_summaries"],
            "lethargy_flags": result["lethargy_flags"],
            "limping_flags": result["limping_flags"],
            "time_series": result["time_series"]
        })
    except Exception as e:
        print(f"Video Analysis Error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.route('/analyze-image', methods=['POST'])
def analyze_image():
    file_path, error_response, status_code = handle_upload(request)
    if error_response:
        return error_response, status_code
    print(f"Analyzing Image: {os.path.basename(file_path)}...")
    try:
        result_text, detailed_counts = analyze_image_data(file_path)
        return jsonify({
            "status": "success",
            "media_type": "image",
            "detected_pigs_count": sum(detailed_counts.values()),
            "primary_behavior": result_text,
            "details": detailed_counts
        })
    except Exception as e:
        print(f"Image Analysis Error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.route('/live-detect', methods=['POST'])
def live_detect():
    file_path, error_response, status_code = handle_upload(request)
    if error_response:
        return error_response, status_code
    try:
        import time
        start_time = time.time()
        img = cv2.imread(file_path)
        if img is None:
            return jsonify({"error": "Could not read image"}), 400
        original_height, original_width = img.shape[:2]
        max_dimension = 640
        if max(original_width, original_height) > max_dimension:
            scale = max_dimension / max(original_width, original_height)
            new_width = int(original_width * scale)
            new_height = int(original_height * scale)
            img_resized = cv2.resize(img, (new_width, new_height))
            scale_back_x = original_width / new_width
            scale_back_y = original_height / new_height
        else:
            img_resized = img
            scale_back_x = 1.0
            scale_back_y = 1.0
        detections = []
        results = yolo_model.track(img_resized, persist=True, conf=0.25, verbose=False)
        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
            bytetrack_ids = results[0].boxes.id.int().cpu().tolist()
            for box, bytetrack_id in zip(boxes, bytetrack_ids):
                clean_id = get_clean_pig_id(bytetrack_id)
                x1, y1, x2, y2 = box
                pig_crop = img_resized[y1:y2, x1:x2]
                if pig_crop.size > 0:
                    box_area = (x2 - x1) * (y2 - y1)
                    if box_area < 1000:
                        continue
                    roi = cv2.resize(pig_crop, (224, 224))
                    roi = tf.keras.preprocessing.image.img_to_array(roi)
                    roi = np.expand_dims(roi, axis=0)
                    roi = roi / 255.0
                    preds = behavior_model.predict(roi, verbose=0)
                    top_idx = np.argmax(preds[0])
                    behavior = BEHAVIOR_CLASSES[top_idx]
                    confidence = float(preds[0][top_idx])
                    scaled_box = [
                        int(x1 * scale_back_x), int(y1 * scale_back_y),
                        int(x2 * scale_back_x), int(y2 * scale_back_y)
                    ]
                    detections.append({"box": scaled_box, "behavior": behavior, "confidence": confidence, "pig_id": clean_id})
        processing_time = time.time() - start_time
        fps = 1.0 / processing_time if processing_time > 0 else 0
        return jsonify({
            "detections": detections,
            "frame_width": original_width,
            "frame_height": original_height,
            "fps": fps,
            "processing_time_ms": processing_time * 1000,
            "total_tracked_pigs": len(id_mapper)
        })
    except Exception as e:
        print(f"Live detection error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.route('/reset-tracking', methods=['POST'])
def reset_tracking():
    reset_id_mapper()
    return jsonify({"status": "success", "message": "Tracking IDs reset"})


@sock.route('/ws/live-stream')
def live_stream(ws):
    """
    WebSocket endpoint for real-time video streaming.
    Now respects max_pigs limit to prevent crashes on crowded scenes.
    """
    print("🔌 WebSocket client connected")
    reset_id_mapper()

    frame_count = 0

    try:
        while True:
            message = ws.receive()
            if not message:
                break

            frame_count += 1

            try:
                import time
                start_time = time.time()

                data = json.loads(message)
                img_base64 = data.get('frame', '')

                # ✅ Respect max_pigs from client (default 20)
                max_pigs = int(data.get('max_pigs', 20))

                if not img_base64:
                    ws.send(json.dumps({"error": "No frame data"}))
                    continue

                img_bytes = base64.b64decode(img_base64)
                nparr = np.frombuffer(img_bytes, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                if img is None:
                    ws.send(json.dumps({"error": "Could not decode image"}))
                    continue

                # Phone already resized to 640px wide before sending.
                # We run YOLO directly — no server-side resize needed.
                # Boxes come back in the image's actual pixel coords,
                # which match what the phone sent, so no scale_back needed.
                original_height, original_width = img.shape[:2]
                img_resized = img
                scale_back_x = 1.0
                scale_back_y = 1.0

                detections = []
                rois_for_batch = []
                box_data_for_batch = []

                results = yolo_model.track(img_resized, persist=True, conf=0.15, imgsz=640, verbose=False)

                if results[0].boxes is not None and results[0].boxes.id is not None:
                    boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
                    # bytetrack_ids = results[0].boxes.id.int().cpu().tolist()
                    confidences = results[0].boxes.conf.cpu().tolist()

                    if results[0].boxes.id is not None:
                        bytetrack_ids = results[0].boxes.id.int().cpu().tolist()
                    else:
                        bytetrack_ids = [-1] * len(boxes) 

                    # Sort by confidence, take top max_pigs
                    pig_data = sorted(
                        zip(boxes, bytetrack_ids, confidences),
                        key=lambda x: x[2],
                        reverse=True
                    )[:max_pigs]

                    # Sort by confidence, take top max_pigs
                    pig_data = sorted(
                        zip(boxes, bytetrack_ids, confidences),
                        key=lambda x: x[2],
                        reverse=True
                    )[:max_pigs]

                    for box, bytetrack_id, conf in pig_data:
                        clean_id = get_clean_pig_id(bytetrack_id) if bytetrack_id != -1 else 0
                        x1, y1, x2, y2 = box

                        pig_crop = img_resized[int(y1):int(y2), int(x1):int(x2)]

                        if pig_crop.size > 0:
                            box_area = (x2 - x1) * (y2 - y1)
                            if box_area < 100:  # very permissive — only skip truly tiny noise
                                continue

                            roi = cv2.resize(pig_crop, (224, 224))
                            roi = tf.keras.preprocessing.image.img_to_array(roi)
                            roi = roi / 255.0
                            rois_for_batch.append(roi)

                            # No scaling needed — boxes are already in sent-frame coords
                            box_data_for_batch.append(([int(x1), int(y1), int(x2), int(y2)], clean_id))

                # Batch MobileNet prediction
                if len(rois_for_batch) > 0:
                    rois_np = np.array(rois_for_batch)
                    preds = behavior_model.predict(rois_np, verbose=0)

                    for i, pred in enumerate(preds):
                        top_idx = np.argmax(pred)
                        behavior = BEHAVIOR_CLASSES[top_idx]
                        confidence = float(pred[top_idx])
                        scaled_box, clean_id = box_data_for_batch[i]

                        detections.append({
                            "box": scaled_box,
                            "behavior": behavior,
                            "confidence": confidence,
                            "pig_id": clean_id
                        })

                processing_time = time.time() - start_time
                fps = 1.0 / processing_time if processing_time > 0 else 0

                response = {
                    "detections": detections,
                    "frame_width": original_width,
                    "frame_height": original_height,
                    "fps": fps,
                    "processing_time_ms": processing_time * 1000,
                    "total_tracked_pigs": len(id_mapper),
                    "frame_count": frame_count
                }

                ws.send(json.dumps(response))

                if frame_count % 10 == 0:
                    print(f"📊 Frame {frame_count}: {len(detections)} pigs in {processing_time*1000:.0f}ms ({fps:.1f} FPS)")

            except Exception as e:
                print(f"❌ Frame processing error: {e}")
                ws.send(json.dumps({"error": str(e)}))

    except Exception as e:
        print(f"❌ WebSocket error: {e}")
    finally:
        print(f"🔌 WebSocket client disconnected (processed {frame_count} frames)")


if __name__ == '__main__':
    print("=" * 60)
    print("🚀 Starting Flask server with WebSocket support")
    print("📡 HTTP endpoints: /analyze-video, /analyze-image, /live-detect")
    print("🔌 WebSocket endpoint: ws://YOUR_IP:5000/ws/live-stream")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)  