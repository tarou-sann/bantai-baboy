import os
import math
from collections import defaultdict, deque
from flask import Flask, request, jsonify
from ultralytics import YOLO
import cv2
import numpy as np
import tensorflow as tf
from werkzeug.utils import secure_filename

app = Flask(__name__)

# --- CONFIG ---
# UPDATE THIS PATH!
MOBILENET_PATH = 'mobilenet_model/mobilenet_pig_classifier.h5'
BEHAVIOR_CLASSES = ['Drinking', 'Eating', 'Investigating', 'Lying', 'Moutend', 'Sleeping', 'Walking']
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# YOLO_PATH = r'C:\Users\Tan\Desktop\Thesis_Software\bantai-baboy\pig_baseline7\2nd_weight\best.pt'

# --- GLOBAL MODEL VARIABLES ---
yolo_model = None
behavior_model = None

# --- LOAD MODELS FUNCTION ---
def load_models():
    global yolo_model, behavior_model
    if yolo_model is None or behavior_model is None:
        print("Loading models... please wait...")
        yolo_model = YOLO('pig_baseline7/2nd_weight/best.pt') 
        behavior_model = tf.keras.models.load_model(MOBILENET_PATH)
        print("Models loaded!")
    else:
        print("Models already loaded.")

# Call load_models when the application starts
with app.app_context():
    load_models()

# --- UTILITY FUNCTION TO HANDLE FILE UPLOAD ---
def handle_upload(request):
    if 'file' not in request.files:
        return None, jsonify({"error": "No file part in the request"}), 400
    file = request.files['file']
    if file.filename == '':
        return None, jsonify({"error": "No selected file"}), 400
    
    filename = secure_filename(file.filename)
    path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(path)
    return path, None, None # Return path, no error, no status

# --- VIDEO ANALYSIS LOGIC ---
def analyze_video_data(video_path):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    INTERVAL_SECONDS = 2
    frames_per_interval = int(fps * INTERVAL_SECONDS)
    
    behavior_counts = {cls: 0 for cls in BEHAVIOR_CLASSES}
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
            time_series.append({
                "time": time_label,
                "pig_count": len(interval_pig_ids),
                "lethargy": len(interval_lethargic_ids) > 0,
                "lethargic_ids": list(interval_lethargic_ids),
                "limping": len(interval_limping_ids) > 0,
                "limping_ids": list(interval_limping_ids),
            })
            current_interval += 1
            interval_pig_ids = set()
            interval_lethargic_ids = set()
            interval_limping_ids = set()

        if frame_count % 5 != 0: continue

        results = yolo_model.track(frame, persist=True, verbose=False, conf=0.3)
        
        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
            track_ids = results[0].boxes.id.int().cpu().tolist()
            
            for box, track_id in zip(boxes, track_ids):
                x1, y1, x2, y2 = box
                cx = (x1 + x2) / 2.0
                cy = (y1 + y2) / 2.0

                # track_history[track_id].append((cx, cy))
                interval_pig_ids.add(track_id)

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

                prev_pos = track_history[track_id][-1] if track_history[track_id] else None
                track_history[track_id].append((cx, cy))
                
                if prev_pos is not None:
                    displacement = math.sqrt((cx - prev_pos[0])**2 + (cy - prev_pos[1])**2)
                    displacement_history[track_id].append(displacement)

                    is_resting = current_behavior in RESTING_BEHAVIORS
                    if displacement < MOVEMENT_THRESHOLD and not is_resting:
                        idle_frames[track_id] += 1
                    else:
                        idle_frames[track_id] = 0 

                    if idle_frames[track_id] >= IDLE_FRAMES_FOR_LETHARGY:
                        lethargic_pigs.add(track_id)
                        interval_lethargic_ids.add(track_id)

                    if current_behavior == 'Walking' and len(displacement_history[track_id]) >= 10:
                        displacements = list(displacement_history[track_id])
                        mean_disp = sum(displacements) / len(displacements)
                        variance = sum((d - mean_disp) ** 2 for d in displacements) / len(displacements)

                        if mean_disp > LIMP_MEAN_MIN and variance > LIMP_VARIANCE_THRESHOLD:
                            limping_pigs.add(track_id)
                            interval_limping_ids.add(track_id)  

    if interval_pig_ids:
        time_label = f"{current_interval * INTERVAL_SECONDS}s"
        time_series.append({
            "time": time_label,
            "pig_count": len(interval_pig_ids),
            "lethargy": len(interval_lethargic_ids) > 0,
            "lethargic_ids": list(interval_lethargic_ids),
            "limping": len(interval_limping_ids) > 0,
            "limping_ids": list(interval_limping_ids),
    })

    cap.release()
    
    most_common = max(behavior_counts, key=behavior_counts.get) if sum(behavior_counts.values()) > 0 else "No Pig Detected"
    return most_common, behavior_counts, len(lethargic_pigs), len(limping_pigs), time_series

    # if sum(behavior_counts.values()) > 0:
    #     most_common = max(behavior_counts, key=behavior_counts.get)
    # else:
    #     most_common = "No Pig Detected"
        
    # return most_common, behavior_counts, len(lethargic_pigs)

# --- IMAGE ANALYSIS LOGIC ---
def analyze_image_data(image_path):
    img = cv2.imread(image_path)
    if img is None:
        return "Error: Could not read image", {}

    behavior_counts = {cls: 0 for cls in BEHAVIOR_CLASSES}
    
    # 1. YOLO Detection (Single Pass)
    results = yolo_model(img, conf=0.3, verbose=False)
    
    # Check if any pigs were detected
    if len(results[0].boxes) > 0:
        boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
        
        for box in boxes:
            x1, y1, x2, y2 = box
            
            # 2. Crop Pig
            pig_crop = img[y1:y2, x1:x2]
            
            if pig_crop.size > 0:
                # 3. MobileNet Classify
                roi = cv2.resize(pig_crop, (224, 224))
                roi = tf.keras.preprocessing.image.img_to_array(roi)
                roi = np.expand_dims(roi, axis=0)
                roi = roi / 255.0
                
                preds = behavior_model.predict(roi, verbose=0)
                top_idx = np.argmax(preds[0])
                behavior = BEHAVIOR_CLASSES[top_idx]
                
                # 4. Update count
                behavior_counts[behavior] += 1

    total_detected = sum(behavior_counts.values())
    if total_detected > 0:
        most_common = max(behavior_counts, key=behavior_counts.get)
    else:
        most_common = "No Pig Detected"
        
    return most_common, behavior_counts

@app.route('/analyze-video', methods=['POST'])
def analyze_video():
    file_path, error_response, status_code = handle_upload(request)
    if error_response:
        return error_response, status_code

    print(f"Analyzing Video: {os.path.basename(file_path)}...")
    
    try:
        result_text, detailed_counts, lethargic_count, limping_count, time_series = analyze_video_data(file_path)
        
        print(f"Video Analysis Result: {result_text}")
        
        return jsonify({
            "status": "success",
            "media_type": "video",
            "primary_behavior": result_text,
            "details": detailed_counts,
            "lethargy_flags": lethargic_count,
            "limping_flags": limping_count,
            "time_series": time_series
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
        
        print(f"Image Analysis Result: {result_text}")
        
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
        # Clean up the uploaded file after processing
        if os.path.exists(file_path):
            os.remove(file_path)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)