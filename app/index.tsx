import { Text, View, StyleSheet, ScrollView, Alert, Image as RNImage, TouchableOpacity } from "react-native";
import { AppBar } from "@/components/appbar";
import { Colors } from "@/theme/colors"
import { FloatingActionButton } from "@/components/floating-action-button";
import { DropdownItem } from "@/components/dropdown-item";
import * as ImagePicker from 'expo-image-picker';
import { useState } from "react";
import { router } from "expo-router";

interface UploadedFile {
  id: string;
  filename: string;
  uri: string;
  type: 'image' | 'video';
  uploadTime: string;
}

export default function Index() {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const navigateToResults = (file: UploadedFile) => {
    router.push({
      pathname: '/results',
      params: {
        filename: file.filename,
        uri: file.uri,
        type: file.type,
      }
    })
  }

  const handleImageUpload = async () => {
    // Request Permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant permission to access photos.');
      return;
    }

    // Launch Image Picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    });

    if(!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const fileName = asset.uri.split('/').pop() || 'image.jpg';
      const now = new Date();
      const timeAgo = 'Just now';

      //Add to files list
      const newFile: UploadedFile = {
        id: Date.now().toString(),
        filename: fileName,
        uri: asset.uri,
        type: 'image',
        uploadTime: `Uploaded ${timeAgo}`,
      };

      setFiles([newFile, ...files]);
    }
  };

  const handleVideoUpload = async () => {
    // Request Permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant permission to access videos');
      return;
    }

    // Launch Video Picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: true,
      quality: 1,
    });

    if(!result.canceled && result.assets[0]){
      const asset = result.assets[0];
      const fileName = asset.uri.split('/').pop() || 'video.mp4';
      const timeAgo = 'Just now';

      //Add to files list
      const newFile: UploadedFile = {
        id: Date.now().toString(),
        filename: fileName,
        uri: asset.uri,
        type: 'video',
        uploadTime: `Uploaded ${timeAgo}`,
      };

      setFiles([newFile, ...files]);
      Alert.alert('Success', 'Video uploaded successfully!');
    }
  };
  
  return (
    <View style={styles.container}>
      <AppBar />
      <ScrollView style={styles.content}>
        <View style={styles.row}>
        <Text style={[styles.selectionTitle, { color: Colors.light.secondary }]}>
          Recently Analyzed Hogs
        </Text>
      </View>

      {files.length === 0 ? (
        <Text style={styles.emptyText}>No files uploaded yet.</Text>
      ) : (
        files.map((file) => (
          <DropdownItem
            key={file.id}
            title={file.filename}
            subtitle={file.uploadTime}
          >
            <Text style={styles.fileType}>Type: {file.type}</Text>
            {file.uri && file.type === 'image' && (
              <RNImage
                source={{ uri: file.uri }}
                style={styles.previewImage}
                resizeMode="cover"
              />
            )}
            {file.uri && file.type === 'video' && (
              <Text style={styles.videoInfo}>Video file: {file.filename}</Text>
            )}

            <TouchableOpacity 
              style={styles.seeMoreButton}
              onPress={() => navigateToResults(file)}
            >
              <Text style={styles.seeMoreText}>See Results</Text>
            </TouchableOpacity>
          </DropdownItem> 
        ))
      )}
      </ScrollView>
      <FloatingActionButton 
        onImagePress={handleImageUpload}
        onVideoPress={handleVideoUpload}
      />
    </View>
    
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    
  },
  selectionTitle: {
    fontSize: 16,
    fontFamily: 'NunitoSans-SemiBold',
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.light.subtext,
    marginTop: 40,
    fontSize: 16,
    fontFamily: 'NunitoSans-Regular',
  },
  fileType: {
    fontSize: 14,
    color: Colors.light.subtext,
    marginBottom: 8,
    fontFamily: 'NunitoSans-Regular',
  },
  previewImage: {
    width: '100%',
    height: 200,
    marginTop: 8,
    borderRadius: 8,
  },
  videoInfo: {
    fontSize: 14,
    color: Colors.light.subtext,
    fontFamily: 'NunitoSans-Regular',
  },
  seeMoreButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    // backgroundColor: Colors.light.primary,
    borderRadius: 8,
    alignSelf: 'center',
  },
  seeMoreText: {
    color: Colors.light.secondary,
    fontSize: 14,
    fontFamily: 'NunitoSans-SemiBold',
  }
});
