import { Alert as NativeAlert, Platform, type AlertButton } from 'react-native';

/** react-native-web's Alert.alert is a no-op, so on web fall back to the browser dialogs. */
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS !== 'web') return NativeAlert.alert(title, message, buttons);
    const text = message ? `${title}\n\n${message}` : title;
    const actions = buttons?.filter(b => b.style !== 'cancel') ?? [];
    if (buttons && buttons.length > 1) { if (window.confirm(text)) actions[0]?.onPress?.(); }
    else { window.alert(text); buttons?.[0]?.onPress?.(); }
  },
};
