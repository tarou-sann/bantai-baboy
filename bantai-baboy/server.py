import os
from flask import Flask, request, jsonify
from ultralytics import YOLO
import cv2
import numpy as np
import tensorflow as tf
from werkzeug.utils import secure_filename

app = Flask(__name__)

# --- CONFIG ---
# UPDATE THIS PATH!
MOBILENET_PATH = r'C:\Users\Tan\Desktop\Thesis_Software\bantai-baboy\mobilenet_model\mobilenet_pig_classifier.h5'
BEHAVIOR_CLASSES = ['Drinking', 'Eating', 'Investigating', 'Lying', 'Moutend', 'Sleeping', 'Walking']
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- LOAD MODELS ---
print("Loading models... please wait...")
yolo_model = YOLO('pig_baseline7/weights/best.pt') 
behavior_model = tf.keras.models.load_model(MOBILENET_PATH)
print("Models loaded!")

def analyze_video_data(video_path):
    cap = cv2.VideoCapture(video_path)
    behavior_counts = {cls: 0 for cls in BEHAVIOR_CLASSES}
    frame_count = 0
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        
        frame_count += 1
        # Optimization: Only check every 5th frame to make it faster
        if frame_count % 5 != 0: continue

        # 1. YOLO Track
        results = yolo_model.track(frame, persist=True, verbose=False, conf=0.3)
        
        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
            
            for box in boxes:
                x1, y1, x2, y2 = box
                
                # 2. Crop Pig
                pig_crop = frame[y1:y2, x1:x2]
                if pig_crop.size > 0:
                    # 3. MobileNet Classify
                    roi = cv2.resize(pig_crop, (224, 224))
                    roi = tf.keras.preprocessing.image.img_to_array(roi)
                    roi = np.expand_dims(roi, axis=0)
                    roi = roi / 255.0
                    
                    preds = behavior_model.predict(roi, verbose=0)
                    top_idx = np.argmax(preds[0])
                    behavior = BEHAVIOR_CLASSES[top_idx]
                    
                    # 4. Count it
                    behavior_counts[behavior] += 1

    cap.release()
    
    # Calculate winner
    if sum(behavior_counts.values()) > 0:
        most_common = max(behavior_counts, key=behavior_counts.get)
    else:
        most_common = "No Pig Detected"
        
    return most_common, behavior_counts

@app.route('/analyze', methods=['POST'])
def analyze():
    if 'file' not in request.files: return jsonify({"error": "No file"}), 400
    file = request.files['file']
    
    filename = secure_filename(file.filename)
    path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(path)
    
    print(f"Analyzing {filename}...")
    
    try:
        # Run analysis
        result_text, detailed_counts = analyze_video_data(path)
        
        print(f"Result: {result_text}")
        
        # Send simple JSON back
        return jsonify({
            "status": "success",
            "most_common_behavior": result_text,
            "details": detailed_counts
        })
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)