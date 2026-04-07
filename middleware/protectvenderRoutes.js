// middlewares/protectVenderRoutes.js
module.exports = (req, res, next) => {
    if (!req.isLogedIn || !req.session.user) {
        return res.redirect('/logIn'); // Not logged in → redirect
    }

    if (req.session.user.userType !== 'vender') {
        console.log(req.session.user.userType);
        return res.status(403).render('./partials/errorHandel', {
            errorMessage: ['Access denied: You are not authorized to view this page.']
        });
    }

    next();
};
