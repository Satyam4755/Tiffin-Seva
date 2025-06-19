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
    saveUninitialized: false, // ✅ Prevents storing session unless it's modified
    store: store,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 2 // 2 days
    }
  });
};

module.exports = createSession;
