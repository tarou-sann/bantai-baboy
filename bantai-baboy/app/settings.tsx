import { AppBar } from "@/components/appbar";
import { Colors } from "@/theme/colors";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from "expo-router";
import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";

const SERVER_URL_KEY = '@server_url';
const DEFAULT_SERVER_URL = 'http://192.168.0.101:5000';

export default function Settings() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadServerUrl();
  }, []);

  const loadServerUrl = async () => {
    try {
      const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
      if (saved) {
        setServerUrl(saved);
      }
    } catch (error) {
      console.error('Failed to load server URL:', error);
    }
  };

  const saveServerUrl = async () => {
    if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
      Alert.alert('Invalid URL', 'URL must start with http:// or https://');
      return;
    }

    setIsSaving(true);
    try {
      await AsyncStorage.setItem(SERVER_URL_KEY, serverUrl);
      Alert.alert('Success', 'Server URL saved!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to save server URL');
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    try {
      const response = await fetch(`${serverUrl}/reset-tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        Alert.alert('✅ Success', 'Connected to server!');
      } else {
        Alert.alert('❌ Failed', 'Server responded but with an error');
      }
    } catch (error) {
      Alert.alert('❌ Connection Failed', 'Cannot reach server. Check URL and network.');
    }
  };

  return (
    <View style={styles.container}>
      <AppBar title="Settings" />
      
      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>Server Configuration</Text>
        
        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="http://192.168.0.101:5000"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <Text style={styles.hint}>
           Find your IP: Run ipconfig (Windows) or ifconfig (Mac/Linux)
        </Text>

        <TouchableOpacity
          style={styles.testButton}
          onPress={testConnection}
          activeOpacity={0.8}
        >
          <Text style={styles.testButtonText}> Test Connection</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={saveServerUrl}
          disabled={isSaving}
          activeOpacity={0.8}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? 'Saving...' : '💾 Save'}
          </Text>
        </TouchableOpacity>

        <View style={styles.presetsContainer}>
          <Text style={styles.presetsTitle}>Quick Presets:</Text>
          
          <TouchableOpacity
            style={styles.presetButton}
            onPress={() => setServerUrl('http://192.168.0.101:5000')}
          >
            <Text style={styles.presetText}>🏠 Home (192.168.0.101)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.presetButton}
            onPress={() => setServerUrl('http://192.168.1.100:5000')}
          >
            <Text style={styles.presetText}>🏢 School (192.168.1.100)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.presetButton}
            onPress={() => setServerUrl('http://10.201.1.168:5000')}
          >
            <Text style={styles.presetText}>📱 Hotspot (10.0.0.5)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ Instructions:</Text>
          <Text style={styles.infoText}>
            1. Make sure your phone and computer are on the same WiFi{'\n'}
            2. Find your computer IP address{'\n'}
            3. Enter it above (keep port 5000){'\n'}
            4. Test connection{'\n'}
            5. Save and start analyzing!
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'NunitoSans-Bold',
    color: Colors.light.secondary,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontFamily: 'NunitoSans-SemiBold',
    color: Colors.light.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.light.white,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontFamily: 'NunitoSans-Regular',
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    fontFamily: 'NunitoSans-Regular',
    color: Colors.light.subtext,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  testButton: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  testButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'NunitoSans-SemiBold',
  },
  saveButton: {
    backgroundColor: Colors.light.primary,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 30,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'NunitoSans-SemiBold',
  },
  presetsContainer: {
    marginBottom: 30,
  },
  presetsTitle: {
    fontSize: 16,
    fontFamily: 'NunitoSans-SemiBold',
    color: Colors.light.text,
    marginBottom: 12,
  },
  presetButton: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  presetText: {
    fontSize: 14,
    fontFamily: 'NunitoSans-Regular',
    color: Colors.light.text,
  },
  infoBox: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  infoTitle: {
    fontSize: 16,
    fontFamily: 'NunitoSans-Bold',
    color: '#1976D2',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    fontFamily: 'NunitoSans-Regular',
    color: '#1976D2',
    lineHeight: 22,
  },
});