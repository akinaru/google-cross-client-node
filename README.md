# Google cross client


create file config.js :

```
'use strict';

exports.port = process.env.PORT || 4747;
exports.mongodb = {
  uri: process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost:27017/gcrossclient'
};
exports.logFormat=":remote-addr - :remote-user [:date[iso]] \":method :url HTTP/:http-version\" :status :res[content-length] [:user-agent]"
exports.companyName = '';
exports.projectName = 'Google cross client';
exports.systemEmail = 'yourmail@gmail.com';
exports.cryptoKey = 'k3yb0ardc4t';
exports.loginAttempts = {
  forIp: 50,
  forIpAndUser: 7,
  logExpiration: '20m'
};
exports.requireAccountVerification = true;
exports.disableSignUp = true;
exports.smtp = {
  from: {
    name: process.env.SMTP_FROM_NAME || exports.projectName + ' Website',
    address: process.env.SMTP_FROM_ADDRESS || 'yourmail@gmail.com'
  },
  credentials: {
    user: process.env.SMTP_USERNAME || 'yourmail@gmail.com',
    password: process.env.SMTP_PASSWORD || 'password',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    ssl: true
  }
};
exports.gcm = {
  clientId: "your_client_id_here"
};

```

install & start

```
npm install
npm start
```