// utils/fileUploader.js
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

const fileUploadInCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: options.resource_type || 'auto',
        access_mode: 'public'
      },
      (error, result) => {
        if (result) {
          console.log("File uploaded successfully:", result.secure_url);
          resolve(result);
        } else {
          console.error("Cloudinary upload error:", error);
          reject(error);
        }
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
};

module.exports = { fileUploadInCloudinary };
