// Simple QR Code implementation using QR Server API
window.SimpleQR = {
    toCanvas: function(canvas, text, options, callback) {
        if (!canvas || !text) {
            if (callback) callback(new Error('Canvas or text missing'));
            return;
        }
        
        const size = options && options.width ? options.width : 200;
        
        // Use QR Server API to generate QR code
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
        
        // Create an image element
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = function() {
            // Set canvas size
            canvas.width = size;
            canvas.height = size;
            
            // Get context and draw image
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, size, size);
            
            // Fill with white background if specified
            if (options && options.color && options.color.light) {
                ctx.fillStyle = options.color.light;
                ctx.fillRect(0, 0, size, size);
            }
            
            ctx.drawImage(img, 0, 0, size, size);
            
            if (callback) callback(null);
        };
        
        img.onerror = function() {
            if (callback) callback(new Error('Failed to generate QR code'));
        };
        
        img.src = qrUrl;
    }
};