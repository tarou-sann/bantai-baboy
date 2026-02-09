import { AppBar } from "@/components/appbar";
import { DropdownItem } from "@/components/dropdown-item";
import { FloatingActionButton } from "@/components/floating-action-button";
import { Colors } from "@/theme/colors";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { ArrowRight } from "phosphor-react-native";
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

interface UploadedFile {
  id: string;
  filename: string;
  uri: string;
  type: "image" | "video";
  uploadTime: string;
}

export default function Index() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // ========== CHANGE THIS TO YOUR PC IP ADDRESS ==========
  const SERVER_URL = "http://192.168.0.160:5000/analyze";
  // =======================================================

  const navigateToResults = (file: UploadedFile, analysisResult?: any) => {
    router.push({
      pathname: "/results",
      params: {
        filename: file.filename,
        uri: file.uri,
        type: file.type,
        // If we have analysis data, pass it as a string
        analysisData: analysisResult
          ? JSON.stringify(analysisResult)
          : undefined,
      },
    });
  };

  const uploadToServer = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", {
      uri: asset.uri,
      name: asset.fileName || "video.mp4",
      type: asset.mimeType || "video/mp4",
    } as any);

    try {
      console.log("Uploading to:", SERVER_URL);
      const response = await fetch(SERVER_URL, {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const result = await response.json();

      if (response.ok) {
        Alert.alert(
          "Analysis Complete",
          `Detected: ${result.most_common_behavior}`,
        );
        return result;
      } else {
        Alert.alert("Server Error", result.error || "Unknown error occurred");
        return null;
      }
    } catch (error) {
      console.error(error);
      Alert.alert(
        "Connection Error",
        "Could not connect to Python server. Check IP address.",
      );
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return Alert.alert("Permission needed");

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const fileName = asset.uri.split("/").pop() || "image.jpg";
      const newFile: UploadedFile = {
        id: Date.now().toString(),
        filename: fileName,
        uri: asset.uri,
        type: "image",
        uploadTime: `Uploaded Just now`,
      };
      setFiles([newFile, ...files]);
    }
  };

  const handleVideoUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return Alert.alert("Permission needed");

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];

      // 1. Upload and Analyze
      const analysisResult = await uploadToServer(asset);

      if (analysisResult) {
        // 2. If successful, save locally and navigate
        const fileName = asset.uri.split("/").pop() || "video.mp4";

        const newFile: UploadedFile = {
          id: Date.now().toString(),
          filename: fileName,
          uri: asset.uri,
          type: "video",
          uploadTime: `Analyzed Just now`,
        };

        setFiles([newFile, ...files]);

        // Optional: Auto-navigate to results
        navigateToResults(newFile, analysisResult);
      }
    }
  };

  return (
    <View style={styles.container}>
      <AppBar />
      <ScrollView style={styles.content}>
        <View style={styles.row}>
          <Text
            style={[styles.selectionTitle, { color: Colors.light.secondary }]}
          >
            Recently Analyzed Hogs
          </Text>
        </View>

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

              <TouchableOpacity
                style={styles.seeResultsButton}
                onPress={() => navigateToResults(file)}
              >
                <Text style={styles.seeResultsText}>See Results  </Text>
                <ArrowRight size={18} color={Colors.light.secondary} weight="bold"/>
              </TouchableOpacity>
            </DropdownItem>
          ))
        )}
      </ScrollView>

      {/* Disable buttons while uploading to prevent double clicks */}
      {!isUploading && (
        <FloatingActionButton
          onImagePress={handleImageUpload}
          onVideoPress={handleVideoUpload}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {},
  selectionTitle: {
    fontSize: 16,
    fontFamily: "NunitoSans-SemiBold",
    padding: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  emptyText: {
    textAlign: "center",
    color: Colors.light.subtext,
    marginTop: 40,
    fontSize: 16,
    fontFamily: "NunitoSans-Regular",
  },
  fileType: {
    fontSize: 14,
    color: Colors.light.subtext,
    marginBottom: 16,
    fontFamily: "NunitoSans-Regular",
  },
  previewImage: {
    width: "100%",
    height: 200,
    marginTop: 8,
    borderRadius: 8,
  },
  videoInfo: {
    fontSize: 14,
    color: Colors.light.subtext,
    fontFamily: "NunitoSans-Regular",
  },
  seeMoreButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: "center",
  },
  seeResultsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: 'flex-end',
    marginTop: 8
  },
  seeResultsText: {
    color: Colors.light.secondary,
    fontSize: 14,
    fontFamily: "NunitoSans-SemiBold",
  },
  loadingContainer: {
    alignItems: "center",
    padding: 20,
  },
});
