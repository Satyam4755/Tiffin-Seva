// middlewares/protectUserRoutes.js
module.exports = (req, res, next) => {
    // ✅ Check login
    if (!req.isLogedIn || !req.session.user) {
        return res.redirect('/logIn'); // Not logged in → redirect
    }

    // ✅ Check user type
    if (req.session.user.userType !== 'guest') {
        console.log(req.session.user.userType);
        return res.status(403).render('./partials/errorHandel', {
            errorMessage: ['Access denied: You are not authorized to view this page.']
        });
    }

    // ✅ All good → allow access
    next();
};
