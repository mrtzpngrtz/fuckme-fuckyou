document.addEventListener('DOMContentLoaded', async () => {
    // Load config
    let config;
    try {
        const response = await fetch('config.json');
        config = await response.json();
    } catch (error) {
        console.error('Error loading config:', error);
        config = {
            prompts: {
                english: {
                    welcome: "Mirror mirror on the wall, who's the fairest of them all?",
                    recording: "Recording your voice...",
                    processing: "Processing...",
                    analyzing: "Analyzing image...",
                    generating: "Generating roast...",
                    playAgain: "PLAY AGAIN"
                },
                german: {
                    welcome: "Spieglein Spieglein an der Wand wer ist die/der/das schönste im ganzen Land",
                    recording: "Stimme wird aufgenommen...",
                    processing: "Verarbeitung...",
                    analyzing: "Bild wird analysiert...",
                    generating: "Roast wird generiert...",
                    playAgain: "ERNEUT ABSPIELEN"
                }
            },
            settings: {
                recordingDuration: 10,
                countdownDuration: 5,
                textHideTimeout: 3000,
                webcam: {
                    width: 1920,
                    height: 1080
                }
            }
        };
    }
    
    // DOM Elements - Pages
    const page1 = document.getElementById('page1');
    const page2 = document.getElementById('page2');
    const page3 = document.getElementById('page3');
    const page4 = document.getElementById('page4');
    
    // DOM Elements - Navigation
    const nextToPage2 = document.getElementById('nextToPage2');
    const nextToPage3 = document.getElementById('nextToPage3');
    const nextToPage4 = document.getElementById('nextToPage4');
    
    // DOM Elements - Recording
    const recordBtn = document.getElementById('recordBtn');
    const statusEl = document.getElementById('status');
    const generatedAudio = document.getElementById('generatedAudio');
    const recordingProgress = document.getElementById('recordingProgress');
    const recordingProgressBar = document.getElementById('recordingProgressBar');
    const recordingProgressText = document.getElementById('recordingProgressText');
    const generatingProgress = document.getElementById('generatingProgress');
    const generatingProgressBar = document.getElementById('generatingProgressBar');
    
    // Get the audio element for storing the recorded audio
    const sampleAudio = document.getElementById('sampleAudio');
    
    // DOM Elements - Language Selection
    const englishBtn = document.getElementById('englishBtn');
    const germanBtn = document.getElementById('germanBtn');
    
    // DOM Elements - Image
    const webcamBtn = document.getElementById('webcamBtn');
    const webcam = document.getElementById('webcam');
    const imagePreview = document.getElementById('imagePreview');
    const roastingProgress = document.getElementById('roastingProgress');
    const roastingProgressBar = document.getElementById('roastingProgressBar');
    const roastText = document.getElementById('roastText');
    const playAgainBtn = document.getElementById('playAgainBtn');
    
    // DOM Elements - Minimal Audio Player
    const minimalProgressBar = document.getElementById('minimalProgressBar');
    
    // Server API endpoint
    const API_URL = '/api';
    
    // Variables - Voice
    let mediaRecorder;
    let audioChunks = [];
    let recordedBlob = null;
    let recordingInterval;
    let recordingTime = 0;
    let recordingDuration = 10; // 10 seconds default
    
    // Variables - Image
    let webcamStream = null;
    let capturedImage = null;
    
    // Variables - Language
    let selectedLanguage = ''; // No default language
    
    // Initialize
    checkComfyUIStatus();
    
    // Start webcam immediately - always visible
    startWebcam();
    
    // Update play again button text from config
    if (playAgainBtn && config.prompts.english.playAgain) {
        playAgainBtn.textContent = config.prompts.english.playAgain;
    }
    
    // Language link event listeners
    if (englishBtn) {
        englishBtn.addEventListener('click', (e) => {
            e.preventDefault();
            selectedLanguage = 'english';
            englishBtn.classList.add('language-link-selected');
            germanBtn.classList.remove('language-link-selected');
            
            // Automatically go to next page
            setTimeout(() => {
                showPage(page2);
                // Show welcome text
                if (statusEl) statusEl.textContent = 'Spieglein Spieglein an der Wand wer ist die/der/das schönste im ganzen Land';
                
                // Update play again button text
                if (playAgainBtn) {
                    playAgainBtn.textContent = 'PLAY AGAIN';
                }
            }, 300);
        });
    }
    
    if (germanBtn) {
        germanBtn.addEventListener('click', (e) => {
            e.preventDefault();
            selectedLanguage = 'german';
            germanBtn.classList.add('language-link-selected');
            englishBtn.classList.remove('language-link-selected');
            
            // Automatically go to next page
            setTimeout(() => {
                showPage(page2);
                // Show welcome text
                if (statusEl) statusEl.textContent = 'Spieglein Spieglein an der Wand wer ist die/der/das schönste im ganzen Land';
                
                // Update play again button text
                if (playAgainBtn) {
                    playAgainBtn.textContent = 'ERNEUT ABSPIELEN';
                }
            }, 300);
        });
    }
    
    // Page Navigation Functions
    function showPage(pageToShow) {
        // Hide all pages
        if (page1) page1.style.display = 'none';
        if (page2) page2.style.display = 'none';
        if (page3) page3.style.display = 'none';
        if (page4) page4.style.display = 'none';
        
        // Show the requested page
        if (pageToShow) pageToShow.style.display = 'block';
    }
    
    // Navigation Event Listeners - nextToPage2 removed as it's no longer needed
    
    if (nextToPage3) {
        nextToPage3.addEventListener('click', () => {
            showPage(page3);
            
            // Automatically start webcam
            startWebcam();
        });
    }
    
    if (nextToPage4) {
        nextToPage4.addEventListener('click', () => {
            showPage(page4);
            
            // Automatically start the roast process
            processRoast();
        });
    }
    
    // Check if ComfyUI is running
    async function checkComfyUIStatus() {
        try {
            const response = await fetch(`${API_URL}/status`);
            const data = await response.json();
            
            if (data.status !== 'running') {
                if (recordBtn) recordBtn.disabled = true;
                if (playAgainBtn) playAgainBtn.disabled = true;
                if (statusEl) statusEl.textContent = 'Error: ComfyUI is not responding. Make sure it\'s running at http://127.0.0.1:8188/';
            } else {
                // Clear status text on language selection page
                if (statusEl && page1 && page1.style.display !== 'none') {
                    statusEl.textContent = '';
                }
            }
        } catch (error) {
            if (recordBtn) recordBtn.disabled = true;
            if (playAgainBtn) playAgainBtn.disabled = true;
            if (statusEl) statusEl.textContent = 'Error: Cannot connect to server or ComfyUI. Make sure both are running.';
        }
    }
    
    // Record button click handler
    if (recordBtn) {
        recordBtn.addEventListener('click', async () => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                stopRecording();
                return;
            }
            
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                startRecording(stream);
            } catch (error) {
                if (statusEl) statusEl.textContent = `Error accessing microphone: ${error.message}`;
            }
        });
    }
    
    // Start recording
    function startRecording(stream) {
        audioChunks = [];
        recordingTime = 0;
        
        // Setup MediaRecorder
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.addEventListener('dataavailable', event => {
            audioChunks.push(event.data);
        });
        
        mediaRecorder.addEventListener('stop', () => {
            // Use the actual MIME type from the recorder
            const mimeType = mediaRecorder.mimeType || 'audio/webm';
            recordedBlob = new Blob(audioChunks, { type: mimeType });
            
            // Store the audio URL
            const audioURL = URL.createObjectURL(recordedBlob);
            if (sampleAudio) sampleAudio.src = audioURL;
            
            // Enable the next button (in case we need it later)
            if (nextToPage3) nextToPage3.disabled = false;
            
            if (recordingProgress) recordingProgress.style.display = 'none';
            if (recordBtn) {
                recordBtn.textContent = 'START';
                recordBtn.classList.remove('recording');
            }
            
            // Automatically proceed to webcam page after a short delay
            setTimeout(() => {
                showPage(page3);
                // Clear the status text for webcam page
                if (statusEl) statusEl.textContent = '';
                // Automatically start webcam
                startWebcam();
            }, 1000);
        });
        
        // Start recording with timeslice to get data during recording
        mediaRecorder.start(100); // Emit dataavailable event every 100ms
        if (recordBtn) {
            recordBtn.textContent = 'STOP';
            // Don't add recording class to keep it white
        }
        
        if (recordingProgress) {
            recordingProgress.style.display = 'block';
            recordingProgress.style.position = 'absolute';
            recordingProgress.style.bottom = '-100px';
            recordingProgress.style.left = '50%';
            recordingProgress.style.transform = 'translateX(-50%)';
            
            const progressText = document.querySelector('#recordingProgress .progress-text');
            if (progressText) {
                progressText.style.display = 'block';
                progressText.style.textAlign = 'center';
                progressText.style.width = '100%';
                progressText.textContent = selectedLanguage === 'german' ? 'Stimme wird aufgenommen...' : 'Recording your voice...';
            }
        }
        
        // Update progress bar
        recordingInterval = setInterval(() => {
            recordingTime += 0.1;
            const progress = (recordingTime / recordingDuration) * 100;
            if (recordingProgressBar) recordingProgressBar.style.width = `${Math.min(progress, 100)}%`;
            if (recordingProgressText) recordingProgressText.textContent = `${recordingTime.toFixed(1)}s`;
            
            if (recordingTime >= recordingDuration) {
                stopRecording();
            }
        }, 100);
    }
    
    // Stop recording
    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            clearInterval(recordingInterval);
            
            // Stop all audio tracks
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    }
    
    // Upload audio to server
    async function uploadAudio() {
        if (!recordedBlob) {
            throw new Error('No audio recorded');
        }
        
        // Upload to server
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: recordedBlob
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(`Failed to upload audio: ${data.message || response.statusText}`);
        }
        
        return await response.json();
    }
    
    // Generate voice using server API
    async function generateVoice(text, language) {
        const response = await fetch(`${API_URL}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                text,
                language
            })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(`Failed to generate voice: ${data.message || response.statusText}`);
        }
        
        return await response.json();
    }
    
    // Process the roast (called when entering page 4)
    async function processRoast() {
        if (!capturedImage) {
            return;
        }
        
        if (roastingProgress) {
            roastingProgress.style.display = 'block';
            roastingProgress.style.position = 'fixed';
            roastingProgress.style.top = '50%';
            roastingProgress.style.left = '50%';
            roastingProgress.style.transform = 'translate(-50%, -50%)';
            
            const progressText = document.querySelector('#roastingProgress .progress-text');
            if (progressText) {
                progressText.style.display = 'block';
                progressText.style.textAlign = 'center';
                progressText.style.width = '100%';
                progressText.textContent = selectedLanguage === 'german' ? 'Bild wird analysiert...' : 'Analyzing image...';
            }
        }
        
        if (roastingProgressBar) roastingProgressBar.style.width = '10%';
        
        try {
            // Display the captured image in the result page
            const resultImagePreview = document.getElementById('resultImagePreview');
            if (resultImagePreview) {
                resultImagePreview.src = capturedImage;
                resultImagePreview.style.display = 'block';
            }
            
            // Send the image and language preference to the server for roasting
            const response = await fetch(`${API_URL}/roast`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    image: capturedImage,
                    language: selectedLanguage
                })
            });
            
            if (roastingProgressBar) roastingProgressBar.style.width = '90%';
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(`Failed to roast image: ${data.message || response.statusText}`);
            }
            
            const result = await response.json();
            if (roastingProgressBar) roastingProgressBar.style.width = '100%';
            
            if (result && result.success) {
                // Set the text content instead of value for the paragraph element
                if (roastText) roastText.textContent = result.roast;
                
                // Automatically generate voice if voice sample is recorded
                if (recordedBlob) {
                    // Disable the play again button during automatic generation
                    const playAgainBtnElement = document.getElementById('playAgainBtn');
                    if (playAgainBtnElement) playAgainBtnElement.disabled = true;
                    
                    // Call the function to generate voice automatically
                    generateVoiceAndPlay(result.roast.trim());
                }
            } else {
                throw new Error(result.message || 'Failed to generate roast');
            }
        } catch (error) {
            console.error('Error generating roast:', error);
        } finally {
            if (roastingProgress) roastingProgress.style.display = 'none';
        }
    }
    
    // Webcam is started automatically when page3 is shown
    
    async function startWebcam() {
        try {
            // Default webcam resolution
            const idealWidth = 1080;
            const idealHeight = 1920;
            
            webcamStream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: idealWidth },
                    height: { ideal: idealHeight }
                } 
            });
            
            if (webcam) {
                webcam.srcObject = webcamStream;
                webcam.style.display = 'block';
            }
            
            if (webcamBtn) webcamBtn.style.display = 'none';
            
            // Hide image preview if visible
            if (imagePreview) imagePreview.style.display = 'none';
            
            // Wait a moment for the webcam to initialize
            setTimeout(() => {
                startCountdown();
            }, 1500);
            
        } catch (error) {
            console.error('Error accessing webcam:', error);
        }
    }
    
    // Countdown function - only start when on page 3
    function startCountdown() {
        // Only start countdown if we're on page 3
        if (page3 && page3.style.display === 'none') return;
        
        const countdownEl = document.getElementById('countdown');
        if (!countdownEl) return;
        
        // Force display of countdown with inline styles
        countdownEl.style.display = 'flex';
        countdownEl.style.position = 'fixed';
        countdownEl.style.top = '50%';
        countdownEl.style.left = '50%';
        countdownEl.style.transform = 'translate(-50%, -50%)';
        countdownEl.style.zIndex = '9999';
        countdownEl.style.width = '100%';
        countdownEl.style.height = '100%';
        countdownEl.style.justifyContent = 'center';
        countdownEl.style.alignItems = 'center';
        countdownEl.style.fontSize = '12rem';
        countdownEl.style.fontWeight = 'bold';
        countdownEl.style.color = 'white';
        countdownEl.style.textAlign = 'center';
        countdownEl.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        
        // Log to console to verify countdown is being shown
        console.log('Starting countdown, element:', countdownEl);
        
        let count = 5; // 5 seconds countdown
        countdownEl.textContent = count;
        
        const countdownInterval = setInterval(() => {
            count--;
            countdownEl.textContent = count;
            console.log('Countdown:', count);
            
            if (count <= 0) {
                clearInterval(countdownInterval);
                countdownEl.style.display = 'none';
                capturePhoto();
            }
        }, 1000);
    }
    
    // Capture photo function
    function capturePhoto() {
        if (!webcam || !webcam.videoWidth) return;
        
        // Create a canvas element to capture the current video frame
        const canvas = document.createElement('canvas');
        canvas.width = webcam.videoWidth;
        canvas.height = webcam.videoHeight;
        const ctx = canvas.getContext('2d');
        
        // Draw the current video frame on the canvas
        ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
        
        // Convert the canvas to a data URL and set it as the image preview
        capturedImage = canvas.toDataURL('image/jpeg');
        if (imagePreview) {
            imagePreview.src = capturedImage;
            imagePreview.style.display = 'block';
        }
        
        // Stop and hide the webcam after capturing the image
        stopWebcam();
        
        // Automatically proceed to the next page after a short delay
        setTimeout(() => {
            showPage(page4);
            // Clear the status text for results page
            if (statusEl) statusEl.textContent = '';
            processRoast();
            
            // Add mouse move event listener to show/hide text
            document.addEventListener('mousemove', () => {
                const roastTextEl = document.getElementById('roastText');
                if (roastTextEl) {
                    roastTextEl.style.opacity = '1';
                    
                    // Hide text after 3 seconds of no mouse movement
                    clearTimeout(window.textHideTimeout);
                    window.textHideTimeout = setTimeout(() => {
                        roastTextEl.style.opacity = '0';
                    }, 3000); // 3 seconds timeout
                }
            });
        }, 1000);
    }
    
    function stopWebcam() {
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
            webcamStream = null;
            if (webcam) {
                webcam.srcObject = null;
                webcam.style.display = 'none';
            }
            if (webcamBtn) webcamBtn.style.display = 'block';
        }
    }
    
    // Function to update minimal audio player progress
    function updateMinimalProgress() {
        if (generatedAudio && minimalProgressBar) {
            const progress = (generatedAudio.currentTime / generatedAudio.duration) * 100;
            minimalProgressBar.style.width = `${progress}%`;
            
            if (generatedAudio.ended) {
                minimalProgressBar.style.width = '0%';
            } else {
                requestAnimationFrame(updateMinimalProgress);
            }
        }
    }
    
    // Function to generate voice and play it automatically
    async function generateVoiceAndPlay(text) {
        if (!recordedBlob) {
            return;
        }
        
        if (!text || !text.trim()) {
            return;
        }
        
        if (generatingProgress) {
            generatingProgress.style.display = 'block';
            generatingProgress.style.position = 'fixed';
            generatingProgress.style.top = '50%';
            generatingProgress.style.left = '50%';
            generatingProgress.style.transform = 'translate(-50%, -50%)';
            
            const progressText = document.querySelector('#generatingProgress .progress-text');
            if (progressText) {
                progressText.style.display = 'block';
                progressText.style.textAlign = 'center';
                progressText.style.width = '100%';
                progressText.textContent = selectedLanguage === 'german' ? 'Roast wird generiert...' : 'Generating roast...';
            }
        }
        
        if (generatingProgressBar) generatingProgressBar.style.width = '10%';
        
        try {
            // Make sure the audio is uploaded
            await uploadAudio();
            if (generatingProgressBar) generatingProgressBar.style.width = '30%';
            
            // Generate voice with the roast text and language
            const result = await generateVoice(text, selectedLanguage);
            if (generatingProgressBar) generatingProgressBar.style.width = '100%';
            
            if (result && result.success) {
                // Check if audioUrl is valid
                if (typeof result.audioUrl === 'string' && generatedAudio) {
                    generatedAudio.src = result.audioUrl;
                    generatedAudio.load();
                    
                    // Set up minimal player progress updates
                    generatedAudio.addEventListener('play', () => {
                        requestAnimationFrame(updateMinimalProgress);
                    });
                    
                    // Auto-play the generated audio
                    generatedAudio.play().catch(e => {
                        console.log('Auto-play prevented by browser:', e);
                    });
                } else {
                    throw new Error('Invalid audio URL received from server');
                }
            } else {
                throw new Error(result.message || 'Failed to generate voice');
            }
        } catch (error) {
            console.error('Error generating voice:', error);
        } finally {
            const playAgainBtnElement = document.getElementById('playAgainBtn');
            if (playAgainBtnElement) playAgainBtnElement.disabled = false;
            if (generatingProgress) generatingProgress.style.display = 'none';
        }
    }
    
    // Play Again Button Handler
    const playAgainBtnElement = document.getElementById('playAgainBtn');
    if (playAgainBtnElement) {
        playAgainBtnElement.addEventListener('click', () => {
            if (generatedAudio && generatedAudio.src) {
                generatedAudio.currentTime = 0;
                generatedAudio.play().catch(e => {
                    console.log('Auto-play prevented by browser:', e);
                });
            } else if (roastText) {
                // If no audio has been generated yet, generate it
                generateVoiceAndPlay(roastText.textContent.trim());
            }
        });
    }
    
    // Minimal audio player click handler
    const minimalPlayer = document.querySelector('.minimal-progress-container');
    if (minimalPlayer && generatedAudio) {
        minimalPlayer.addEventListener('click', (e) => {
            if (!generatedAudio.src) return;
            
            const rect = minimalPlayer.getBoundingClientRect();
            const clickPosition = (e.clientX - rect.left) / rect.width;
            
            // Set the audio position based on click
            generatedAudio.currentTime = clickPosition * generatedAudio.duration;
            
            // Update the progress bar
            minimalProgressBar.style.width = `${clickPosition * 100}%`;
            
            // Play if paused
            if (generatedAudio.paused) {
                generatedAudio.play();
            }
        });
    }
});
