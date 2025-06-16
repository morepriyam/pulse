import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';

export const useFirstTimeOpen = () => {
  const [isFirstTimeOpen, setIsFirstTimeOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  React.useEffect(() => {
    async function checkFirstTimeOpen() {
        try {
            const firstTimeOpen = await AsyncStorage.getItem('onboardingComplete');
           
            if(firstTimeOpen === null) {
                setIsFirstTimeOpen(true);
            }else{
                    setIsFirstTimeOpen(false);
                }
            
        } catch (error) {
            console.error('Error checking first time open:', error);
        } finally {
            setIsLoading(false);
        }
    }
    checkFirstTimeOpen();
  }, []);

  return { isFirstTimeOpen, isLoading };
};