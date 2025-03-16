var mysql = require('mysql')
var connection = mysql.createConnection({
   host: '103.171.180.110',
   user: 'nwints_user',
   password: 'Password786@',
   database: 'nwints_bot'
})

connection.connect(function(err) {
    if (err){ 
        throw err;
    }else{
        console.log('DB connected');
    }
});

module.exports = connection;
