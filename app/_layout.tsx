import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from "react";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Nunito': require('@/assets/fonts/Nunito/Nunito-Regular.ttf'),
    'Nunito-Bold': require('@/assets/fonts/Nunito/Nunito-Bold.ttf'),
    'Nunito-Black': require('@/assets/fonts/Nunito/Nunito-Black.ttf'),
    'Nunito-SemiBold': require('@/assets/fonts/Nunito/Nunito-SemiBold.ttf'),
    'NunitoSans-Regular': require('@/assets/fonts/Nunito/NunitoSans-Regular.ttf'),
    'NunitoSans-SemiBold': require('@/assets/fonts/Nunito/NunitoSans-SemiBold.ttf'),
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  } 

  return <Stack 
    screenOptions={{ headerShown: false }}
  />;
}
