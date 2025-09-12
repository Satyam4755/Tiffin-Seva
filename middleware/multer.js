const multer = require('multer');

const storage = multer.memoryStorage(); // store in memory buffer

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // Max 50 MB per file (bigger for videos)
  },
  fileFilter: (req, file, cb) => {
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png'];
const allowedVideoTypes = [
  'video/mp4',           // .mp4
  'video/webm',          // .webm
  'video/ogg',           // .ogv or .ogg video
  'video/quicktime'      // .mov (Apple QuickTime)
];

    if (allowedImageTypes.includes(file.mimetype) || allowedVideoTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only jpg, jpeg, png, mp4, webm, MOV allowed.'));
    }
  }
});

// ✅ Meal image fields (7 days × 2 meals = 14)
const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const mealTypes = ["lunch", "dinner"];

let mealImageFields = [];
for (const day of days) {
  for (const mealType of mealTypes) {
    mealImageFields.push({ name: `${day}_${mealType}_image`, maxCount: 1 });
  }
}

// ✅ Add other general images/videos also
const multiFileUpload = upload.fields([
  { name: 'image', maxCount: 1 },          // general image
  { name: 'Menuimage', maxCount: 1 },      // menu image
  { name: 'profilePicture', maxCount: 1 }, // user profile pic
  { name: 'bannerImage', maxCount: 1 },    // vendor banner
  { name: 'photos', maxCount: 5 },        // multiple photos for vendor details
  { name: 'video', maxCount: 1 },          // vendor video description
  ...mealImageFields                       // all 14 meal images
]);

module.exports = multiFileUpload;
