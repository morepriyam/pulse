Pod::Spec.new do |s|
  s.name           = 'CallDetector'
  s.version        = '1.0.0'
  s.summary        = 'Phone/VoIP call detection (CXCallObserver) + background-task helpers'
  s.description    = 'Local Expo module: reports active-call state so the recorder can drop the mic during calls, plus iOS background-task helpers to finalize a clip when backgrounded.'
  s.author         = 'Pulse'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
