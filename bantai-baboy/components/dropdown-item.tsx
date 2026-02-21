import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { CaretDown, CaretUp, TrendUp, Info } from 'phosphor-react-native';
import { Colors } from '@/theme/colors';

export interface DropdownItemProps {
    title: string;
    subtitle?: string;
    children?: React.ReactNode;
    defaultExpanded?: boolean;
    style?: ViewStyle;
    onToggle?: (expanded: boolean) => void;
    onCheckAnalytics?: () => void;
    onSeeResults?: () => void;
    showActions?: boolean;
}

export function DropdownItem({
    title,
    subtitle,
    children,
    defaultExpanded = false,
    style,
    onToggle,
    onCheckAnalytics,
    onSeeResults,
    showActions = false,
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
                    <CaretUp size={20} color={Colors.light.secondary} weight="bold"/>
                ) : (
                    <CaretDown size={20} color={Colors.light.secondary} weight="bold"/>
                )}
            </TouchableOpacity>
            {expanded && (
                <View style={styles.content}>
                    {children}
                    {showActions && (
                        <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={styles.analyticsButton}
                            onPress={onCheckAnalytics}
                            activeOpacity={0.8}
                        >
                            <TrendUp size={16} color={Colors.light.secondary} weight="bold" />
                            <Text style={styles.analyticsText}>Check Analytics</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.resultsButton}
                            onPress={onSeeResults}
                            activeOpacity={0.8}
                        >
                            <Info size={16} color={Colors.light.white} weight="bold" />
                            <Text style={styles.resultsText}>See Results</Text>
                        </TouchableOpacity>
                    </View>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 4,
        borderWidth: 1,
        borderColor: Colors.light.white,
        backgroundColor: Colors.light.white,
        marginTop: 5,
        marginLeft: 8,
        marginRight: 8,
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: Colors.light.white,
        borderRadius: 8,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
        color: Colors.light.text,
        fontFamily: 'Nunito-Regular',
    },
    subtitle: {
        fontSize: 14,
        color: Colors.light.subtext,
        fontFamily: 'NunitoSans-Regular',
    },
    content: {
        padding: 16,
        backgroundColor: Colors.light.white,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 16,
        gap: 75,
    },
    analyticsButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: Colors.light.results,
        backgroundColor: 'transparent',
    },
    analyticsText: {
        color: Colors.light.results,
        fontSize: 12,
        fontFamily: 'NunitoSans-SemiBold',
    },
   resultsButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: Colors.light.results,
    },
    resultsText: {
        color: Colors.light.white,
        fontSize: 12,
        fontFamily: 'NunitoSans-SemiBold',
    },
});