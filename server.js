const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const FormData = require('form-data');
const { execSync } = require('child_process');

// Load configuration from config.json
const config = require('./config.json');

const PORT = config.api.port;
const COMFYUI_API = config.api.comfyui;
const GEMINI_API_KEY = config.api.gemini.key;
const GEMINI_API_URL = config.api.gemini.url;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.wav': 'audio/wav',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
};

// Temporary storage for audio and image files
const TEMP_DIR = path.join(__dirname, config.paths.temp_dir);
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

// Helper function to make requests to ComfyUI
async function requestComfyUI(method, endpoint, data = null, isFormData = false) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, COMFYUI_API);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {}
        };

        if (data && !isFormData) {
            const jsonData = JSON.stringify(data);
            options.headers['Content-Type'] = 'application/json';
            options.headers['Content-Length'] = Buffer.byteLength(jsonData);
        }

        if (isFormData && data) {
            Object.assign(options.headers, data.getHeaders());
        }

        const req = http.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        // Try to parse as JSON, but if it fails, return the raw buffer
                        const contentType = res.headers['content-type'] || '';
                        if (contentType.includes('application/json')) {
                            resolve(JSON.parse(body.toString()));
                        } else {
                            resolve(body);
                        }
                    } catch (e) {
                        resolve(body);
                    }
                } else {
                    reject(new Error(`ComfyUI API error: ${res.statusCode} ${body.toString()}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`ComfyUI API request failed: ${error.message}`));
        });

        if (data) {
            if (isFormData) {
                data.pipe(req);
            } else {
                req.write(JSON.stringify(data));
                req.end();
            }
        } else {
            req.end();
        }
    });
}

// Helper function to make requests to Gemini API
async function requestGemini(imageBase64, prompt, language) {
    return new Promise((resolve, reject) => {
        const apiUrl = `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`;
        
        let promptText = prompt;
        if (!promptText) {
            // Use prompts from config
            promptText = config.prompts[language] || config.prompts.english;
        }
        
        const data = JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: promptText
                        },
                        {
                            inline_data: {
                                mime_type: "image/jpeg",
                                data: imageBase64
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.9,
                maxOutputTokens: 800
            }
        });

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(apiUrl, options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const response = JSON.parse(body);
                        resolve(response);
                    } catch (e) {
                        reject(new Error(`Failed to parse Gemini API response: ${e.message}`));
                    }
                } else {
                    reject(new Error(`Gemini API error: ${res.statusCode} ${body}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Gemini API request failed: ${error.message}`));
        });

        req.write(data);
        req.end();
    });
}

// API routes
async function handleApiRequest(req, res) {
    const parsedUrl = url.parse(req.url);
    const endpoint = parsedUrl.pathname.replace('/api', '');

    try {
        // Check ComfyUI status
        if (endpoint === '/status' && req.method === 'GET') {
            try {
                const status = await requestComfyUI('GET', '/system_stats');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'running', details: status }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: 'ComfyUI is not running' }));
            }
            return;
        }

        // Upload audio file
        if (endpoint === '/upload' && req.method === 'POST') {
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            
            req.on('end', async () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    
            // Try to determine the content type from the request headers
            let contentType = req.headers['content-type'] || 'audio/webm';
            
            // Create a simple WAV file header for better compatibility
            // This is a minimal WAV header for PCM format
            const createWavHeader = (sampleRate = 44100, numChannels = 1, bitsPerSample = 16) => {
                const dataSize = buffer.length;
                const headerSize = 44;
                const totalSize = headerSize + dataSize;
                
                const header = Buffer.alloc(headerSize);
                
                // RIFF chunk descriptor
                header.write('RIFF', 0);
                header.writeUInt32LE(totalSize - 8, 4);
                header.write('WAVE', 8);
                
                // "fmt " sub-chunk
                header.write('fmt ', 12);
                header.writeUInt32LE(16, 16); // fmt chunk size
                header.writeUInt16LE(1, 20); // PCM format
                header.writeUInt16LE(numChannels, 22);
                header.writeUInt32LE(sampleRate, 24);
                header.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28); // byte rate
                header.writeUInt16LE(numChannels * bitsPerSample / 8, 32); // block align
                header.writeUInt16LE(bitsPerSample, 34);
                
                // "data" sub-chunk
                header.write('data', 36);
                header.writeUInt32LE(dataSize, 40);
                
                return header;
            };
            
            // Save the original audio file in our temp directory
            const originalAudioPath = path.join(TEMP_DIR, 'original_audio.webm');
            fs.writeFileSync(originalAudioPath, buffer);
            console.log('Original audio saved to:', originalAudioPath, 'Size:', buffer.length, 'bytes');
            
            // Convert WebM to WAV using ffmpeg
            const wavOutputPath = path.join(TEMP_DIR, 'converted_audio.wav');
            try {
                // Use ffmpeg to convert WebM to WAV
                execSync(`ffmpeg -y -i "${originalAudioPath}" "${wavOutputPath}"`);
                console.log('Audio converted to WAV:', wavOutputPath);
                
                // Copy the converted WAV file to ComfyUI's input directory
                const comfyUIInputPath = config.paths.comfyui_input;
                fs.copyFileSync(wavOutputPath, comfyUIInputPath);
                console.log('Converted WAV file copied to ComfyUI input directory:', comfyUIInputPath);
            } catch (error) {
                console.error('Error converting or copying audio:', error.message);
            }
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Audio saved successfully' }));
                } catch (error) {
                    console.error('Upload error:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: error.message }));
                }
            });
            return;
        }

        // Upload image and get roast from Gemini
        if (endpoint === '/roast' && req.method === 'POST') {
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            
            req.on('end', async () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    let imageData, contentType;
                    
                    // Check if it's JSON with base64 image or raw image data
                    try {
                        const jsonData = JSON.parse(buffer.toString());
                        if (jsonData.image) {
                            // Extract base64 data without the prefix
                            const base64Data = jsonData.image.split(';base64,').pop();
                            imageData = Buffer.from(base64Data, 'base64');
                            contentType = jsonData.image.split(';')[0].split(':')[1];
                        }
                    } catch (e) {
                        // Not JSON, assume it's raw image data
                        imageData = buffer;
                        contentType = req.headers['content-type'] || 'image/jpeg';
                    }
                    
                    if (!imageData) {
                        throw new Error('No image data provided');
                     }
                    
                    // Save the image file temporarily
                    const imagePath = path.join(TEMP_DIR, 'image.jpg');
                    fs.writeFileSync(imagePath, imageData);
                    
                    // Convert image to base64 for Gemini API
                    const imageBase64 = imageData.toString('base64');
                    
                    // Get language preference from request
                    let language = 'english';
                    
                    try {
                        const requestData = buffer.toString();
                        const jsonData = JSON.parse(requestData);
                        
                        if (jsonData && jsonData.language) {
                            language = jsonData.language;
                        }
                    } catch (e) {
                        console.error('Error parsing language preference:', e);
                    }
                    
                    // Send to Gemini API
                    const geminiResponse = await requestGemini(imageBase64, null, language);
                    
                    // Extract the roast text and append suffix in the appropriate language
                    let roastText = geminiResponse.candidates[0].content.parts[0].text;
                    const suffix = language === 'german' ? config.responses.german_suffix : config.responses.english_suffix;
                    roastText = roastText.trim() + "\n\n" + suffix;
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: true, 
                        roast: roastText
                    }));
                } catch (error) {
                    console.error('Roast error:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: error.message }));
                }
            });
            return;
        }

        // Generate voice
        if (endpoint === '/generate' && req.method === 'POST') {
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            
            req.on('end', async () => {
                try {
                    const data = JSON.parse(Buffer.concat(chunks).toString());
                    const text = data.text;
                    
                    if (!text) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Text is required' }));
                        return;
                    }
                    
                    // Check if the text is in German to determine which model to use
                    const language = data.language || 'english';
                    const model = config.tts.models[language] || config.tts.models.english;
                    
                    // Find the audio file in the temp directory
                    const tempFiles = fs.readdirSync(TEMP_DIR);
                    console.log('Files in temp directory:', tempFiles);
                    
                    // Use the converted WAV file
                    const audioFile = 'untitled.wav';
                    
                    console.log('Using audio file name for ComfyUI:', audioFile);
                    
                    // Create workflow based on the JSON
                    const workflow = {
                        "2": {
                            "inputs": {
                                "audio": [
                                    "12",
                                    0
                                ]
                            },
                            "class_type": "PreviewAudio",
                            "_meta": {
                                "title": "PreviewAudio"
                            }
                        },
                        "4": {
                            "inputs": {
                                "audio": audioFile
                            },
                            "class_type": "LoadAudio",
                            "_meta": {
                                "title": "LoadAudio"
                            }
                        },
                        "12": {
                            "inputs": {
                                "sample_text": [
                                    "13",
                                    0
                                ],
                                "speech": text,
                                "seed": Math.floor(Math.random() * 10000),
                                "model": model,
                                "model_type": "F5TTS_Base",
                                "vocoder": config.tts.vocoder,
                                "speed": config.tts.default_speed,
                                "sample_audio": [
                                    "4",
                                    0
                                ]
                            },
                            "class_type": "F5TTSAudioInputs",
                            "_meta": {
                                "title": "F5-TTS Audio from inputs"
                            }
                        },
                        "13": {
                            "inputs": {
                                "model": "base",
                                "language": language === 'german' ? 'German' : 'English',
                                "prompt": "",
                                "audio": [
                                    "4",
                                    0
                                ]
                            },
                            "class_type": "Apply Whisper",
                            "_meta": {
                                "title": "Apply Whisper"
                            }
                        },
                        "14": {
                            "inputs": {
                                "mode": "raw value",
                                "displaytext": text,
                                "input": [
                                    "13",
                                    0
                                ]
                            },
                            "class_type": "DisplayAny",
                            "_meta": {
                                "title": "🔧 Display Any"
                            }
                        }
                    };
                    
                    // Queue prompt
                    const promptData = await requestComfyUI('POST', '/prompt', {
                        prompt: workflow,
                        client_id: `fuckme-fuckyou-${Date.now()}`
                    });
                    
                    const promptId = promptData.prompt_id;
                    
                    // Poll for completion (simplified for now)
                    let audioFilename = null;
                    let attempts = 0;
                    const maxAttempts = 60; // 60 seconds timeout
                    
                    while (!audioFilename && attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
                        
                        try {
                            const historyData = await requestComfyUI('GET', `/history/${promptId}`);
                            
                            console.log('Polling history data for prompt:', promptId);
                            if (historyData[promptId]?.outputs?.[2]?.audio) {
                                const audioData = historyData[promptId].outputs[2].audio;
                                console.log('Found audio data:', audioData);
                                
                                // Extract the filename from the audio data
                                if (Array.isArray(audioData) && audioData.length > 0 && audioData[0].filename) {
                                    audioFilename = audioData[0].filename;
                                    console.log('Extracted audio filename:', audioFilename);
                                    break;
                                }
                            }
                        } catch (error) {
                            console.error('Error polling for completion:', error);
                        }
                        
                        attempts++;
                    }
                    
                    if (audioFilename) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            success: true, 
                            audioUrl: `/api/audio?filename=${encodeURIComponent(audioFilename)}`
                        }));
                    } else {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            success: false, 
                            message: 'Generation timed out or failed' 
                        }));
                    }
                } catch (error) {
                    console.error('Generation error:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: error.message }));
                }
            });
            return;
        }

        // Get generated audio
        if (endpoint.startsWith('/audio') && req.method === 'GET') {
            const params = new URLSearchParams(parsedUrl.query);
            const filename = params.get('filename');
            
            if (!filename) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Filename is required' }));
                return;
            }
            
            try {
                console.log('Fetching audio file:', filename);
                
                // For temp files, we need to use a different endpoint
                let viewUrl = `/view?filename=${encodeURIComponent(filename)}&type=audio`;
                if (filename.includes('temp')) {
                    viewUrl = `/view?filename=${encodeURIComponent(filename)}&subfolder=&type=temp`;
                }
                
                console.log('Using view URL:', viewUrl);
                const audioData = await requestComfyUI('GET', viewUrl);
                
                // Determine content type based on file extension
                let contentType = 'audio/wav';
                if (filename.endsWith('.flac')) {
                    contentType = 'audio/flac';
                } else if (filename.endsWith('.mp3')) {
                    contentType = 'audio/mp3';
                }
                
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(audioData);
            } catch (error) {
                console.error('Audio fetch error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: error.message }));
            }
            return;
        }

        // If no API route matches
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'API endpoint not found' }));
    } catch (error) {
        console.error('API error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: error.message }));
    }
}

const server = http.createServer(async (req, res) => {
    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    // Handle API requests
    if (req.url.startsWith('/api/')) {
        await handleApiRequest(req, res);
        return;
    }
    
    // Serve static files
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }
    
    const extname = path.extname(filePath);
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';
    
    try {
        const content = await fs.promises.readFile(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.writeHead(404);
            res.end('404 Not Found');
        } else {
            res.writeHead(500);
            res.end(`Server Error: ${error.code}`);
        }
    }
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Open http://localhost:${PORT}/ in your browser to use the FUCKME/FUCKYOU Voice Cloner`);
});
