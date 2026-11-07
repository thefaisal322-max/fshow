import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Height of the on-screen keyboard (0 when hidden). */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, (e) => setH(e.endCoordinates.height));
    const b = Keyboard.addListener(hideEvt, () => setH(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return h;
}

/**
 * Space to leave under a bottom bar (comment box, chat box, toolbar).
 * Android draws the app behind the system buttons (edge-to-edge), so we keep
 * inputs above the buttons — and above the keyboard while typing.
 * iOS: KeyboardAvoidingView handles the keyboard, we only add the home-bar inset.
 */
export function useBottomSpace(): number {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  if (Platform.OS === 'android') return kb > 0 ? kb : insets.bottom;
  return kb > 0 ? 0 : insets.bottom;
}
