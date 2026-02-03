import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { CaretDown, CaretUp } from 'phosphor-react-native';
import { Colors } from '@/theme/colors';

export interface DropdownItemProps {
    title: string;
    subtitle?: string;
    children?: React.ReactNode;
    defaultExpanded?: boolean;
    style?: ViewStyle;
    onToggle?: (expanded: boolean) => void;
}

export function DropdownItem({
    title,
    subtitle,
    children,
    defaultExpanded = false,
    style,
    onToggle,
}: DropdownItemProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);

    const toggleExpand = () => {
        const newState = !expanded;
        setExpanded(newState);
        onToggle?.(newState);
    };

    return (
        <View style={[styles.container, style]}>
            <TouchableOpacity
                style={styles.header}
                onPress={toggleExpand}
                activeOpacity={0.7}
            >
                <View style={styles.textContainer}>
                    <Text style={styles.title}>{title}</Text>
                    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>
                {expanded ? (
                    <CaretUp size={24} color="#743535"/>
                ) : (
                    <CaretDown size={24} color="#743535"/>
                )}
            </TouchableOpacity>
            {expanded && (
                <View style={styles.content}>
                    {children}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderWidth: 1,
        borderColor: '#e0e0e0',
        backgroundColor: Colors.light.background,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: Colors.light.background,
    },
    textContainer: {
        flex: 1, 
    },
    title: {
        fontSize: 16,
        marginBottom: 4, 
        fontFamily: 'Nunito-Regular',
    },
    subtitle: {
        fontSize: 14,
        color: Colors.light.subtext,
        fontFamily: 'NunitoSans-Regular',
    },
    content: {
        padding: 16,
        backgroundColor: Colors.light.background
    },
});