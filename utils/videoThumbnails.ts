import { getThumbnailAsync } from 'expo-video-thumbnails';

export interface ThumbnailOptions {
  time?: number;
  quality?: number;
}

export async function generateVideoThumbnail(
  videoUri: string,
  options: ThumbnailOptions = {}
): Promise<string | null> {
  try {
    const { time = 0, quality = 1.0 } = options;
    
    const { uri } = await getThumbnailAsync(videoUri, {
      time,
      quality,
    });
    
    console.log('Generated thumbnail:', uri);
    return uri;
  } catch (error) {
    console.error('Error generating video thumbnail:', error);
    return null;
  }
}

export async function generateMultipleThumbnails(
  videoUris: string[],
  options: ThumbnailOptions = {}
): Promise<(string | null)[]> {
  try {
    const thumbnailPromises = videoUris.map(uri => 
      generateVideoThumbnail(uri, options)
    );
    
    return await Promise.all(thumbnailPromises);
  } catch (error) {
    console.error('Error generating multiple thumbnails:', error);
    return videoUris.map(() => null);
  }
} 