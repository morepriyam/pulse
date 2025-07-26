import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';

interface URLParams {
  mode?: string;
  url?: string;
  config?: string;
}

export function URLHandler() {
  useEffect(() => {
    // Handle URL when app is already running
    const subscription = Linking.addEventListener('url', handleURL);

    // Handle URL when app is opened from URL
    handleInitialURL();

    return () => subscription?.remove();
  }, []);

  const handleInitialURL = async () => {
    const initialUrl = await Linking.getInitialURL();
    if (initialUrl) {
      handleURL({ url: initialUrl });
    }
  };

  const handleURL = ({ url }: { url: string }) => {
    try {
      const parsed = Linking.parse(url);
      
      // Validate scheme
      if (parsed.scheme !== 'pulsecam') {
        console.warn('Invalid URL scheme:', parsed.scheme);
        return;
      }

      const params = parsed.queryParams as URLParams;
      
      // Handle different modes
      switch (params.mode) {
        case 'upload':
          handleUploadMode(params);
          break;
        case 'config':
          handleConfigMode(params);
          break;
        default:
          // Default behavior - navigate to camera
          router.push('/(camera)/shorts');
          break;
      }
    } catch (error) {
      console.error('Error parsing URL:', error);
      Alert.alert(
        'Invalid Link',
        'The provided link is not valid or cannot be processed.'
      );
    }
  };

  const handleUploadMode = (params: URLParams) => {
    if (!params.url) {
      Alert.alert('Error', 'Upload URL is required for upload mode');
      return;
    }

    // Validate upload URL
    if (!isValidURL(params.url)) {
      Alert.alert('Error', 'Invalid upload URL provided');
      return;
    }

    // Navigate to camera with upload configuration
    router.push({
      pathname: '/(camera)/shorts',
      params: {
        uploadMode: 'true',
        uploadUrl: params.url,
      },
    });
  };

  const handleConfigMode = (params: URLParams) => {
    if (!params.config) {
      Alert.alert('Error', 'Configuration data is required for config mode');
      return;
    }

    try {
      // Parse and validate JSON config
      const configData = JSON.parse(decodeURIComponent(params.config));
      
      // Basic validation of config structure
      if (!isValidConfig(configData)) {
        Alert.alert('Error', 'Invalid configuration format');
        return;
      }

      // Navigate to camera with configuration
      router.push({
        pathname: '/(camera)/shorts',
        params: {
          configMode: 'true',
          config: params.config,
        },
      });
    } catch (error) {
      console.error('Error parsing config:', error);
      Alert.alert('Error', 'Invalid configuration data');
    }
  };

  const isValidURL = (urlString: string): boolean => {
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const isValidConfig = (config: any): boolean => {
    // Basic validation - ensure it's an object and has expected structure
    return (
      typeof config === 'object' &&
      config !== null &&
      // Add specific validation rules as needed
      true
    );
  };

  // This component doesn't render anything
  return null;
}