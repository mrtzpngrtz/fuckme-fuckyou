# FUCKME/FUCKYOU Voice Cloning System

An art installation application that allows users to record their voice, capture an image, get roasted, and hear the roast spoken in their own cloned voice.

## Features

- **Voice Recording**: Records a 10-second voice sample for cloning
- **Image Capture**: Upload an image via drag & drop or capture from webcam
- **AI Roasting**: Uses Gemini AI to generate harsh roasts based on the uploaded image
- **Voice Cloning**: Speaks the roast in the user's cloned voice using ComfyUI's F5-TTS

## Requirements

- Node.js
- ComfyUI running locally at http://127.0.0.1:8188/
- F5-TTS and Whisper nodes installed in ComfyUI
- Gemini API key (included in the code)

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Make sure ComfyUI is running with F5-TTS and Whisper nodes installed
4. Start the server:
   ```
   node server.js
   ```
5. Open http://localhost:3001/ in your browser

## How It Works

1. **Record Voice**: Click the "RECORD VOICE SAMPLE" button to record a 10-second voice sample
2. **Capture Image**: Upload an image by dragging and dropping, choosing a file, or using the webcam
3. **Generate Roast**: Click the "FUCK ME" button to generate a roast based on the image
4. **Speak Roast**: Click the "SPEAK ROAST" button to hear the roast in your cloned voice

## Technical Details

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js
- **Voice Cloning**: ComfyUI with F5-TTS
- **Roast Generation**: Gemini AI API
- **Audio Processing**: Web Audio API for recording, Whisper for transcription

## Art Installation Context

This application is designed for an art installation called "FUCKME/FUCKYOU" where participants consent to being roasted by an AI and hearing the roast in their own voice, creating a confrontational yet reflective experience.
