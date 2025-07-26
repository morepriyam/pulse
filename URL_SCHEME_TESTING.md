# PulseCam URL Scheme Testing

This document provides examples for testing the PulseCam URL scheme functionality.

## URL Scheme Format

The app uses the `pulsecam://` scheme to handle deep links.

## Example URLs

### Basic Camera Opening
```
pulsecam://
```
Opens the camera in default mode.

### Upload Mode
```
pulsecam://?mode=upload&url=https://example.com/upload
```
Opens the camera in upload mode with the specified upload endpoint.

### Configuration Mode
```
pulsecam://?mode=config&config=%7B%22duration%22%3A30%2C%22quality%22%3A%22high%22%7D
```
Opens the camera with JSON configuration (URL-encoded). The decoded config is:
```json
{"duration": 30, "quality": "high"}
```

## Security Features

- URL validation ensures upload URLs use HTTP/HTTPS protocols only
- JSON configuration is validated before application
- Invalid URLs or malformed data will show error messages
- The app gracefully handles missing or invalid parameters

## Visual Indicators

When deep link parameters are active, the camera screen will show:
- "Upload Mode Enabled" indicator when upload mode is active
- "External Config Applied" indicator when configuration is provided
- These indicators appear below any existing draft continuation messages

## Implementation Details

- The URL handler is integrated into the main app layout
- Camera screen accepts and processes the deep link parameters
- Upload functionality automatically triggers after video recording
- Configuration can override default settings like recording duration