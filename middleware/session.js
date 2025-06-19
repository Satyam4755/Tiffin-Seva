const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);

const createSession = (dbPath, sessionSecret) => {
    const store = new MongoDBStore({
        uri: dbPath,
        collection: 'sessions'
    });

    return session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: true,
        store: store,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 * 7 //7 days
        }
    });
};

module.exports = createSession;