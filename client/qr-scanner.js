// Simple QR Scanner implementation
class QRScanner {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.context = null;
        this.scanning = false;
        this.stream = null;
        this.onScanCallback = null;
    }

    async startScanning(videoElement, onScan) {
        this.video = videoElement;
        this.onScanCallback = onScan;
        
        try {
            // Request camera access
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment', // Use back camera if available
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
            
            this.video.srcObject = this.stream;
            this.video.play();
            
            // Create canvas for image processing
            this.canvas = document.createElement('canvas');
            this.context = this.canvas.getContext('2d');
            
            this.scanning = true;
            this.scanFrame();
            
            return true;
        } catch (error) {
            console.error('Error accessing camera:', error);
            throw error;
        }
    }

    stopScanning() {
        this.scanning = false;
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        if (this.video) {
            this.video.srcObject = null;
        }
    }

    scanFrame() {
        if (!this.scanning || !this.video) return;

        if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
            // Set canvas size to video size
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;

            // Draw video frame to canvas
            this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

            // Get image data
            const imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
            
            // Try to detect QR code using a simple approach
            this.detectQRCode(imageData);
        }

        // Continue scanning
        if (this.scanning) {
            requestAnimationFrame(() => this.scanFrame());
        }
    }

    detectQRCode(imageData) {
        // This is a simplified QR detection - in a real implementation you'd use a proper QR library
        // For now, we'll use a different approach with the BarcodeDetector API if available
        if ('BarcodeDetector' in window) {
            this.detectWithBarcodeAPI();
        } else {
            // Fallback: Manual URL detection (simplified)
            this.detectWithManualMethod();
        }
    }

    async detectWithBarcodeAPI() {
        try {
            const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
            const barcodes = await barcodeDetector.detect(this.video);
            
            if (barcodes.length > 0) {
                const qrCode = barcodes[0];
                console.log('QR Code detected:', qrCode.rawValue);
                
                // Check if it's a validation URL
                if (qrCode.rawValue.includes('/admin/validate/')) {
                    this.onScanCallback(qrCode.rawValue);
                }
            }
        } catch (error) {
            console.error('Barcode detection error:', error);
        }
    }

    detectWithManualMethod() {
        // Simplified detection - look for high contrast patterns
        // This is a placeholder - real QR detection is complex
        // We'll rely on the BarcodeDetector API or manual input as fallback
    }
}

// Make it available globally
window.QRScanner = QRScanner;