import os
import math
import subprocess
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
import tempfile
from pathlib import Path

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


def reencode_to_h264(input_path, output_path):
    """Re-encode mp4v to H.264 via ffmpeg for Messenger/iOS compatibility."""
    try:
        result = subprocess.run(
            [
                'ffmpeg', '-y',
                '-i', input_path,
                '-vcodec', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-crf', '23',
                '-preset', 'fast',
                '-movflags', '+faststart',
                output_path
            ],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"ffmpeg re-encode failed: {result.stderr}")
            return input_path
        return output_path
    except FileNotFoundError:
        print("ffmpeg not found — returning raw mp4v.")
        return input_path


# ─── Analysis only, but stores per-frame detections for replay ───────────────
def analyze_video_data(video_path):
    """
    Runs analysis and returns results.
    Also returns frame_detections: a dict of {frame_number: [(x1,y1,x2,y2,clean_id,behavior)]}
    so the export pass can replay exactly what was detected without re-running YOLO.
    """
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

    # Stores detections per sampled frame: {frame_num: [(x1,y1,x2,y2,clean_id,behavior)]}
    frame_detections = {}

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
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

        if frame_count % 5 != 0:
            continue

        results = yolo_model.track(frame, persist=True, verbose=False, conf=0.3)
        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
            bytetrack_ids = results[0].boxes.id.int().cpu().tolist()

            crops, meta = [], []
            for box, bytetrack_id in zip(boxes, bytetrack_ids):
                x1, y1, x2, y2 = box
                crop = frame[y1:y2, x1:x2]
                if crop.size > 0:
                    crops.append(cv2.resize(crop, (224, 224)).astype('float32') / 255.0)
                    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
                    meta.append((bytetrack_id, x1, y1, x2, y2, cx, cy))

            if crops:
                preds = behavior_model.predict(np.array(crops), verbose=0)
                frame_dets = []
                for (bytetrack_id, x1, y1, x2, y2, cx, cy), pred in zip(meta, preds):
                    clean_id = get_clean_pig_id(bytetrack_id)
                    current_behavior = BEHAVIOR_CLASSES[np.argmax(pred)]
                    behavior_counts[current_behavior] += 1
                    pig_behavior_history[clean_id][current_behavior] += 1
                    interval_pig_ids.add(clean_id)
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

                    # Store this detection for replay during export
                    frame_dets.append((x1, y1, x2, y2, clean_id, current_behavior))

                frame_detections[frame_count] = frame_dets

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
        "time_series": time_series,
        "lethargic_ids": lethargic_pigs,
        "limping_ids": limping_pigs,
        "frame_detections": frame_detections,  # key addition
    }


def analyze_image_data(image_path):
    img = cv2.imread(image_path)
    if img is None:
        return "Error: Could not read image", {}
    behavior_counts = {cls: 0 for cls in BEHAVIOR_CLASSES}
    results = yolo_model(img, conf=0.3, verbose=False)
    if len(results[0].boxes) > 0:
        boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
        crops = []
        for box in boxes:
            x1, y1, x2, y2 = box
            crop = img[y1:y2, x1:x2]
            if crop.size > 0:
                crops.append(cv2.resize(crop, (224, 224)).astype('float32') / 255.0)
        if crops:
            preds = behavior_model.predict(np.array(crops), verbose=0)
            for pred in preds:
                behavior_counts[BEHAVIOR_CLASSES[np.argmax(pred)]] += 1
    total_detected = sum(behavior_counts.values())
    most_common = max(behavior_counts, key=behavior_counts.get) if total_detected > 0 else "No Pig Detected"
    return most_common, behavior_counts


