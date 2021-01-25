const mysql = require('mysql');
const mysql2 = require('mysql2');

const cfg = {
  host: '9.134.5.56',
  port: 3306,
  user: 'xnode',
  password: 'xnode168',
  database: 'micro_ldm_online_systems_dev',
  charset: 'utf8',
  // timezone: 'SYSTEM',
  dateStrings: true,
  connectTimeout: 2000,
};

const coreConnection = mysql2.createConnection(cfg);

coreConnection.connect();

coreConnection.query('SELECT * from T_tmp limit 1', function (error, results, fields) {
  if (error) throw error;
  console.log('The solution is: ', results);
});

coreConnection.end();

// coreConnection.once('connect', () => {
//   console.log('on connect +++++++++++++++++++++++++++++++++++++++++++++');
//
// });
// coreConnection.once('error', err => {
//   console.log('on error ++++++++++++++++++++++++++++++++++++++++++++++++');
//
// });
