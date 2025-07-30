#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RNVideoConcat, NSObject)

RCT_EXTERN_METHOD(concatenate:(NSArray *)segmentPaths
                  options:(NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end 