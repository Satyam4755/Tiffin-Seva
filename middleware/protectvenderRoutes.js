module.exports = (req, res, next) => {
    if (!req.isLogedIn) {
        return res.redirect('/logIn');
    }
    next();
};