# ─── Overlay renderer — replays stored detections, no YOLO re-run ────────────
def render_overlay(video_path, output_path, frame_detections, lethargic_ids, limping_ids):
    """
    Draws annotations by replaying the detections captured during analysis.
    No YOLO re-run means boxes/IDs are 100% consistent with the results shown.
    """
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    raw_output_path = output_path.replace('.mp4', '_raw.mp4')
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(raw_output_path, fourcc, fps, (width, height))

    frame_count = 0
    last_boxes = []  # carry forward last known detections to non-sampled frames

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frame_count += 1
        annotated = frame.copy()

        # If this was a sampled frame, update last_boxes from stored detections
        if frame_count in frame_detections:
            last_boxes = frame_detections[frame_count]

        for (x1, y1, x2, y2, clean_id, behavior) in last_boxes:
            is_alert = clean_id in lethargic_ids or clean_id in limping_ids
            color = (0, 0, 255) if is_alert else (0, 255, 0)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            label_parts = [f"ID:{clean_id}"]
            if behavior:
                label_parts.append(behavior)
            if clean_id in lethargic_ids:
                label_parts.append("LETHARGIC")
            if clean_id in limping_ids:
                label_parts.append("LIMPING")
            label = " | ".join(label_parts)
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            cv2.rectangle(annotated, (x1, y1 - th - 10), (x1 + tw, y1), color, -1)
            cv2.putText(annotated, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        out.write(annotated)

    cap.release()
    out.release()

    final_path = reencode_to_h264(raw_output_path, output_path)
    if final_path == output_path and os.path.exists(raw_output_path):
        os.remove(raw_output_path)
    return final_path


# ─── In-memory job store ──────────────────────────────────────────────────────
# Stores frame_detections and health sets while the job video is on disk
job_store = {}


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.route('/', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

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


@app.route('/analyze-video-with-overlay', methods=['POST'])
def analyze_video_with_overlay():
    """
    Fast path: runs analysis only, returns data + first frame immediately.
    Stores frame detections in memory so export can replay them exactly.
    """
    file_path, error_response, status_code = handle_upload(request)
    if error_response:
        return error_response, status_code

    print(f"Fast-analyzing Video: {os.path.basename(file_path)}...")

    try:
        result = analyze_video_data(file_path)

        cap = cv2.VideoCapture(file_path)
        thumb_b64 = None
        ret, first_frame = cap.read()
        if ret:
            h, w = first_frame.shape[:2]
            if w > 640:
                first_frame = cv2.resize(first_frame, (640, int(h * 640 / w)))
            _, buf = cv2.imencode('.jpg', first_frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            thumb_b64 = base64.b64encode(buf).decode('utf-8')
        cap.release()

        job_id = os.path.splitext(os.path.basename(file_path))[0]
        job_video_path = os.path.join(UPLOAD_FOLDER, f"job_{job_id}.mp4")
        os.rename(file_path, job_video_path)

        job_store[job_id] = {
            "frame_detections": result["frame_detections"],
            "lethargic_ids": result["lethargic_ids"],
            "limping_ids": result["limping_ids"],
        }

        return jsonify({
            "status": "success",
            "media_type": "video",
            "job_id": job_id,
            "primary_behavior": result["primary_behavior"],
            "details": result["overall_behavior_counts"],
            "total_unique_pigs": result["total_unique_pigs"],
            "pig_summaries": result["pig_summaries"],
            "lethargy_flags": result["lethargy_flags"],
            "limping_flags": result["limping_flags"],
            "time_series": result["time_series"],
            "first_frame": thumb_b64,
        })

    except Exception as e:
        print(f"Video Analysis Error: {e}")
        if os.path.exists(file_path):
            os.remove(file_path)
        return jsonify({"error": str(e)}), 500


@app.route('/export-annotated-video/<job_id>', methods=['POST'])
def export_annotated_video(job_id):
    """
    On-demand overlay renderer. Replays stored detections — no YOLO re-run.
    All 5 pigs (or however many were detected) will appear in the video.
    """
    job_video_path = os.path.join(UPLOAD_FOLDER, f"job_{job_id}.mp4")
    if not os.path.exists(job_video_path):
        return jsonify({"error": "Job video not found. It may have expired."}), 404

    if job_id not in job_store:
        return jsonify({"error": "Job detection data not found. Please re-analyze the video."}), 404

    output_path = None
    try:
        job_data = job_store[job_id]

        temp_output = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4', dir=UPLOAD_FOLDER)
        output_path = temp_output.name
        temp_output.close()

        final_path = render_overlay(
            job_video_path,
            output_path,
            job_data["frame_detections"],
            job_data["lethargic_ids"],
            job_data["limping_ids"],
        )

        with open(final_path, 'rb') as f:
            video_b64 = base64.b64encode(f.read()).decode('utf-8')

        return jsonify({"status": "success", "annotated_video": video_b64})

    except Exception as e:
        print(f"Overlay export error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        for path in [output_path, output_path and output_path.replace('.mp4', '_raw.mp4'), job_video_path]:
            if path and os.path.exists(path):
                os.remove(path)
        job_store.pop(job_id, None)


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
            crops, valid = [], []
            for box, bytetrack_id in zip(boxes, bytetrack_ids):
                x1, y1, x2, y2 = box
                crop = img_resized[y1:y2, x1:x2]
                if crop.size > 0 and (x2 - x1) * (y2 - y1) >= 1000:
                    crops.append(cv2.resize(crop, (224, 224)).astype('float32') / 255.0)
                    valid.append((box, bytetrack_id))
            if crops:
                preds = behavior_model.predict(np.array(crops), verbose=0)
                for (box, bytetrack_id), pred in zip(valid, preds):
                    x1, y1, x2, y2 = box
                    clean_id = get_clean_pig_id(bytetrack_id)
                    behavior = BEHAVIOR_CLASSES[np.argmax(pred)]
                    confidence = float(pred[np.argmax(pred)])
                    scaled_box = [
                        int(x1 * scale_back_x), int(y1 * scale_back_y),
                        int(x2 * scale_back_x), int(y2 * scale_back_y)
                    ]
                    detections.append({"box": scaled_box, "behavior": behavior, "confidence": confidence, "pig_id": clean_id})
        processing_time = time.time() - start_time
        return jsonify({
            "detections": detections,
            "frame_width": original_width,
            "frame_height": original_height,
            "fps": 1.0 / processing_time if processing_time > 0 else 0,
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
                original_height, original_width = img.shape[:2]
                results = yolo_model.track(img, persist=True, conf=0.15, imgsz=640, verbose=False)
                detections = []
                rois_for_batch = []
                box_data_for_batch = []
                if results[0].boxes is not None and results[0].boxes.id is not None:
                    boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
                    confidences = results[0].boxes.conf.cpu().tolist()
                    if results[0].boxes.id is not None:
                        bytetrack_ids = results[0].boxes.id.int().cpu().tolist()
                    else:
                        bytetrack_ids = [-1] * len(boxes)
                    pig_data = sorted(zip(boxes, bytetrack_ids, confidences), key=lambda x: x[2], reverse=True)[:max_pigs]
                    for box, bytetrack_id, conf in pig_data:
                        x1, y1, x2, y2 = box
                        pig_crop = img[int(y1):int(y2), int(x1):int(x2)]
                        if pig_crop.size > 0 and (x2 - x1) * (y2 - y1) >= 100:
                            rois_for_batch.append(cv2.resize(pig_crop, (224, 224)).astype('float32') / 255.0)
                            clean_id = get_clean_pig_id(bytetrack_id) if bytetrack_id != -1 else 0
                            box_data_for_batch.append(([int(x1), int(y1), int(x2), int(y2)], clean_id))
                if rois_for_batch:
                    preds = behavior_model.predict(np.array(rois_for_batch), verbose=0)
                    for i, pred in enumerate(preds):
                        top_idx = np.argmax(pred)
                        scaled_box, clean_id = box_data_for_batch[i]
                        detections.append({
                            "box": scaled_box,
                            "behavior": BEHAVIOR_CLASSES[top_idx],
                            "confidence": float(pred[top_idx]),
                            "pig_id": clean_id
                        })
                processing_time = time.time() - start_time
                ws.send(json.dumps({
                    "detections": detections,
                    "frame_width": original_width,
                    "frame_height": original_height,
                    "fps": 1.0 / processing_time if processing_time > 0 else 0,
                    "processing_time_ms": processing_time * 1000,
                    "total_tracked_pigs": len(id_mapper),
                    "frame_count": frame_count
                }))
                if frame_count % 10 == 0:
                    print(f"📊 Frame {frame_count}: {len(detections)} pigs in {processing_time*1000:.0f}ms")
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
    print("📡                  /analyze-video-with-overlay, /export-annotated-video/<job_id>")
    print("🔌 WebSocket endpoint: ws://YOUR_IP:5000/ws/live-stream")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)