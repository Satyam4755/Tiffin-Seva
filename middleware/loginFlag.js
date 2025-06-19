module.exports = (req, res, next) => {
    req.isLogedIn = req.session.isLogedIn;
    next();
};