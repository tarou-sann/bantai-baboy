import { AppBar } from "@/components/appbar";
import { DropdownItem } from "@/components/dropdown-item";
import { FloatingActionButton } from "@/components/floating-action-button";
import { Colors } from "@/theme/colors";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
// import { useFocusEffect } from 'expo-router';
// import { useCallback } from 'react';

interface UploadedFile {
  id: string;
  filename: string;
  uri: string;
  type: "image" | "video";
  uploadTime: string;
  analysisData?: any;
}

const SERVER_URL_KEY = '@server_url';
const DEFAULT_SERVER_URL = 'http://192.168.0.101:5000';
const STORAGE_KEY = '@bantai_baboy_files';

export default function Index() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);

  // useEffect(() => {
  //   loadSavedFiles();
  //   loadServerUrl();
  // }, []);

  useFocusEffect(
    useCallback(() => {
      loadServerUrl();
    }, [])
  );

  useEffect(() => {
    saveFiles();
  }, [files]);

  const loadServerUrl = async () => {
    try {
      const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
      if (saved) {
        setServerUrl(saved);
        console.log('✅ Using server URL:', saved);
      }
    } catch (error) {
      console.error('Failed to load server URL:', error);
    }
  };

  const loadSavedFiles = async () => {
    try {
      const savedFiles = await AsyncStorage.getItem(STORAGE_KEY);
      if (savedFiles) {
        setFiles(JSON.parse(savedFiles));
        console.log('✅ Loaded', JSON.parse(savedFiles).length, 'saved analyses');
      }
    } catch (error) {
      console.error('Failed to load saved files:', error);
    }
  };

  const saveFiles = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    } catch (error) {
      console.error('Failed to save files:', error);
    }
  };

  const navigateToResults = (file: UploadedFile, analysisResult?: any) => {
    router.push({
      pathname: "/results",
      params: {
        filename: file.filename,
        uri: file.uri,
        type: file.type,
        analysisData: analysisResult
          ? JSON.stringify(analysisResult)
          : (file.analysisData ? JSON.stringify(file.analysisData) : undefined),
      },
    });
  };

  const handleCameraCapture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission needed', 'Camera permission is required.');

    Alert.alert(
      'Camera',
      'What would you like to capture?',
      [
        {
          text: 'Photo',
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 1,
            });

            if (!result.canceled && result.assets[0]) {
              const asset = result.assets[0];
              const analysisResult = await uploadToServer(asset, 'image');

              if (analysisResult) {
                const fileName = asset.uri.split('/').pop() || 'photo.jpg';
                const newFile: UploadedFile = {
                  id: Date.now().toString(),
                  filename: fileName,
                  uri: asset.uri,
                  type: 'image',
                  uploadTime: new Date().toLocaleString(),
                  analysisData: analysisResult,
                };
                setFiles([newFile, ...files]);
                navigateToResults(newFile, analysisResult);
              }
            }
          },
        },
        {
          text: 'Video',
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Videos,
              allowsEditing: true,
              quality: 1,
            });

            if (!result.canceled && result.assets[0]) {
              const asset = result.assets[0];
              const analysisResult = await uploadVideoForProcessing(asset);

              if (analysisResult) {
                const fileName = asset.uri.split('/').pop() || 'video.mp4';
                const newFile: UploadedFile = {
                  id: Date.now().toString(),
                  filename: fileName,
                  uri: asset.uri,
                  type: 'video',
                  uploadTime: new Date().toLocaleString(),
                  analysisData: analysisResult,
                };
                setFiles([newFile, ...files]);
                navigateToResults(newFile, analysisResult);
              }
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const uploadToServer = async (
    asset: ImagePicker.ImagePickerAsset,
    mediaType: "image" | "video"
  ) => {
    setIsUploading(true);

    const endpoint = mediaType === "image" ? "/analyze-image" : "/analyze-video";
    const formData = new FormData();
    formData.append("file", {
      uri: asset.uri,
      name: asset.fileName || (mediaType === "image" ? "image.jpg" : "video.mp4"),
      type: asset.mimeType || (mediaType === "image" ? "image/jpeg" : "video/mp4"),
    } as any);

    try {
      const controller = new AbortController();
      const timeoutMs = mediaType === "video" ? 180000 : 30000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${serverUrl}${endpoint}`, {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "multipart/form-data" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        Alert.alert("Server Error", "Server returned an unexpected response.");
        return null;
      }

      const result = await response.json();

      if (response.ok) {
        Alert.alert("Analysis Complete", `Detected: ${result.primary_behavior}`);
        return result;
      } else {
        Alert.alert("Server Error", result.error || "Unknown error occurred");
        return null;
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        Alert.alert("Timeout", "Analysis took too long.");
      } else {
        Alert.alert("Connection Error", "Could not connect to server.");
      }
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const uploadVideoForProcessing = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", {
      uri: asset.uri,
      name: asset.fileName || "video.mp4",
      type: asset.mimeType || "video/mp4",
    } as any);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      const response = await fetch(`${serverUrl}/analyze-video-with-overlay`, {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "multipart/form-data" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        Alert.alert("Server Error", "Server returned an unexpected response.");
        return null;
      }

      const result = await response.json();

      if (response.ok) {
        Alert.alert("Processing Complete", `Detected: ${result.primary_behavior}`);
        return result;
      } else {
        Alert.alert("Server Error", result.error || "Unknown error occurred");
        return null;
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        Alert.alert("Timeout", "Processing took too long.");
      } else {
        Alert.alert("Connection Error", "Could not connect to server.");
      }
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return Alert.alert("Permission needed");

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const analysisResult = await uploadToServer(asset, "image");

      if (analysisResult) {
        const fileName = asset.uri.split("/").pop() || "image.jpg";
        const newFile: UploadedFile = {
          id: Date.now().toString(),
          filename: fileName,
          uri: asset.uri,
          type: "image",
          uploadTime: new Date().toLocaleString(),
          analysisData: analysisResult,
        };
        setFiles([newFile, ...files]);
        navigateToResults(newFile, analysisResult);
      }
    }
  };

  const handleVideoUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return Alert.alert("Permission needed");

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const analysisResult = await uploadVideoForProcessing(asset);

      if (analysisResult) {
        const fileName = asset.uri.split("/").pop() || "video.mp4";
        const newFile: UploadedFile = {
          id: Date.now().toString(),
          filename: fileName,
          uri: asset.uri,
          type: "video",
          uploadTime: new Date().toLocaleString(),
          analysisData: analysisResult,
        };
        setFiles([newFile, ...files]);
        navigateToResults(newFile, analysisResult);
      }
    }
  };

  const clearAllHistory = () => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to delete all saved analyses?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setFiles([]);
            await AsyncStorage.removeItem(STORAGE_KEY);
            Alert.alert('Success', 'All history cleared');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <AppBar 
        subtitle={`Connected to: ${serverUrl}`}
        rightIcon={<Text style={{ fontSize: 24 }}>⚙️</Text>}
        onRightIconPress={() => router.push('/settings')} 
      />
      <ScrollView style={styles.content}>
        <View style={styles.row}>
          <Text style={[styles.selectionTitle, { color: Colors.light.secondary }]}>
            Recently Analyzed Hogs
          </Text>
          {files.length > 0 && (
            <TouchableOpacity onPress={clearAllHistory} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.liveCameraButton}
          onPress={() => router.push('/live-camera-WEBSOCKET' as any)}
          activeOpacity={0.8}
        >
          <Text style={styles.liveCameraText}>📹 Open Live Camera</Text>
        </TouchableOpacity>

        {isUploading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <Text style={{ marginTop: 10 }}>Analyzing Behavior...</Text>
          </View>
        )}

        {files.length === 0 && !isUploading ? (
          <Text style={styles.emptyText}>No files uploaded yet.</Text>
        ) : (
          files.map((file) => (
            <DropdownItem
              key={file.id}
              title={file.filename}
              subtitle={file.uploadTime}
              showActions={true}
              onSeeResults={() => navigateToResults(file)}
              onCheckAnalytics={() => {}}
            >
              <Text style={styles.fileType}>Type: {file.type}</Text>
              {file.uri && file.type === "image" && (
                <RNImage
                  source={{ uri: file.uri }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              )}
              {file.uri && file.type === "video" && (
                <Text style={styles.videoInfo}>Video file ready</Text>
              )}
            </DropdownItem>
          ))
        )}
      </ScrollView>

      {!isUploading && (
        <FloatingActionButton
          onImagePress={handleImageUpload}
          onVideoPress={handleVideoUpload}
          onCameraPress={handleCameraCapture}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: {},
  selectionTitle: { fontSize: 16, fontFamily: "NunitoSans-SemiBold", padding: 20 },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingRight: 20 },
  clearButton: { padding: 20 },
  clearButtonText: { color: Colors.light.secondary, fontSize: 14, fontFamily: "NunitoSans-SemiBold" },
  liveCameraButton: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: Colors.light.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  liveCameraText: { 
    color: 'white', 
    fontSize: 18, 
    fontFamily: 'NunitoSans-Bold' 
  },
  emptyText: { 
    textAlign: "center",
    color: Colors.light.subtext, 
    marginTop: 40, 
    fontSize: 16, 
    fontFamily: "NunitoSans-Regular" 
  },
  fileType: { 
    fontSize: 14, 
    color: Colors.light.subtext, 
    marginBottom: 16, 
    fontFamily: "NunitoSans-Regular" 
  },
  previewImage: { 
    width: "100%", 
    height: 200, 
    marginTop: 8, 
    borderRadius: 8 
  },
  videoInfo: { 
    fontSize: 14, 
    color: Colors.light.subtext, 
    fontFamily: "NunitoSans-Regular" 
  },
  loadingContainer: { 
    alignItems: "center", 
    padding: 20 
  },
});