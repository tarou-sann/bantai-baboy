import { View, Text, StyleSheet, ScrollView, Image as RNImage, TouchableOpacity } from 'react-native';
import { AppBar } from '@/components/appbar';
import { DropdownItem } from '@/components/dropdown-item';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';
import { Colors } from '@/theme/colors';

export default function Results() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const { filename, uri, type } = params;

    return (
        <View style={styles.container}>
            <AppBar 
                leftIcon={<ArrowLeft size={28} color={Colors.light.secondary} weight="bold" />}
                onLeftIconPress={() => router.back()}
            />

            <ScrollView style={styles.content}>
                <View style={styles.mediaContainer}>
                    {type === 'image' && uri ? (
                        <RNImage 
                            source={{uri: uri as string}}
                            style={styles.mediaPreview}
                            resizeMode="cover"
                        />
                    ) : (
                        <View style={styles.placeholderMedia}>
                            <Text style={styles.placeholderText}>Video Preview</Text>
                        </View>
                    )}
                </View>
                
                <Text style={styles.detectedTitle}>Detected Hog</Text>

                <DropdownItem title='Results' defaultExpanded={false}>
                    <Text style={styles.placeholderContent}>
                        Results show that the hog is suffering from...
                    </Text>
                </DropdownItem>

                <DropdownItem title='Causes'>
                    <Text style={styles.placeholderContent}>
                        Possible causes include:
                        {"\n"}- Cause 1
                        {"\n"}- Cause 2
                        {"\n"}- Cause 3
                    </Text>
                </DropdownItem>

                <DropdownItem title='Suggestions' defaultExpanded={false}>
                    <Text style={styles.placeholderContent}>
                        Suggested Actions:
                        {"\n"}- Suggestion 1
                        {"\n"}- Suggestion 2
                        {"\n"}- Suggestion 3
                    </Text>
                </DropdownItem>
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1, 
        backgroundColor: Colors.light.background,
    },
    content: {
        flex: 1,
    },
    mediaContainer: {
        padding: 16,
        alignItems: 'center',
    },
    mediaPreview: {
        width: 200,
        height: 200,
        borderRadius: 8, 
        backgroundColor: Colors.light.background,
    }, 
    placeholderMedia: {
        width: 200,
        height: 200,
        borderRadius: 8,
        backgroundColor: Colors.light.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderText: {
        color: Colors.light.subtext,
        fontSize: 16,
        fontFamily: 'NunitoSans-Regular',
    },
    detectedTitle: {
        fontSize: 18,
        fontFamily: 'NunitoSans-SemiBold',
        textAlign: 'center',
        marginBottom: 16,
        color: Colors.light.text,
    },
    placeholderContent: {
        fontSize: 14,
        color: Colors.light.subtext,
        fontFamily: 'NunitoSans-Regular',
        lineHeight: 20,
    }
})