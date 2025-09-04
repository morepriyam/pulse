// Reexport the native module. On web, it will be resolved to VideoConcatModule.web.ts
// and on native platforms to VideoConcatModule.ts
export { default } from './src/VideoConcatModule';
export { default as VideoConcatView } from './src/VideoConcatView';
export * from  './src/VideoConcat.types';
