const multer = require('multer');

const storage = multer.memoryStorage(); // Store files in memory buffer

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // Max 10MB per file
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
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

// ✅ Add other general images also
const multiFileUpload = upload.fields([
    { name: 'image', maxCount: 1 },          // general image
    { name: 'Menuimage', maxCount: 1 },      // menu image
    { name: 'profilePicture', maxCount: 1 }, // user profile pic
    { name: 'bannerImage', maxCount: 1 },    // vendor banner
    ...mealImageFields                       // all 14 meal images
]);

module.exports = multiFileUpload;
