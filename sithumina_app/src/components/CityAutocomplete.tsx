import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Keyboard,
  ViewStyle,
  TextStyle,
  Platform,
} from 'react-native';
import { CityEntry, searchCities } from '../data/sri-lanka-cities';

interface CityAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelectCity?: (city: CityEntry) => void;
  placeholder?: string;
  inputStyle?: TextStyle;
  containerStyle?: ViewStyle;
  maxSuggestions?: number;
  inlineMode?: boolean;
}

export default function CityAutocomplete({
  value,
  onChangeText,
  onSelectCity,
  placeholder = 'Enter city name / නගරය ඇතුළත් කරන්න',
  inputStyle,
  containerStyle,
  maxSuggestions = 8,
  inlineMode = false,
}: CityAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<CityEntry[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const selectedNameRef = useRef<string | null>(null);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  // Update suggestions when value changes
  useEffect(() => {
    // If value matches what was just clicked/selected, don't reopen dropdown
    if (selectedNameRef.current !== null) {
      if (value.trim().toLowerCase() === selectedNameRef.current.trim().toLowerCase()) {
        setShowDropdown(false);
        setSuggestions([]);
        return;
      }
      // Value has changed after selection -> allow new search
      selectedNameRef.current = null;
    }

    if (value.trim().length === 0) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const results = searchCities(value, maxSuggestions);
    setSuggestions(results);
    setShowDropdown(results.length > 0);
  }, [value, maxSuggestions]);

  // Close dropdown only if in absolute mode when keyboard is dismissed
  useEffect(() => {
    if (inlineMode) return;
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      setTimeout(() => setShowDropdown(false), 200);
    });
    return () => sub.remove();
  }, [inlineMode]);

  const handleSelect = useCallback(
    (city: CityEntry) => {
      selectedNameRef.current = city.name;
      setShowDropdown(false);
      setSuggestions([]);
      onChangeText(city.name);
      onSelectCity?.(city);
      Keyboard.dismiss();
    },
    [onChangeText, onSelectCity],
  );

  const handleChangeText = useCallback(
    (text: string) => {
      onChangeText(text);
    },
    [onChangeText],
  );

  const handleFocus = useCallback(() => {
    if (value.trim().length > 0) {
      const results = searchCities(value, maxSuggestions);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
    }
  }, [value, maxSuggestions]);

  const renderItem = useCallback(
    ({ item }: { item: CityEntry }) => (
      <TouchableOpacity
        style={styles.suggestionItem}
        onPress={() => handleSelect(item)}
        activeOpacity={0.6}
      >
        <Text style={styles.suggestionName}>{item.name}</Text>
        <Text style={styles.suggestionSinhala}>{item.sinhala}</Text>
      </TouchableOpacity>
    ),
    [handleSelect],
  );

  const keyExtractor = useCallback(
    (item: CityEntry, index: number) => `${item.name}-${index}`,
    [],
  );

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        ref={inputRef}
        style={[styles.input, inputStyle]}
        value={value}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        placeholder={placeholder}
        placeholderTextColor="#9E9A8F"
        autoCorrect={false}
        autoCapitalize="words"
      />

      {showDropdown && suggestions.length > 0 && (
        <View style={inlineMode ? styles.dropdownInline : styles.dropdown}>
          {suggestions.slice(0, maxSuggestions).map((item, idx) => (
            <React.Fragment key={`${item.name}-${idx}`}>
              {idx > 0 && <Separator />}
              <TouchableOpacity
                style={styles.suggestionItem}
                onPress={() => handleSelect(item)}
                delayPressIn={0}
                activeOpacity={0.5}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View pointerEvents="none" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.suggestionName}>{item.name}</Text>
                  <Text style={styles.suggestionSinhala}>{item.sinhala}</Text>
                </View>
                <View pointerEvents="none" style={styles.selectBadge}>
                  <Text style={styles.selectBadgeText}>Select ✓</Text>
                </View>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1000,
  },
  input: {
    backgroundColor: '#F4F2EA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    color: '#26231B',
    borderWidth: 1,
    borderColor: '#E7E2D0',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E7E2D0',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  dropdownInline: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: '#FFC20E',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  suggestionName: {
    fontSize: 14.5,
    color: '#26231B',
    fontWeight: '500',
    flexShrink: 1,
  },
  suggestionSinhala: {
    fontSize: 13,
    color: '#7A7565',
    marginLeft: 8,
  },
  selectBadge: {
    backgroundColor: '#FFC20E',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#26231B',
  },
  selectBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#26231B',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E7E2D0',
    marginHorizontal: 10,
  },
});
